const TIMER_ALARM_NAME = 'tomatoTimer';

const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartNext: false,
  notificationEnabled: true,
  soundEnabled: true,
  openAlarmPage: true,
  theme: 'light'
};

// Phase labels using i18n
function getPhaseLabel(phase) {
  if (phase === 'shortBreak') return i18n('phase_short_break');
  if (phase === 'longBreak') return i18n('phase_long_break');
  return i18n('phase_focus');
}

// Phase status using i18n
function getPhaseStatus(phase) {
  if (phase === 'shortBreak') return i18n('status_short_break');
  if (phase === 'longBreak') return i18n('status_long_break');
  return i18n('status_focus');
}

const timeDisplay = document.getElementById('timeDisplay');
const minutesInput = document.getElementById('minutesInput');
const taskInput = document.getElementById('taskInput');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const phaseLabel = document.getElementById('phaseLabel');
const cycleText = document.getElementById('cycleText');
const progressCircle = document.getElementById('progressCircle');
const timeInputSection = document.getElementById('timeInputSection');
const quickBtns = document.querySelectorAll('.quick-btn');
const todayPomodorosEl = document.getElementById('todayPomodoros');
const todayMinutesEl = document.getElementById('todayMinutes');
const weekMinutesEl = document.getElementById('weekMinutes');
const openOptionsBtn = document.getElementById('openOptionsBtn');
const openStatsBtn = document.getElementById('openStatsBtn');
const openTasksBtn = document.getElementById('openTasksBtn');
const openAchievementsBtn = document.getElementById('openAchievementsBtn');
const exportBtn = document.getElementById('exportBtn');

let settings = { ...DEFAULT_SETTINGS };
let timerState = null;
let history = [];
let tickerId = null;

const circleRadius = 88;
const circumference = 2 * Math.PI * circleRadius;
progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function clearTimerAlarm() {
  return new Promise((resolve) => chrome.alarms.clear(TIMER_ALARM_NAME, resolve));
}

function createTimerAlarm(whenMs) {
  chrome.alarms.create(TIMER_ALARM_NAME, { when: whenMs });
}

function mergeSettings(rawSettings) {
  return { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
}

function getPhaseDurationSeconds(phase) {
  if (phase === 'shortBreak') return settings.shortBreakMinutes * 60;
  if (phase === 'longBreak') return settings.longBreakMinutes * 60;
  return settings.focusMinutes * 60;
}

function getDefaultTimerState() {
  const totalSeconds = getPhaseDurationSeconds('focus');
  return {
    phase: 'focus',
    totalSeconds,
    remainingSeconds: totalSeconds,
    isRunning: false,
    isPaused: false,
    endTime: null,
    completedFocusCount: 0,
    currentTask: '',
    currentTaskId: null
  };
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function currentRemainingSeconds() {
  if (!timerState) return 0;
  if (timerState.isRunning && !timerState.isPaused && timerState.endTime) {
    return Math.max(0, Math.ceil((timerState.endTime - Date.now()) / 1000));
  }
  return Math.max(0, timerState.remainingSeconds || 0);
}

function updateQuickButtons(minutes) {
  quickBtns.forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.time) === Number(minutes));
    // Update button text with i18n
    btn.textContent = i18n('btn_minutes', [btn.dataset.time]);
  });
}

function updateProgress(remainingSeconds) {
  const total = Math.max(1, timerState?.totalSeconds || 1);
  const progress = (total - remainingSeconds) / total;
  const offset = circumference * progress;
  progressCircle.style.strokeDashoffset = offset;
}

function getStatusText() {
  if (!timerState) return i18n('status_ready');
  if (timerState.isRunning && !timerState.isPaused) {
    return getPhaseStatus(timerState.phase) || i18n('status_timing');
  }
  if (timerState.isPaused) return i18n('status_paused');
  if ((timerState.remainingSeconds || 0) === (timerState.totalSeconds || 0)) return i18n('status_ready');
  return i18n('status_waiting');
}

