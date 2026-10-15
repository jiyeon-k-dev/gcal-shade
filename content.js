// 구글 캘린더 주/일/4일 보기의 시간 그리드 컬럼에 배경 밴드를 그린다.
//
// 구글 캘린더 DOM은 클래스명이 난독화되어 있어서 비교적 안정적인 속성만 사용한다.
//  - 날짜 컬럼: [role="gridcell"][data-datekey]
//  - data-datekey 인코딩: ((year - 1970) << 9) | (month << 5) | day
// 시간 그리드 컬럼은 하루 24시간 전체 높이를 가지므로 % 단위로 위치를 잡는다.
(() => {
  const LAYER_CLASS = "gcs-layer";
  const HIDE_CLASS = "gcs-hide-hline";
  let lineColor = null; // 캘린더 원래 가로선 색 (찾으면 채워짐)
  const PAST_CLASS = "gcs-past";
  let rules = [];
  let settings = { ...GCS_DEFAULT_SETTINGS };
  let sig = "";
  let scheduled = false;

  function decodeDateKey(key) {
    const n = Number(key);
    if (!Number.isFinite(n) || n <= 0) return null;
    const day = n & 31;
    const month = (n >> 5) & 15;
    const year = (n >> 9) + 1970;
    if (day < 1 || month < 1 || month > 12) return null;
    return new Date(year, month - 1, day);
  }

  // 하루 안의 [startMin, endMin) 구간 목록. 자정을 넘는 규칙(22:00~02:00)은
  // 당일 22~24 + 다음날 0~2 로 나눈다.
  function isExceptionDate(date) {
    const d = gcsDateStr(date);
    return settings.exceptions.some(
      (x) => x.enabled !== false && x.from && d >= x.from && d <= (x.to || x.from)
    );
  }

  function bandsForDate(date) {
    const dow = date.getDay();
    const prevDow = (dow + 6) % 7;
    const exception = isExceptionDate(date);
    const bands = [];
    for (const r of rules) {
      if (!r.enabled) continue;
      // 예외일(공휴일·휴가)에는 "예외일 적용"이 켜진 규칙을 건너뛴다. 기본값은 적용.
      if (exception && r.skipOnExceptions !== false) continue;
      const s = gcsToMinutes(r.start);
      const e = gcsToMinutes(r.end);
      if (s === e) continue;
      if (s < e) {
        if (r.days.includes(dow)) bands.push({ s, e, r });
      } else {
        if (r.days.includes(dow)) bands.push({ s, e: 1440, r });
        if (r.days.includes(prevDow)) bands.push({ s: 0, e, r });
      }
    }
    return bands;
  }

  function findDayColumns() {
    const cells = document.querySelectorAll('[role="gridcell"][data-datekey]');
    // 헤더/종일 영역의 셀은 낮으므로, 시간 그리드(24시간 높이) 컬럼만 남긴다.
    return [...cells].filter((el) => el.offsetHeight > 300);
  }

  // 컬럼 뒤에 실제로 보이는 배경색 (라이트/다크 모드 대응)
  function backgroundBehind(el) {
    for (let node = el; node instanceof Element; node = node.parentElement) {
      const m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || Number(m[3]) > 0)) return m.slice(0, 3).map(Number);
    }
    return [255, 255, 255];
  }

  // 반투명 밴드는 아래 격자선이 비쳐 보이므로, 배경과 미리 섞은 불투명 색으로 칠한다.
  function solidColor(hex, opacity, bg) {
    const n = parseInt(String(hex).slice(1), 16);
    const fg = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const a = Math.min(1, Math.max(0, opacity ?? 0.18));
    return `rgb(${fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a))).join(",")})`;
  }

  // 배경이 어두우면(다크 모드) 라벨/흐림 색을 밝게 바꾼다.
  function isDark(bg) {
    return bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114 < 128;
  }

  // 시간 가로선은 날짜 컬럼들과 같은 row 안의 aria-hidden 컨테이너(시간별 div 24개)가 그린다.
  //   <div role="row"><div aria-hidden="true">[div x 24]</div> ... <div role="gridcell"> ...
  // 이 컨테이너를 통째로 숨기고, 칠하지 않은 구간에만 레이어가 선을 다시 그린다.
  function hideHourLines(cols) {
    const row = cols[0].parentElement;
    const lines = [...row.children].find(
      (el) => el.getAttribute("aria-hidden") === "true" && el.children.length === 24
    );
    if (!lines) return;
    if (!lineColor) lineColor = detectLineColor(lines.children[1]);
    lines.classList.add(HIDE_CLASS);
  }

  function restoreHourLines() {
    document.querySelectorAll(`.${HIDE_CLASS}`).forEach((el) => el.classList.remove(HIDE_CLASS));
  }

  // 시간 칸의 테두리나 ::before/::after 중 실제로 선을 그리는 쪽의 색을 읽는다.
  function detectLineColor(hourEl) {
    for (const s of [hourEl, "::before", "::after"].map((p) =>
      p === hourEl ? getComputedStyle(hourEl) : getComputedStyle(hourEl, p)
    )) {
      for (const side of ["Top", "Bottom"]) {
        if (parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none") {
          return s[`border${side}Color`];
        }
      }
      if (s.content !== "none" && parseFloat(s.height) <= 2 && !/rgba\(.*, 0\)/.test(s.backgroundColor)) {
        return s.backgroundColor;
      }
    }
    return "rgb(218, 220, 224)"; // 구글 캘린더 기본 선 색
  }

  // 원래 선을 숨겼으니, 칠하지 않은 구간에는 레이어가 직접 시간선을 그린다.
  // 밴드는 불투명이라 칠한 구간에서는 이 선이 가려진다.
  function paintOwnLines(layer) {
    if (!lineColor) return;
    // 매 시 정각 위치에 1px 선
    layer.style.backgroundImage = `linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`;
    layer.style.backgroundSize = "100% calc(100% / 24)";
  }

  function renderColumn(col) {
    const date = decodeDateKey(col.getAttribute("data-datekey"));
    if (!date) return false;
    const colSig = `${col.getAttribute("data-datekey")}|${sig}`;

    let layer = col.querySelector(`:scope > .${LAYER_CLASS}`);
    if (layer && layer.dataset.sig === colSig) return false;
    const created = !layer;

    if (!layer) {
      layer = document.createElement("div");
      layer.className = LAYER_CLASS;
      if (getComputedStyle(col).position === "static") col.style.position = "relative";
      // 첫 자식으로 넣어야 이벤트 칩보다 아래에 그려진다.
      col.prepend(layer);
    }
    layer.dataset.sig = colSig;
    layer.dataset.date = gcsDateStr(date);
    const bg = backgroundBehind(col.parentElement);
    const dark = isDark(bg);
    layer.classList.toggle("gcs-dark", dark);

    const bands = bandsForDate(date).map(({ s, e, r }) => {
      const band = document.createElement("div");
      band.className = "gcs-band";
      band.style.top = `${(s / 1440) * 100}%`;
      band.style.height = `${((e - s) / 1440) * 100}%`;
      band.style.backgroundColor = solidColor(r.color, r.opacity, bg);
      if (r.label) {
        const label = document.createElement("span");
        label.className = "gcs-label";
        label.textContent = r.label;
        band.append(label);
      }
      return band;
    });
    // 지나간 시간 덮개: 밴드·선 위, 일정 칩 아래
    const past = document.createElement("div");
    past.className = PAST_CLASS;
    layer.replaceChildren(...bands, past);
    updatePast(layer);
    return created;
  }

  // 오늘은 현재 시각까지, 지난 날은 하루 전체를 흐리게
  function updatePast(layer) {
    const past = layer.querySelector(`.${PAST_CLASS}`);
    if (!past) return;
    const now = new Date();
    const today = gcsDateStr(now);
    const d = layer.dataset.date;
    let ratio = 0;
    if (settings.dimPast) {
      if (d < today) ratio = 1;
      else if (d === today) ratio = (now.getHours() * 60 + now.getMinutes()) / 1440;
    }
    past.style.height = `${ratio * 100}%`;
  }

  function render() {
    scheduled = false;
    if (!settings.enabled) {
      document.querySelectorAll(`.${LAYER_CLASS}`).forEach((el) => el.remove());
      restoreHourLines();
      return;
    }
    const cols = findDayColumns();
    let created = false;
    for (const col of cols) created = renderColumn(col) || created;
    // 새 주/보기로 DOM이 새로 그려졌을 때만 선을 다시 찾는다.
    if (created && cols.length) {
      hideHourLines(cols);
      document.querySelectorAll(`.${LAYER_CLASS}`).forEach(paintOwnLines);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function update(nextRules, nextSettings) {
    if (nextRules) rules = Array.isArray(nextRules) ? nextRules : [];
    if (nextSettings) settings = { ...GCS_DEFAULT_SETTINGS, ...nextSettings };
    sig = JSON.stringify([rules, settings]);
    schedule();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    update(changes[GCS_STORAGE_KEY]?.newValue, changes[GCS_SETTINGS_KEY]?.newValue);
  });

  // 현재 시각이 흐르므로 1분마다 흐림 영역을 늘린다.
  setInterval(() => document.querySelectorAll(`.${LAYER_CLASS}`).forEach(updatePast), 60 * 1000);

  // 캘린더는 SPA라 주 이동/보기 전환 시 DOM이 통째로 바뀐다.
  new MutationObserver((mutations) => {
    // 우리가 넣은 레이어 변경만으로는 다시 그리지 않는다.
    const external = mutations.some(
      (m) => !(m.target instanceof Element && m.target.closest(`.${LAYER_CLASS}`)) &&
        ![...m.addedNodes].every((n) => n instanceof Element && n.classList.contains(LAYER_CLASS))
    );
    if (external) schedule();
  }).observe(document.body, { childList: true, subtree: true });

  Promise.all([gcsLoadRules(), gcsLoadSettings()]).then(([r, s]) => update(r, s));
})();
