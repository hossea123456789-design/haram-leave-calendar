const APP_VERSION = 'v0.12';
const STORAGE_KEY = 'wifeLeaveCalendar.attendanceJson.v5';
const API_URL_STORAGE_KEY = 'wifeLeaveCalendar.googleScriptUrl.v2';
const WRITE_TOKEN_STORAGE_KEY = 'wifeLeaveCalendar.writeToken.v2';
const CACHE_RESET_VERSION_KEY = 'wifeLeaveCalendar.cacheResetVersion';
const CACHE_RESET_VERSION = '20260615-v012';
const LEGACY_API_URL_KEYS = [
  'wifeLeaveCalendar.googleScriptUrl',
  'wifeLeaveCalendar.googleScriptUrl.v1',
  'wifeLeaveCalendar.googleScriptUrl.v2',
  'wifeLeaveCalendar.scriptUrl',
  'wifeLeaveCalendar.appsScriptUrl',
];
const LEGACY_BAD_URL_FRAGMENTS = [
  'AKfycbwgpvNOTMZQppKmLdYBj_238uGSN4fHIRGu1__5yth-oxl4rhc/exec',
  'AKfycbwgpvNOTMZQppKmLdYBj_238uGSN4fHlRGu1__5yth-oxl4rhc/exec',
];

// 기본 Apps Script /exec URL입니다.
// 보기 전용 기기에서는 관리자 설정 없이 이 주소로 Google Sheets 최신 데이터를 불러옵니다.
// v0.9부터는 브라우저 localStorage에 남아 있는 과거 URL보다 이 기본 URL을 우선합니다.
const DEFAULT_SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbwgpvNOTMZQppKmLdYBj_238uGSN4fHlRGu1__5yth-oxl4rhc7zF5bS-magPk-weSM1w/exec';

const CONFIG = {
  SHEETS_API_URL: DEFAULT_SHEETS_API_URL,
  AUTO_LOAD_FROM_SHEETS: true,
};

const state = {
  data: null,
  lastSyncAt: null,
};

const loadingState = {
  timer: null,
  hideTimer: null,
  startedAt: 0,
  value: 0,
  percent: 0,
  label: '구글 스프레드시트 DB 불러오는 중',
};

const els = {};

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`필수 DOM 누락: #${id}`);
  return el;
}

window.addEventListener('DOMContentLoaded', init);

function init() {
  collectElements();
  bindEvents();
  resetStaleBrowserState();
  hydrateSettings();

  const saved = loadLocalData();
  if (saved) {
    applyData(saved, { save: false, source: '브라우저 저장 데이터' });
  } else {
    showEmpty();
  }

  if (CONFIG.AUTO_LOAD_FROM_SHEETS && getApiUrl()) {
    loadFromSheets({ silent: true });
  }
}

function collectElements() {
  Object.assign(els, {
    refreshBtn: byId('refreshBtn'),
    toggleAdminBtn: byId('toggleAdminBtn'),
    closeAdminBtn: byId('closeAdminBtn'),
    adminPanel: byId('adminPanel'),
    scriptUrlInput: byId('scriptUrlInput'),
    writeTokenInput: byId('writeTokenInput'),
    saveSettingsBtn: byId('saveSettingsBtn'),
    loadSheetsBtn: byId('loadSheetsBtn'),
    clearLocalBtn: byId('clearLocalBtn'),
    syncStatus: byId('syncStatus'),
    jsonInput: byId('jsonInput'),
    previewJsonBtn: byId('previewJsonBtn'),
    saveJsonBtn: byId('saveJsonBtn'),
    clearInputBtn: byId('clearInputBtn'),
    importResult: byId('importResult'),
    emptyState: byId('emptyState'),
    dashboard: byId('dashboard'),
    todayLeave: byId('todayLeave'),
    todayDetail: byId('todayDetail'),
    todayBadge: byId('todayBadge'),
    monthSummaryText: byId('monthSummaryText'),
    leaveCountText: byId('leaveCountText'),
    missingCountText: byId('missingCountText'),
    updatedAtText: byId('updatedAtText'),
    diagnostics: byId('diagnostics'),
    monthTitle: byId('monthTitle'),
    calendarGrid: byId('calendarGrid'),
    weekList: byId('weekList'),
    rawJson: byId('rawJson'),
    heroSyncToast: byId('heroSyncToast'),
    heroSyncText: byId('heroSyncText'),
    heroSyncPercent: byId('heroSyncPercent'),
    heroSyncBar: byId('heroSyncBar'),
    toast: byId('toast'),
  });
}

