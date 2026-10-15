const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월요일부터 표시

// 색상 프리셋: 구글 캘린더 일정 색과 겹쳐도 잘 보이도록 진하기를 함께 정해둔다.
const PRESETS = [
  { name: "회색 · 업무", color: "#9e9e9e", opacity: 0.25 },
  { name: "베이지", color: "#a79b8e", opacity: 0.2 },
  { name: "남색 · 수면", color: "#3f51b5", opacity: 0.1 },
  { name: "하늘 · 집중", color: "#039be5", opacity: 0.1 },
  { name: "초록 · 운동", color: "#0b8043", opacity: 0.1 },
  { name: "노랑 · 개인", color: "#f6bf26", opacity: 0.18 },
  { name: "분홍 · 약속", color: "#e67c73", opacity: 0.14 },
  { name: "보라 · 공부", color: "#8e24aa", opacity: 0.09 },
];

let rules = [];
let settings = { ...GCS_DEFAULT_SETTINGS };

// ── 저장 ──────────────────────────────────────────────
// storage.sync는 쓰기 횟수 제한이 있어 입력 중엔 모아서 저장한다.
function debounced(fn, ms = 250) {
  let timer = null;
  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    fn();
  };
  const call = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, ms);
  };
  call.flush = flush;
  return call;
}

const saveRules = debounced(() => gcsSaveRules(rules));
const saveSettings = debounced(() => gcsSaveSettings(settings));

// 팝업은 닫히는 순간 페이지가 사라지므로, 대기 중인 저장을 즉시 보낸다.
window.addEventListener("pagehide", () => {
  saveRules.flush();
  saveSettings.flush();
});

// ── 공통 컴포넌트 ─────────────────────────────────────
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// 실제 칠해지는 색은 너무 연해서, 고르는 화면에서는 진하게 보여준다.
function swatchColor(color, opacity) {
  return hexToRgba(color, Math.max(opacity * 2.5, 0.35));
}

// 스위치(체크박스)에 값과 변경 핸들러를 연결
function bindSwitch(input, checked, onChange) {
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
}

// 카드 공통: 머리의 on/off 스위치, 이름 입력, 삭제 버튼
function mountCard(tplId, item, { listId, onChange, onDelete }) {
  const el = document.getElementById(tplId).content.firstElementChild.cloneNode(true);
  const $ = (sel) => el.querySelector(sel);
  const syncDisabled = () => el.classList.toggle("disabled", item.enabled === false);

  bindSwitch($(".card-head .enabled"), item.enabled !== false, (on) => {
    item.enabled = on;
    syncDisabled();
    onChange();
  });
  $(".name").value = item.label || "";
  $(".name").addEventListener("input", (e) => {
    item.label = e.target.value;
    onChange();
  });
  $(".del").addEventListener("click", () => {
    onDelete();
    el.remove();
  });

  syncDisabled();
  document.getElementById(listId).append(el);
  return $;
}

