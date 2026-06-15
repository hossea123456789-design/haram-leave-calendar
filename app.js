const STORAGE_KEY = 'wifeLeaveCalendar.attendanceJson.v2';
const API_URL_STORAGE_KEY = 'wifeLeaveCalendar.googleScriptUrl.v2';
const WRITE_TOKEN_STORAGE_KEY = 'wifeLeaveCalendar.writeToken.v2';

// GitHub Pages에 올리기 전 Apps Script /exec URL을 여기에 넣으면
// 와이프 휴대폰에서도 별도 설정 없이 자동으로 Google Sheets 최신 데이터를 불러옵니다.
const CONFIG = {
  SHEETS_API_URL: 'https://script.google.com/macros/s/AKfycbwgpvNOTMZQppKmLdYBj_238uGSN4fHlRGu1__5yth-oxl4rhc7zF5bS-magPk-weSM1w/exec',
  AUTO_LOAD_FROM_SHEETS: true,
};

const state = {
  data: null,
  lastSyncAt: null,
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
}

function hydrateSettings() {
  els.scriptUrlInput.value = localStorage.getItem(API_URL_STORAGE_KEY) || CONFIG.SHEETS_API_URL || '';
  els.writeTokenInput.value = localStorage.getItem(WRITE_TOKEN_STORAGE_KEY) || '';
  updateSyncStatus(getApiUrl() ? 'Apps Script URL이 설정되어 있습니다.' : 'Apps Script URL을 입력하면 Google Sheets와 연동됩니다.');
}

function saveSettings() {
  const url = els.scriptUrlInput.value.trim();
  const token = els.writeTokenInput.value.trim();

  if (url) localStorage.setItem(API_URL_STORAGE_KEY, url);
  else localStorage.removeItem(API_URL_STORAGE_KEY);

  if (token) localStorage.setItem(WRITE_TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(WRITE_TOKEN_STORAGE_KEY);

  updateSyncStatus(url ? '연동 설정을 저장했습니다.' : 'Apps Script URL이 비어 있습니다.', !url);
  showToast('연동 설정 저장 완료');
}

function getApiUrl() {
  return (els.scriptUrlInput?.value || localStorage.getItem(API_URL_STORAGE_KEY) || CONFIG.SHEETS_API_URL || '').trim();
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
    showToast('Google Sheets 저장 완료');
    setImportResult(buildImportMessage(data, 'Google Sheets에 저장했습니다.'));
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

function showEmpty() {
  els.emptyState.classList.remove('hidden');
  els.dashboard.classList.add('hidden');
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
  const leave = normalizeTime(item.leave);
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

  return { date, weekday, type, target, start, nonWork, leave, label };
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
  return { leaveCount, offCount, missingWorkInfo, allBusinessDaysMissing };
}

function isOffDay(item) {
  return ['weekend', 'holiday', 'vacation'].includes(item.type);
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
  const startOffset = (first.getDay() + 6) % 7;
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
  const monday = getWeekMonday(today);
  const itemByDate = new Map(data.items.map((item) => [item.date, item]));

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
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

  updateSyncStatus('Google Sheets에서 최신 데이터를 불러오는 중입니다...');
  try {
    const response = await jsonpRequest(apiUrl, { action: 'load' });
    if (!response || response.ok === false) throw new Error(response?.error || '시트 응답이 올바르지 않습니다.');
    if (!response.data) {
      updateSyncStatus('Google Sheets에 저장된 근태 JSON이 없습니다.', true);
      if (!state.data) showEmpty();
      return null;
    }
    const normalized = normalizeAttendance(response.data);
    state.lastSyncAt = new Date();
    applyData(normalized, { save: true, source: 'Google Sheets' });
    updateSyncStatus(`Google Sheets 최신 데이터 불러오기 완료 · ${formatDateTime(state.lastSyncAt.toISOString())}`);
    if (!options.silent) showToast('시트에서 불러왔습니다');
    return normalized;
  } catch (error) {
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

  updateSyncStatus('Google Sheets에 저장하는 중입니다...');
  try {
    const payload = encodeBase64Url(JSON.stringify(data));
    const response = await jsonpRequest(apiUrl, { action: 'save', token, payload });
    if (!response || response.ok === false) throw new Error(response?.error || '저장 응답이 올바르지 않습니다.');
    state.lastSyncAt = new Date();
    updateSyncStatus(`Google Sheets 저장 완료 · ${formatDateTime(state.lastSyncAt.toISOString())}`);
    return true;
  } catch (error) {
    updateSyncStatus(`시트 저장 실패: ${error.message}`, true);
    showToast('시트 저장 실패');
    return false;
  }
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
      reject(new Error('스크립트 로드에 실패했습니다. Apps Script 배포 URL을 확인해 주세요.'));
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

function getWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
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
