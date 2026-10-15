// content script와 설정 페이지가 함께 쓰는 기본값/유틸
const GCS_STORAGE_KEY = "gcsRules";

const GCS_DEFAULT_RULES = [
  {
    id: "default-work",
    enabled: true,
    label: "업무",
    days: [1, 2, 3, 4, 5], // 0=일 ... 6=토
    start: "09:00",
    end: "19:00",
    color: "#9e9e9e",
    opacity: 0.18,
  },
];

// "HH:MM" -> 분 (24:00 허용)
function gcsToMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return Math.min(24 * 60, Math.max(0, (h || 0) * 60 + (m || 0)));
}

function gcsLoadRules() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [GCS_STORAGE_KEY]: GCS_DEFAULT_RULES }, (res) =>
      resolve(res[GCS_STORAGE_KEY] || [])
    );
  });
}

function gcsSaveRules(rules) {
  return new Promise((resolve) =>
    chrome.storage.sync.set({ [GCS_STORAGE_KEY]: rules }, resolve)
  );
}

// 규칙 외 전역 설정
const GCS_SETTINGS_KEY = "gcsSettings";

const GCS_DEFAULT_SETTINGS = {
  enabled: true, // 전체 켜기/끄기
  dimPast: true, // 지나간 시간 흐리게
  // 예외 기간: 이 날짜들에는 "예외일 적용"이 켜진 규칙을 칠하지 않는다.
  exceptions: [], // [{ id, enabled, from: "YYYY-MM-DD", to: "YYYY-MM-DD", label }]
};

function gcsLoadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [GCS_SETTINGS_KEY]: {} }, (res) =>
      resolve({ ...GCS_DEFAULT_SETTINGS, ...res[GCS_SETTINGS_KEY] })
    );
  });
}

function gcsSaveSettings(settings) {
  return new Promise((resolve) =>
    chrome.storage.sync.set({ [GCS_SETTINGS_KEY]: settings }, resolve)
  );
}

// Date -> "YYYY-MM-DD" (로컬 기준)
function gcsDateStr(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