// ── 규칙 카드 ─────────────────────────────────────────
function renderRule(rule) {
  const $ = mountCard("rule-tpl", rule, {
    listId: "rules",
    onChange: saveRules,
    onDelete: () => {
      rules = rules.filter((r) => r !== rule);
      saveRules();
    },
  });

  // 요일 칩
  for (const d of WEEK_ORDER) {
    const btn = document.createElement("button");
    btn.className = "day";
    btn.textContent = DAY_NAMES[d];
    btn.classList.toggle("on", rule.days.includes(d));
    btn.addEventListener("click", () => {
      rule.days = rule.days.includes(d) ? rule.days.filter((x) => x !== d) : [...rule.days, d];
      btn.classList.toggle("on", rule.days.includes(d));
      saveRules();
    });
    $(".days").append(btn);
  }

  // 시간 — time input은 24:00을 못 받으므로 종료 00:00은 자정(24:00)으로 저장
  $(".start").value = rule.start;
  $(".end").value = rule.end === "24:00" ? "00:00" : rule.end;
  $(".start").addEventListener("change", (e) => {
    rule.start = e.target.value;
    saveRules();
  });
  $(".end").addEventListener("change", (e) => {
    rule.end = e.target.value === "00:00" ? "24:00" : e.target.value;
    saveRules();
  });

  // 색: 프리셋 + 직접 선택
  const presetBtns = PRESETS.map((p) => {
    const btn = document.createElement("button");
    btn.className = "preset";
    btn.title = p.name;
    btn.style.background = swatchColor(p.color, p.opacity);
    btn.addEventListener("click", () => {
      rule.color = p.color;
      rule.opacity = p.opacity;
      syncColor();
      saveRules();
    });
    $(".colors").append(btn);
    return { btn, p };
  });

  const custom = document.createElement("label");
  custom.className = "custom";
  custom.title = "직접 선택";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.addEventListener("input", (e) => {
    rule.color = e.target.value;
    syncColor();
    saveRules();
  });
  custom.append(picker);
  $(".colors").append(custom);

  const opacity = $(".opacity");
  opacity.addEventListener("input", (e) => {
    rule.opacity = Number(e.target.value);
    syncColor();
    saveRules();
  });

  function syncColor() {
    const hit = PRESETS.find((p) => p.color === rule.color && p.opacity === rule.opacity);
    presetBtns.forEach(({ btn, p }) => btn.classList.toggle("active", p === hit));
    // 프리셋과 다르면 "직접 선택" 동그라미가 현재 색을 보여준다.
    custom.classList.toggle("active", !hit);
    custom.style.backgroundColor = hit ? "" : swatchColor(rule.color, rule.opacity);
    picker.value = rule.color;
    opacity.value = rule.opacity;
    $(".pct").textContent = `${Math.round(rule.opacity * 100)}%`;
  }
  syncColor();

  bindSwitch($(".skip-exc"), rule.skipOnExceptions !== false, (on) => {
    rule.skipOnExceptions = on;
    saveRules();
  });
}

// ── 예외 카드 ─────────────────────────────────────────
function renderException(exc) {
  const $ = mountCard("exc-tpl", exc, {
    listId: "exceptions",
    onChange: saveSettings,
    onDelete: () => {
      settings.exceptions = settings.exceptions.filter((x) => x !== exc);
      saveSettings();
    },
  });

  $(".from").value = exc.from || "";
  $(".to").value = exc.to || "";
  $(".from").addEventListener("change", (e) => {
    exc.from = e.target.value;
    // 종료일이 비었거나 시작일보다 앞이면 하루짜리로 맞춘다.
    if (!exc.to || exc.to < exc.from) $(".to").value = exc.to = exc.from;
    saveSettings();
  });
  $(".to").addEventListener("change", (e) => {
    exc.to = e.target.value;
    saveSettings();
  });
}

// ── 추가 버튼 ─────────────────────────────────────────
document.getElementById("add-rule").addEventListener("click", () => {
  const { color, opacity } = PRESETS[0];
  const rule = {
    id: crypto.randomUUID(),
    enabled: true,
    label: "",
    days: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "18:00",
    color,
    opacity,
    skipOnExceptions: true,
  };
  rules.push(rule);
  saveRules();
  renderRule(rule);
});

document.getElementById("add-exc").addEventListener("click", () => {
  const today = gcsDateStr(new Date());
  const exc = { id: crypto.randomUUID(), enabled: true, from: today, to: today, label: "" };
  settings.exceptions = [...settings.exceptions, exc];
  saveSettings();
  renderException(exc);
});

// ── 초기화 ────────────────────────────────────────────
Promise.all([gcsLoadRules(), gcsLoadSettings()]).then(([loadedRules, loadedSettings]) => {
  rules = loadedRules;
  settings = loadedSettings;

  const syncOff = () => document.body.classList.toggle("off", !settings.enabled);
  bindSwitch(document.getElementById("enabled"), settings.enabled, (on) => {
    settings.enabled = on;
    syncOff();
    saveSettings();
  });
  bindSwitch(document.getElementById("dimPast"), settings.dimPast, (on) => {
    settings.dimPast = on;
    saveSettings();
  });
  syncOff();

  rules.forEach(renderRule);
  settings.exceptions.forEach(renderException);
  requestAnimationFrame(() => document.body.classList.remove("preload"));
});