function renderStats() {
  const today = new Date();
  const y = today.getFullYear();
  const m = `${today.getMonth() + 1}`.padStart(2, '0');
  const d = `${today.getDate()}`.padStart(2, '0');
  const todayKey = `${y}-${m}-${d}`;

  const todayItems = history.filter((item) => {
    if (!item || item.phase !== 'focus' || !item.completedAt) return false;
    const completedDate = new Date(item.completedAt);
    const cy = completedDate.getFullYear();
    const cm = `${completedDate.getMonth() + 1}`.padStart(2, '0');
    const cd = `${completedDate.getDate()}`.padStart(2, '0');
    return `${cy}-${cm}-${cd}` === todayKey;
  });

  const minutes = todayItems.reduce((sum, item) => sum + (item.minutes || 0), 0);
  const sevenDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
  const weekMinutes = history
    .filter((item) => {
      if (!item || item.phase !== 'focus' || !item.completedAt) return false;
      const time = new Date(item.completedAt).getTime();
      return Number.isFinite(time) && time >= sevenDaysAgo;
    })
    .reduce((sum, item) => sum + (item.minutes || 0), 0);

  todayPomodorosEl.textContent = `${todayItems.length}`;
  todayMinutesEl.textContent = `${minutes}`;
  weekMinutesEl.textContent = `${weekMinutes}`;
}

function render() {
  if (!timerState) {
    return;
  }

  const remaining = currentRemainingSeconds();
  timeDisplay.textContent = formatTime(remaining);
  updateProgress(remaining);

  phaseLabel.textContent = getPhaseLabel(timerState.phase);
  const isBreak = timerState.phase !== 'focus';
  phaseLabel.classList.toggle('break', isBreak);
  progressCircle.style.stroke = isBreak ? '#4CAF50' : '#007AFF';

  cycleText.textContent = i18n('cycles_completed', [timerState.completedFocusCount || 0]);
  statusEl.textContent = getStatusText();

  const editableFocus = timerState.phase === 'focus' && !timerState.isRunning && !timerState.isPaused;
  timeInputSection.classList.toggle('hidden', !editableFocus);

  if (!timerState.isRunning || timerState.isPaused) {
    startBtn.style.display = 'flex';
    pauseBtn.style.display = 'none';
    startBtn.querySelector('span:last-child').textContent = timerState.isPaused ? i18n('btn_resume') : i18n('btn_start');
  } else {
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'flex';
  }

  const disableTaskInput = timerState.phase !== 'focus' || (timerState.isRunning && !timerState.isPaused);
  if (disableTaskInput) {
    taskInput.disabled = true;
    taskInput.placeholder = timerState.phase === 'focus' ? i18n('task_edit_disabled_focus') : i18n('task_edit_disabled_break');
  } else {
    taskInput.disabled = false;
    taskInput.placeholder = i18n('placeholder_task');
  }

  if (timerState.phase === 'focus' && !timerState.isRunning && !timerState.isPaused) {
    minutesInput.value = Math.max(1, Math.floor((timerState.totalSeconds || 1500) / 60));
    updateQuickButtons(minutesInput.value);
  }

  if (timerState.phase === 'focus') {
    taskInput.value = timerState.currentTask || '';
  }

  renderStats();
}