function bindEvents() {
  els.toggleAdminBtn.addEventListener('click', () => {
    els.adminPanel.classList.toggle('hidden');
    if (!els.adminPanel.classList.contains('hidden')) {
      setTimeout(() => els.scriptUrlInput.focus(), 0);
    }
  });

  els.closeAdminBtn.addEventListener('click', () => els.adminPanel.classList.add('hidden'));
  els.refreshBtn.addEventListener('click', () => loadFromSheets({ silent: false }));
  els.saveSettingsBtn.addEventListener('click', saveSettings);
  els.loadSheetsBtn.addEventListener('click', () => loadFromSheets({ silent: false }));
  els.clearLocalBtn.addEventListener('click', clearLocalData);
  els.previewJsonBtn.addEventListener('click', previewJson);
  els.saveJsonBtn.addEventListener('click', saveJsonToSheets);
  els.clearInputBtn.addEventListener('click', () => {
    els.jsonInput.value = '';
    setImportResult('입력창을 비웠습니다.');
  });

  // 기존 JSON을 지우고 다시 붙여넣는 번거로움을 없애기 위해,
  // 붙여넣기 시 입력창 내용을 항상 새 JSON으로 통째로 교체합니다.
  els.jsonInput.addEventListener('paste', handleJsonInputPaste);
  els.jsonInput.addEventListener('focus', () => {
    if (els.jsonInput.value.trim()) {
      window.setTimeout(() => els.jsonInput.select(), 0);
    }
  });
}


function resetStaleBrowserState() {
  const current = localStorage.getItem(CACHE_RESET_VERSION_KEY);
  const defaultUrl = normalizeApiUrl(DEFAULT_SHEETS_API_URL);
  const removedKeys = [];

  // v011부터는 삼성/모바일 브라우저 등에 남아 있던 과거 DB URL을 강제로 제거합니다.
  // 근태 데이터 캐시는 유지하고, DB 연결 설정만 최신 기본 URL 기준으로 재정렬합니다.
  LEGACY_API_URL_KEYS.forEach((key) => {
    const value = localStorage.getItem(key);
    if (!value) return;
    const normalized = normalizeApiUrl(value);
    const isWrong = normalized !== defaultUrl || LEGACY_BAD_URL_FRAGMENTS.some((fragment) => normalized.includes(fragment));
    if (isWrong || current !== CACHE_RESET_VERSION) {
      localStorage.removeItem(key);
      removedKeys.push(key);
    }
  });

  if (defaultUrl) {
    localStorage.setItem(API_URL_STORAGE_KEY, defaultUrl);
  }
  localStorage.setItem(CACHE_RESET_VERSION_KEY, CACHE_RESET_VERSION);

  // 혹시 과거 버전에서 Cache API나 service worker가 생겼더라도 정리합니다.
  // 현재 앱은 service worker를 쓰지 않지만, 삼성 브라우저 캐시 꼬임 방지용 안전장치입니다.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {});
  }
  if ('caches' in window) {
    caches.keys()
      .then((keys) => keys.filter((key) => key.includes('wife') || key.includes('leave') || key.includes('calendar')).forEach((key) => caches.delete(key)))
      .catch(() => {});
  }

  if (removedKeys.length > 0) {
    window.setTimeout(() => {
      updateSyncStatus('이 브라우저에 남아 있던 이전 DB 주소 캐시를 정리하고 기본 주소로 교체했습니다.');
      showToast('이전 DB 주소 캐시 정리 완료');
    }, 0);
  }
}

function handleJsonInputPaste(event) {
  const text = event.clipboardData?.getData('text/plain') || '';
  if (!text) return;
  event.preventDefault();
  els.jsonInput.value = text.trim();
  setImportResult('새 JSON으로 입력창을 교체했습니다. 이제 바로 미리보기 또는 시트 저장을 누르면 됩니다.');
}


function hydrateSettings() {
  const defaultUrl = normalizeApiUrl(CONFIG.SHEETS_API_URL || '');
  const storedUrl = normalizeApiUrl(localStorage.getItem(API_URL_STORAGE_KEY) || '');
  const hadStaleStoredUrl = Boolean(defaultUrl && storedUrl && storedUrl !== defaultUrl);

  // 삼성 브라우저처럼 이전 설정이 남아 있는 브라우저에서
  // 잘못된 과거 Apps Script URL이 기본 URL을 덮어쓰지 않도록 정리합니다.
  if (hadStaleStoredUrl) {
    localStorage.removeItem(API_URL_STORAGE_KEY);
  }

  els.scriptUrlInput.value = defaultUrl || storedUrl || '';
  els.writeTokenInput.value = localStorage.getItem(WRITE_TOKEN_STORAGE_KEY) || '';

  if (hadStaleStoredUrl) {
    updateSyncStatus('이 브라우저에 남아 있던 이전 Apps Script URL을 기본 URL로 자동 교체했습니다.');
    showToast('이전 DB 주소를 기본 주소로 교체했습니다');
    return;
  }

  updateSyncStatus(getApiUrl() ? 'Apps Script URL이 설정되어 있습니다.' : 'Apps Script URL을 입력하면 Google Sheets와 연동됩니다.');
}

function saveSettings() {
  const url = normalizeApiUrl(els.scriptUrlInput.value.trim());
  const token = els.writeTokenInput.value.trim();

  if (url) {
    localStorage.setItem(API_URL_STORAGE_KEY, url);
    els.scriptUrlInput.value = url;
  } else {
    localStorage.removeItem(API_URL_STORAGE_KEY);
  }

  if (token) localStorage.setItem(WRITE_TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(WRITE_TOKEN_STORAGE_KEY);

  updateSyncStatus(url ? '연동 설정을 저장했습니다.' : 'Apps Script URL이 비어 있습니다.', !url);
  showToast('연동 설정 저장 완료');
}

function getApiUrl() {
  const defaultUrl = normalizeApiUrl(CONFIG.SHEETS_API_URL || '');

  // 보기 전용 모바일에서는 관리자 설정을 입력하지 않습니다.
  // 따라서 기본 배포 URL을 최우선으로 사용합니다.
  // 과거에 저장된 잘못된 URL은 여기서도 한 번 더 무시/정리합니다.
  if (defaultUrl) {
    const storedUrl = normalizeApiUrl(localStorage.getItem(API_URL_STORAGE_KEY) || '');
    if (storedUrl && storedUrl !== defaultUrl) {
      localStorage.removeItem(API_URL_STORAGE_KEY);
    }
    if (els.scriptUrlInput && normalizeApiUrl(els.scriptUrlInput.value) !== defaultUrl) {
      els.scriptUrlInput.value = defaultUrl;
    }
    return defaultUrl;
  }

  const raw = (els.scriptUrlInput?.value || localStorage.getItem(API_URL_STORAGE_KEY) || '').trim();
  return normalizeApiUrl(raw);
}

function normalizeApiUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  if (/\/exec(?:[?#].*)?$/.test(url)) return url;
  if (/\/dev(?:[?#].*)?$/.test(url)) return url.replace(/\/dev([?#].*)?$/, '/exec');
  const match = url.match(/^(https:\/\/script\.google\.com\/macros\/s\/[^/?#]+)(?:[/?#].*)?$/);
  if (match) return `${match[1]}/exec`;
  return url;
}

function getWriteToken() {
  return (els.writeTokenInput?.value || localStorage.getItem(WRITE_TOKEN_STORAGE_KEY) || '').trim();
}

function updateSyncStatus(message, isError = false) {
  els.syncStatus.textContent = message;
  els.syncStatus.classList.toggle('error', Boolean(isError));
}

function parseInputJson() {
  const raw = els.jsonInput.value.trim();
  if (!raw) {
    setImportResult('붙여넣은 JSON이 없습니다.', true);
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeAttendance(parsed);
    const validation = validateAttendance(normalized);
    if (!validation.ok) {
      setImportResult(validation.messages.join('<br>'), true);
      return null;
    }
    return normalized;
  } catch (error) {
    setImportResult(`JSON 파싱 실패: ${escapeHtml(error.message)}`, true);
    return null;
  }
}

function previewJson() {
  const data = parseInputJson();
  if (!data) return;
  applyData(data, { save: true, source: '붙여넣기 미리보기' });
  setImportResult(buildImportMessage(data, '화면에 미리보기로 반영했습니다. 시트 저장은 아직 하지 않았습니다.'));
  showToast('화면에 반영했습니다');
}

async function saveJsonToSheets() {
  const data = parseInputJson();
  if (!data) return;

  applyData(data, { save: true, source: '붙여넣기' });
  setImportResult(buildImportMessage(data, '화면에 반영했습니다. Google Sheets 저장을 시도합니다.'));

  const saved = await saveToSheets(data);
  if (saved) {
    els.jsonInput.value = '';
    showToast('Google Sheets 저장 완료');
    setImportResult(buildImportMessage(data, 'Google Sheets에 저장했습니다. 입력창은 다음 붙여넣기를 위해 비웠습니다.'));
  }
}

function loadLocalData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeAttendance(JSON.parse(raw));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function clearLocalData() {
  localStorage.removeItem(STORAGE_KEY);
  state.data = null;
  els.jsonInput.value = '';
  setImportResult('브라우저에 저장된 근태 데이터를 삭제했습니다.');
  showEmpty();
  showToast('브라우저 저장 삭제 완료');
}

function applyData(data, options = {}) {
  const normalized = normalizeAttendance(data);
  state.data = normalized;

  if (options.save) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  render(normalized);
  updateSyncStatus(`${options.source || '데이터'} 반영 완료 · ${formatDateTime(new Date().toISOString())}`);
}

function showEmpty(message = null) {
  els.emptyState.classList.remove('hidden');
  els.dashboard.classList.add('hidden');
  const p = els.emptyState.querySelector('p');
  if (p && message) p.textContent = message;
}

function showDashboard() {
  els.emptyState.classList.add('hidden');
  els.dashboard.classList.remove('hidden');
}

function normalizeAttendance(input) {
  const year = Number(input.year);
  const month = Number(input.month);
  const items = Array.isArray(input.items) ? input.items : [];

  return {
    source: input.source || 'work_attendance_calendar',
    version: Number(input.version || 1),
    exportedAt: input.exportedAt || null,
    year,
    month,
    items: items.map((item) => normalizeItem(item, year, month)).filter(Boolean),
  };
}

function normalizeItem(item, year, month) {
  if (!item || typeof item !== 'object') return null;
  const date = String(item.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const weekday = item.weekday || getKoreanWeekday(date);
  const label = cleanNullable(item.label);
  const target = normalizeTime(item.target);
  const start = normalizeTime(item.start);
  const nonWork = normalizeTime(item.nonWork);
  const leaveRaw = normalizeTime(item.leave);
  const leaveKindRaw = cleanNullable(item.leaveKind) || 'unknown';
  const leaveSourceRaw = cleanNullable(item.leaveSource) || 'unknown';
  let leave = leaveRaw;
  let leaveKind = leaveKindRaw;
  let leaveSource = leaveSourceRaw;
  let leaveCorrection = null;
  const computedPlannedLeave = computePlannedLeave({ start, target, nonWork });
  let type = String(item.type || '').trim().toLowerCase();

  if (!['work', 'vacation', 'holiday', 'weekend', 'empty'].includes(type)) {
    if (label && /휴가|연차|반차/.test(label)) type = 'vacation';
    else if (label && /주말/.test(label)) type = 'weekend';
    else if (label) type = 'holiday';
    else if (leave || start || target) type = 'work';
    else type = 'empty';
  }

  const [y, m] = date.split('-').map(Number);
  if (year && month && (y !== year || m !== month)) return null;

  if (type === 'work' && leaveKind === 'planned' && computedPlannedLeave && leave !== computedPlannedLeave && leaveSource !== 'dom') {
    leaveCorrection = {
      reason: 'planned_leave_recomputed_from_start_target_nonwork_break',
      originalLeave: leave,
      computedLeave: computedPlannedLeave,
      rule: 'start + target + nonWork + 60min',
    };
    leave = computedPlannedLeave;
    leaveSource = 'computed';
  }

  if (isNonWorkType(type)) {
    // 휴가/공휴일/주말은 근무 상세가 섞여 들어오더라도 퇴근 표시에는 쓰지 않습니다.
    leave = null;
    if (type !== 'vacation') {
      // 공휴일/주말의 00:00 target/nonWork는 근무 정보가 아니라 기본값인 경우가 많습니다.
      return { date, weekday, type, target: null, start: null, nonWork: null, leave, leaveKind: 'none', leaveSource: 'none', label, leaveCorrection };
    }
    return { date, weekday, type, target, start: null, nonWork: null, leave, leaveKind: 'none', leaveSource: 'none', label, leaveCorrection };
  }

  return { date, weekday, type, target, start, nonWork, leave, leaveKind, leaveSource, label, leaveCorrection };
}

function normalizeTime(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 29 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  const time = normalizeTime(value);
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToClock(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return null;
  const dayMinutes = 24 * 60;
  const normalized = ((Math.round(totalMinutes) % dayMinutes) + dayMinutes) % dayMinutes;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function computePlannedLeave(item) {
  const startMinutes = timeToMinutes(item.start);
  const targetMinutes = timeToMinutes(item.target);
  const nonWorkMinutes = timeToMinutes(item.nonWork) || 0;
  if (startMinutes === null || targetMinutes === null) return null;
  if (targetMinutes <= 0) return null;
  // 근태 페이지의 계획 퇴근 표시는 출근 + 목표근무 + 비업무 + 기본 휴게 1시간 기준으로 맞습니다.
  return minutesToClock(startMinutes + targetMinutes + nonWorkMinutes + 60);
}

function isNonWorkType(type) {
  return ['vacation', 'holiday', 'weekend'].includes(type);
}

function cleanNullable(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function validateAttendance(data) {
  const messages = [];
  if (!Number.isInteger(data.year) || data.year < 2000 || data.year > 2100) messages.push('year 값이 올바르지 않습니다.');
  if (!Number.isInteger(data.month) || data.month < 1 || data.month > 12) messages.push('month 값이 올바르지 않습니다.');
  if (!Array.isArray(data.items) || data.items.length === 0) messages.push('items 배열이 비어 있습니다.');
  return { ok: messages.length === 0, messages };
}

function render(data) {
  showDashboard();
  const stats = getStats(data);
  const monthText = `${data.year}년 ${data.month}월`;

  els.monthTitle.textContent = monthText;
  els.monthSummaryText.textContent = monthText;
  els.leaveCountText.textContent = `${stats.leaveCount}일`;
  els.missingCountText.textContent = `${stats.missingWorkInfo.length}일`;
  els.updatedAtText.textContent = data.exportedAt ? formatDateTime(data.exportedAt) : '-';
  els.rawJson.textContent = JSON.stringify(data, null, 2);

  renderToday(data);
  renderCalendar(data);
  renderWeek(data);
  renderDiagnostics(data, stats);
}

function getStats(data) {
  const leaveCount = data.items.filter((item) => item.leave).length;
  const offCount = data.items.filter(isOffDay).length;
  const missingWorkInfo = data.items.filter((item) => isPotentialWorkday(item) && !item.leave);
  const allBusinessDaysMissing = data.items.filter((item) => isBusinessWeekday(item) && !isOffDay(item)).every((item) => !item.leave && !item.start && !item.target);
  const correctedPlannedLeave = data.items.filter((item) => item.leaveCorrection);
  return { leaveCount, offCount, missingWorkInfo, allBusinessDaysMissing, correctedPlannedLeave };
}

function isOffDay(item) {
  return isNonWorkType(item.type);
}

function isBusinessWeekday(item) {
  return !['토', '일'].includes(item.weekday);
}

function isPotentialWorkday(item) {
  return isBusinessWeekday(item) && !isOffDay(item);
}

function renderToday(data) {
  const todayKey = toDateKey(new Date());
  const today = data.items.find((item) => item.date === todayKey);

  if (!today) {
    els.todayLeave.textContent = '-';
    els.todayDetail.textContent = `${todayKey} 데이터가 현재 JSON에 없습니다.`;
    setBadge(els.todayBadge, 'unknown', '정보 없음');
    return;
  }

  const status = getItemStatus(today);
  els.todayLeave.textContent = getMainText(today);
  els.todayDetail.textContent = buildDetailText(today);
  setBadge(els.todayBadge, status.key, status.label);
}

function renderCalendar(data) {
  els.calendarGrid.innerHTML = '';
  const itemByDate = new Map(data.items.map((item) => [item.date, item]));
  const first = new Date(data.year, data.month - 1, 1);
  const lastDate = new Date(data.year, data.month, 0).getDate();
  // 일요일 시작 달력: getDay()는 일=0, 월=1, ... 토=6 이므로 그대로 사용합니다.
  const startOffset = first.getDay();
  const todayKey = toDateKey(new Date());

  for (let i = 0; i < startOffset; i += 1) {
    const blank = document.createElement('div');
    blank.className = 'day-card blank';
    els.calendarGrid.appendChild(blank);
  }

  for (let day = 1; day <= lastDate; day += 1) {
    const date = `${data.year}-${String(data.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const item = itemByDate.get(date) || {
      date,
      weekday: getKoreanWeekday(date),
      type: 'empty',
      target: null,
      start: null,
      nonWork: null,
      leave: null,
      label: null,
    };
    const status = getItemStatus(item);
    const card = document.createElement('article');
    card.className = `day-card ${date === todayKey ? 'today' : ''}`;
    card.innerHTML = `
      <div class="day-head">
        <span class="day-num">${day}</span>
        <span class="day-weekday">${escapeHtml(item.weekday)}</span>
      </div>
      <div class="leave-time ${status.key}">${escapeHtml(getMainText(item))}</div>
      <div class="day-meta">${escapeHtml(buildDetailText(item))}</div>
    `;
    els.calendarGrid.appendChild(card);
  }
}

function renderWeek(data) {
  els.weekList.innerHTML = '';
  const today = new Date();
  const weekStart = getWeekSunday(today);
  const itemByDate = new Map(data.items.map((item) => [item.date, item]));

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const date = toDateKey(d);
    const fallback = { date, weekday: getKoreanWeekday(date), type: 'empty', target: null, start: null, nonWork: null, leave: null, label: null };
    const item = itemByDate.get(date) || fallback;
    const status = getItemStatus(item);

    const row = document.createElement('div');
    row.className = 'week-row';
    row.innerHTML = `
      <div class="week-date">${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} ${escapeHtml(item.weekday)}</div>
      <div>
        <div class="week-main">${escapeHtml(getMainText(item))}</div>
        <div class="week-meta">${escapeHtml(buildDetailText(item))}</div>
      </div>
      <div class="status-badge ${status.key}">${escapeHtml(status.label)}</div>
    `;
    els.weekList.appendChild(row);
  }
}

function renderDiagnostics(data, stats) {
  const messages = [];
  if (stats.allBusinessDaysMissing) {
    messages.push('현재 JSON은 날짜/주말/공휴일 구조만 들어왔고, 평일의 목표·출근·퇴근 값이 추출되지 않은 상태입니다. 크롬 확장 쪽에서 leave 값이 들어오도록 보완해야 합니다.');
  }
  if (stats.missingWorkInfo.length > 0) {
    const sample = stats.missingWorkInfo.slice(0, 8).map((item) => item.date).join(', ');
    messages.push(`퇴근 시간이 비어 있는 평일이 ${stats.missingWorkInfo.length}일 있습니다. 예: ${sample}${stats.missingWorkInfo.length > 8 ? ' ...' : ''}`);
  }
  if (stats.correctedPlannedLeave.length > 0) {
    const sample = stats.correctedPlannedLeave
      .slice(0, 8)
      .map((item) => `${item.date} ${item.leaveCorrection.originalLeave || '없음'}→${item.leaveCorrection.computedLeave}`)
      .join(', ');
    messages.push(`확장 JSON의 planned leave가 시작+목표+비업무+휴게 1시간 기준과 맞지 않아 ${stats.correctedPlannedLeave.length}건을 화면에서 보정했습니다. 예: ${sample}${stats.correctedPlannedLeave.length > 8 ? ' ...' : ''}`);
  }
  if (data.items.length < new Date(data.year, data.month, 0).getDate()) {
    messages.push('해당 월의 일부 날짜가 items에 없습니다. 없는 날짜는 화면에서 “정보 없음”으로 표시됩니다.');
  }

  if (!messages.length) {
    els.diagnostics.classList.add('hidden');
    els.diagnostics.innerHTML = '';
    return;
  }

  els.diagnostics.classList.remove('hidden');
  els.diagnostics.innerHTML = `<strong>데이터 확인 필요</strong><ul>${messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
}

function getItemStatus(item) {
  if (isOffDay(item)) return { key: 'off', label: item.label || offTypeLabel(item.type) };
  if (!item.leave) return { key: 'unknown', label: '정보 없음' };
  const [hour] = item.leave.split(':').map(Number);
  if (item.leave === '00:00' || hour < 6) return { key: 'midnight', label: '익일 퇴근' };
  if (hour >= 22) return { key: 'midnight', label: '야근' };
  if (hour >= 20) return { key: 'late', label: '늦은 퇴근' };
  return { key: 'normal', label: '보통' };
}

function offTypeLabel(type) {
  if (type === 'vacation') return '휴가';
  if (type === 'holiday') return '공휴일';
  if (type === 'weekend') return '주말';
  return '휴무';
}

function getMainText(item) {
  if (item.leave) return item.leave;
  if (isOffDay(item)) return item.label || offTypeLabel(item.type);
  return '정보 없음';
}

function buildDetailText(item) {
  if (isOffDay(item)) return item.label || offTypeLabel(item.type);
  const parts = [];
  if (item.start) parts.push(`출근 ${item.start}`);
  if (item.target) parts.push(`목표 ${item.target}`);
  if (item.nonWork) parts.push(`비업무 ${item.nonWork}`);
  if (item.leaveCorrection) parts.push('퇴근 보정');
  if (!parts.length) return '근무 정보 없음';
  return parts.join(' · ');
}

function setBadge(el, key, label) {
  el.className = `status-badge ${key}`;
  el.textContent = label;
}

function buildImportMessage(data, prefix) {
  const stats = getStats(data);
  return `${escapeHtml(prefix)}<br><strong>${data.year}년 ${data.month}월</strong> · 전체 ${data.items.length}일 · 퇴근 ${stats.leaveCount}일 · 정보 없음 ${stats.missingWorkInfo.length}일`;
}

function setImportResult(message, isError = false) {
  els.importResult.innerHTML = message;
  els.importResult.classList.toggle('error', Boolean(isError));
}

async function loadFromSheets(options = {}) {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    updateSyncStatus('Apps Script Web App URL이 필요합니다.', true);
    if (!options.silent) showToast('Apps Script URL을 먼저 설정해 주세요');
    return null;
  }

  const loading = startLoadingProgress('구글 스프레드시트 DB 불러오는 중');
  updateSyncStatus('Google Sheets에서 최신 데이터를 불러오는 중입니다...');
  try {
    const response = await requestSheets(apiUrl, { action: 'load' });
    if (!response || response.ok === false) throw new Error(response?.error || '시트 응답이 올바르지 않습니다.');
    if (!response.data) {
      const detail = response && response.diagnostic ? ` · ${response.diagnostic}` : '';
      finishLoadingProgress(loading, `구글 스프레드시트 DB는 연결됐지만 유효한 근태 JSON이 없습니다${detail}`, true);
      updateSyncStatus(`Google Sheets에서 유효한 근태 JSON을 찾지 못했습니다${detail}`, true);
      if (!state.data) showEmpty('시트에는 연결됐지만 유효한 근태 JSON 행을 찾지 못했습니다. 관리자 기기에서 JSON을 다시 저장해 주세요.');
      return null;
    }
    const normalized = normalizeAttendance(response.data);
    state.lastSyncAt = new Date();
    applyData(normalized, { save: true, source: 'Google Sheets' });
    finishLoadingProgress(loading, '구글 스프레드시트 DB 불러오기 완료');
    updateSyncStatus(`Google Sheets 최신 데이터 불러오기 완료 · ${formatDateTime(state.lastSyncAt.toISOString())}`);
    if (!options.silent) showToast('시트에서 불러왔습니다');
    return normalized;
  } catch (error) {
    finishLoadingProgress(loading, `구글 스프레드시트 DB 불러오기 실패: ${error.message}`, true);
    updateSyncStatus(`시트 불러오기 실패: ${error.message}`, true);
    if (!options.silent) showToast('시트 불러오기 실패');
    return null;
  }
}

async function saveToSheets(data) {
  const apiUrl = getApiUrl();
  const token = getWriteToken();

  if (!apiUrl) {
    updateSyncStatus('저장 실패: Apps Script URL이 필요합니다.', true);
    showToast('Apps Script URL이 필요합니다');
    return false;
  }
  if (!token) {
    updateSyncStatus('저장 실패: WRITE_TOKEN이 필요합니다.', true);
    showToast('WRITE_TOKEN이 필요합니다');
    return false;
  }

  const loading = startLoadingProgress('구글 스프레드시트 DB 저장 중');
  updateSyncStatus('Google Sheets에 저장하는 중입니다...');
  try {
    const payload = encodeBase64Url(JSON.stringify(data));

    // JSONP GET 저장은 전체 JSON이 URL에 실려 길이 제한으로 실패할 수 있습니다.
    // 저장은 숨김 form POST로 보내고, 짧은 JSONP load로 저장 여부를 확인합니다.
    await postFormToSheets(apiUrl, { action: 'save', token, payload });
    await delay(900);

    const loaded = await requestSheets(apiUrl, { action: 'load' });
    if (!loaded || loaded.ok === false) throw new Error(loaded?.error || '저장 후 확인 응답이 올바르지 않습니다.');
    if (!loaded.data) throw new Error('저장 후 Google Sheets에서 데이터를 다시 읽지 못했습니다.');

    const savedExportedAt = String(loaded.data.exportedAt || '');
    const currentExportedAt = String(data.exportedAt || '');
    const savedMonth = `${loaded.data.year}-${loaded.data.month}`;
    const currentMonth = `${data.year}-${data.month}`;

    if (currentExportedAt && savedExportedAt !== currentExportedAt) {
      throw new Error(`저장 확인 실패: 시트 최신 데이터가 방금 저장한 JSON이 아닙니다. 최신 exportedAt=${savedExportedAt || '없음'}`);
    }
    if (savedMonth !== currentMonth) {
      throw new Error(`저장 확인 실패: 시트 최신 월(${savedMonth})이 현재 JSON(${currentMonth})과 다릅니다.`);
    }

    state.lastSyncAt = new Date();
    const normalized = normalizeAttendance(loaded.data);
    applyData(normalized, { save: true, source: 'Google Sheets 저장 확인' });
    finishLoadingProgress(loading, '구글 스프레드시트 DB 저장 완료');
    updateSyncStatus(`Google Sheets 저장 완료 · ${formatDateTime(state.lastSyncAt.toISOString())}`);
    return true;
  } catch (error) {
    finishLoadingProgress(loading, `구글 스프레드시트 DB 저장 실패: ${error.message}`, true);
    updateSyncStatus(`시트 저장 실패: ${error.message}`, true);
    showToast('시트 저장 실패');
    return false;
  }
}

function postFormToSheets(apiUrl, fields) {
  return new Promise((resolve, reject) => {
    const frameName = `wifeLeaveCalendarPost_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const iframe = document.createElement('iframe');
    const form = document.createElement('form');
    let submitted = false;

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('저장 요청 시간이 초과되었습니다. Apps Script 배포/권한을 확인해 주세요.'));
    }, 30000);

    function cleanup() {
      window.clearTimeout(timeout);
      form.remove();
      iframe.remove();
    }

    iframe.name = frameName;
    iframe.style.display = 'none';
    iframe.onload = () => {
      if (!submitted) return;
      cleanup();
      resolve(true);
    };

    form.method = 'POST';
    form.action = apiUrl;
    form.target = frameName;
    form.style.display = 'none';

    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    submitted = true;
    form.submit();
  });
}

function startLoadingProgress(label) {
  window.clearInterval(loadingState.timer);
  window.clearTimeout(loadingState.hideTimer);
  loadingState.startedAt = Date.now();
  loadingState.percent = 0;
  loadingState.label = label;

  els.heroSyncToast.classList.remove('hidden', 'error', 'done');
  els.heroSyncToast.setAttribute('data-visible', 'true');
  updateLoadingProgress(0);

  loadingState.timer = window.setInterval(() => {
    if (loadingState.percent >= 94) return;
    const remaining = 95 - loadingState.percent;
    const step = Math.max(1, Math.min(7, Math.ceil(remaining * 0.1)));
    updateLoadingProgress(Math.min(95, loadingState.percent + step));
  }, 140);

  return { active: true, label, startedAt: loadingState.startedAt };
}

function updateLoadingProgress(percent) {
  loadingState.percent = Math.max(0, Math.min(100, Math.round(percent)));
  const text = `${loadingState.label} . . . ${loadingState.percent}%`;
  els.heroSyncText.textContent = text;
  els.heroSyncPercent.textContent = `${loadingState.percent}%`;
  els.heroSyncBar.style.width = `${loadingState.percent}%`;
}

function finishLoadingProgress(handle, message, isError = false) {
  if (!handle?.active) return;
  window.clearInterval(loadingState.timer);
  updateLoadingProgress(isError ? Math.max(loadingState.percent, 100) : 100);

  const elapsed = Date.now() - (handle.startedAt || loadingState.startedAt || Date.now());
  const minVisibleMs = 900;
  const finishDelay = Math.max(0, minVisibleMs - elapsed);
  const holdAfterFinishMs = isError ? 5200 : 2600;

  window.clearTimeout(loadingState.hideTimer);
  loadingState.hideTimer = window.setTimeout(() => {
    els.heroSyncText.textContent = message;
    els.heroSyncPercent.textContent = isError ? '오류' : '완료';
    els.heroSyncToast.classList.toggle('error', Boolean(isError));
    els.heroSyncToast.classList.toggle('done', !isError);

    loadingState.hideTimer = window.setTimeout(() => {
      els.heroSyncToast.classList.add('hidden');
      els.heroSyncToast.removeAttribute('data-visible');
      els.heroSyncToast.classList.remove('error', 'done');
    }, holdAfterFinishMs);
  }, finishDelay);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}


async function requestSheets(baseUrl, params = {}) {
  try {
    return await jsonpRequest(baseUrl, params);
  } catch (firstError) {
    updateSyncStatus(`JSONP 로드 실패. 모바일 브라우저 호환 방식으로 재시도합니다. (${firstError.message})`, true);
    try {
      return await iframeBridgeRequest(baseUrl, params, firstError);
    } catch (secondError) {
      const message = `스크립트 로드 실패: ${secondError.message || firstError.message}. Code.gs v012 배포, Apps Script URL, 브라우저 콘텐츠 차단 설정을 확인해 주세요.`;
      throw new Error(message);
    }
  }
}

function iframeBridgeRequest(baseUrl, params = {}, firstError = null) {
  return new Promise((resolve, reject) => {
    const requestId = `wifeLeaveCalendarFrame_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const iframe = document.createElement('iframe');
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`iframe 브리지 응답 시간이 초과되었습니다${firstError ? ` / 1차 오류: ${firstError.message}` : ''}`));
    }, 26000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      iframe.remove();
    }

    function onMessage(event) {
      const data = event.data;
      if (!data || data.source !== 'wifeLeaveCalendarSheetsBridge' || data.requestId !== requestId) return;
      cleanup();
      if (data.error) reject(new Error(data.error));
      else resolve(data.payload);
    }

    window.addEventListener('message', onMessage);

    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    url.searchParams.set('action', 'frame');
    url.searchParams.set('op', String(params.action || 'load'));
    url.searchParams.set('requestId', requestId);
    url.searchParams.set('_', String(Date.now()));

    iframe.style.display = 'none';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.onerror = () => {
      cleanup();
      reject(new Error('iframe 브리지 로드에 실패했습니다.'));
    };
    iframe.src = url.toString();
    document.body.appendChild(iframe);
  });
}

function jsonpRequest(baseUrl, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `wifeLeaveCalendarJsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('응답 시간이 초과되었습니다.'));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', String(Date.now()));

    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP 스크립트 로드에 실패했습니다. 모바일 브라우저/콘텐츠 차단 또는 Apps Script URL 문제일 수 있습니다.'));
    };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getKoreanWeekday(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
}

function getWeekSunday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.add('hidden'), 2200);
}