function exportHistoryCSV() {
  const headers = ['completedAt', 'phase', 'minutes', 'task'];
  const rows = history
    .filter((item) => item && item.phase === 'focus')
    .map((item) => [
      item.completedAt || '',
      item.phase || '',
      item.minutes || 0,
      (item.task || '').replace(/"/g, '""')
    ]);

  const csv = [
    headers.join(','),
    ...rows.map((cols) => `"${cols[0]}","${cols[1]}","${cols[2]}","${cols[3]}"`)
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date();
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');

  link.href = url;
  link.download = `pomodoro-history-${y}${m}${d}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportHistoryJSON() {
  const date = new Date();
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');

  const data = {
    exportDate: new Date().toISOString(),
    version: '2.0.0',
    totalPomodoros: history.filter(h => h && h.phase === 'focus').length,
    totalMinutes: history.filter(h => h && h.phase === 'focus').reduce((sum, h) => sum + (h.minutes || 0), 0),
    history: history.filter(h => h && h.phase === 'focus')
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `pomodoro-history-${y}${m}${d}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function startTicker() {
  if (tickerId) clearInterval(tickerId);
  tickerId = setInterval(() => {
    if (!timerState) return;
    if (timerState.isRunning && !timerState.isPaused) {
      render();
    }
  }, 1000);
}

async function saveTimerState(nextState) {
  timerState = nextState;
  await setStorage({ timerState });
  render();
}

async function loadState() {
  const result = await getStorage(['settings', 'timerState', 'history']);
  settings = mergeSettings(result.settings);
  history = Array.isArray(result.history) ? result.history : [];
  timerState = result.timerState || getDefaultTimerState();

  // Apply theme
  const theme = settings.theme || 'light';
  document.documentElement.setAttribute('data-theme', theme);

  if (!result.timerState) {
    await setStorage({ settings, timerState, history });
  }

  // Initialize i18n and apply translations
  await initI18n();
  applyI18nToDocument();

  // Update quick buttons text
  updateQuickButtons(minutesInput.value);

  render();
  startTicker();
}

async function startTimer() {
  if (!timerState) return;

  if (timerState.isRunning && !timerState.isPaused) {
    return;
  }

  const nextState = { ...timerState };

  if (nextState.phase === 'focus' && !nextState.isPaused) {
    let mins = parseInt(minutesInput.value, 10);
    if (Number.isNaN(mins)) mins = settings.focusMinutes;
    mins = Math.min(120, Math.max(1, mins));
    const newDuration = mins * 60;
    nextState.totalSeconds = newDuration;
    nextState.remainingSeconds = newDuration;
    settings.focusMinutes = mins;
    await setStorage({ settings });
  }

  if (nextState.phase === 'focus') {
    nextState.currentTask = taskInput.value.trim();
  }

  const remaining = nextState.isPaused
    ? nextState.remainingSeconds
    : nextState.totalSeconds;

  nextState.remainingSeconds = remaining;
  nextState.isRunning = true;
  nextState.isPaused = false;
  nextState.endTime = Date.now() + remaining * 1000;

  createTimerAlarm(nextState.endTime);
  await saveTimerState(nextState);
}

async function pauseTimer() {
  if (!timerState || !timerState.isRunning) return;

  await clearTimerAlarm();

  const remaining = currentRemainingSeconds();
  const nextState = {
    ...timerState,
    isRunning: true,
    isPaused: true,
    remainingSeconds: remaining,
    endTime: null
  };

  await saveTimerState(nextState);
}

async function resetTimer() {
  if (!timerState) return;

  await clearTimerAlarm();

  const totalSeconds = getPhaseDurationSeconds('focus');
  const nextState = {
    ...timerState,
    phase: 'focus',
    totalSeconds,
    remainingSeconds: totalSeconds,
    isRunning: false,
    isPaused: false,
    endTime: null,
    completedFocusCount: 0,
    currentTask: ''
  };

  await saveTimerState(nextState);
}

startBtn.addEventListener('click', () => {
  startTimer().catch((err) => console.error(i18n('error_start_timer'), err));
});

pauseBtn.addEventListener('click', () => {
  pauseTimer().catch((err) => console.error(i18n('error_pause_timer'), err));
});

resetBtn.addEventListener('click', () => {
  resetTimer().catch((err) => console.error(i18n('error_reset_timer'), err));
});

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

openStatsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') });
});

openTasksBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('tasks.html') });
});

openAchievementsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('achievements.html') });
});

// Export dropdown toggle
const exportMenu = document.getElementById('exportMenu');
exportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exportMenu.classList.toggle('active');
});

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  exportMenu.classList.remove('active');
});

// Export menu items
document.querySelectorAll('.export-menu-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const format = item.dataset.format;
    if (format === 'csv') {
      exportHistoryCSV();
    } else if (format === 'json') {
      exportHistoryJSON();
    }
    exportMenu.classList.remove('active');
  });
});

minutesInput.addEventListener('change', () => {
  let value = parseInt(minutesInput.value, 10);
  if (Number.isNaN(value)) value = settings.focusMinutes;
  value = Math.max(1, Math.min(120, value));
  minutesInput.value = value;
  updateQuickButtons(value);
});

quickBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const value = parseInt(btn.dataset.time, 10);
    minutesInput.value = value;
    updateQuickButtons(value);
  });
});

taskInput.addEventListener('change', async () => {
  if (!timerState || timerState.phase !== 'focus' || timerState.isRunning) {
    return;
  }
  const nextState = { ...timerState, currentTask: taskInput.value.trim() };
  await saveTimerState(nextState);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.settings) {
    settings = mergeSettings(changes.settings.newValue);
  }
  if (changes.timerState) {
    timerState = changes.timerState.newValue;
  }
  if (changes.history) {
    history = Array.isArray(changes.history.newValue) ? changes.history.newValue : [];
  }

  render();
});

document.addEventListener('DOMContentLoaded', () => {
  loadState().catch((err) => console.error(i18n('error_load_state'), err));
});
