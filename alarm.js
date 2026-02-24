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

// Quotes with i18n
function getQuotes() {
  return [
    { textKey: 'quote_1', authorKey: 'quote_author_anon' },
    { textKey: 'quote_2', authorKey: 'quote_author_anon' },
    { textKey: 'quote_3', authorKey: 'quote_author_anon' },
    { textKey: 'quote_4', authorKey: 'quote_author_anon' },
    { textKey: 'quote_5', authorKey: 'quote_author_5' },
    { textKey: 'quote_6', authorKey: 'quote_author_6' },
    { textKey: 'quote_7', authorKey: 'quote_author_7' },
    { textKey: 'quote_8', authorKey: 'quote_author_8' }
  ];
}

const subtitle = document.getElementById('subtitle');
const nextStepText = document.getElementById('nextStepText');
const nextBtnText = document.getElementById('nextBtnText');
const quoteText = document.getElementById('quoteText');
const quoteAuthor = document.querySelector('.quote-author');
const nextBtn = document.getElementById('nextBtn');
const extendBtn = document.getElementById('extendBtn');
const skipBtn = document.getElementById('skipBtn');
const closeBtn = document.getElementById('closeBtn');

let settings = { ...DEFAULT_SETTINGS };
let timerState = null;
let lastCompletion = null;

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function getSyncStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function setStorage(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function mergeSettings(rawSettings) {
  return { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
}

function phaseLabel(phase) {
  if (phase === 'shortBreak') return i18n('phase_short_break');
  if (phase === 'longBreak') return i18n('phase_long_break');
  return i18n('phase_focus');
}

function getPhaseDurationSeconds(phase) {
  if (phase === 'shortBreak') return settings.shortBreakMinutes * 60;
  if (phase === 'longBreak') return settings.longBreakMinutes * 60;
  return settings.focusMinutes * 60;
}

function createTimerAlarm(whenMs) {
  chrome.alarms.create(TIMER_ALARM_NAME, { when: whenMs });
}

function selectRandomQuote() {
  const quotes = getQuotes();
  const item = quotes[Math.floor(Math.random() * quotes.length)];
  quoteText.textContent = i18n(item.textKey);
  quoteAuthor.textContent = `— ${i18n(item.authorKey)}`;
}

function showCompletionInfo() {
  if (!lastCompletion) {
    subtitle.textContent = i18n('alarm_phase_ended');
    nextStepText.textContent = i18n('alarm_start_directly');
    nextBtnText.textContent = i18n('btn_start_focus');
    skipBtn.classList.add('hidden');
    return;
  }

  const completed = phaseLabel(lastCompletion.completedPhase);
  const next = phaseLabel(lastCompletion.nextPhase);

  if (lastCompletion.completedPhase === 'focus') {
    subtitle.textContent = i18n('alarm_focus_complete');
    nextBtnText.textContent = i18n('btn_start_phase', [next]);
    nextStepText.textContent = i18n('alarm_next_phase_suggestion', [completed, next]);
    skipBtn.classList.remove('hidden');
  } else {
    subtitle.textContent = i18n('alarm_break_complete');
    nextBtnText.textContent = i18n('btn_start_focus');
    nextStepText.textContent = i18n('alarm_break_complete_suggestion');
    skipBtn.classList.add('hidden');
  }

  if (lastCompletion.autoStarted || (timerState && timerState.isRunning && !timerState.isPaused)) {
    nextStepText.textContent = i18n('alarm_auto_continue');
    nextBtn.disabled = true;
    skipBtn.classList.add('hidden');
  }
}

async function startPhase(phase, durationSeconds, task) {
  const nextState = {
    ...(timerState || {}),
    phase,
    totalSeconds: durationSeconds,
    remainingSeconds: durationSeconds,
    isRunning: true,
    isPaused: false,
    endTime: Date.now() + durationSeconds * 1000,
    currentTask: task || ''
  };

  timerState = nextState;
  createTimerAlarm(nextState.endTime);

  await setStorage({
    timerState: nextState,
    lastCompletion: null
  });
}

async function handleStartNext() {
  if (nextBtn.disabled) {
    window.close();
    return;
  }

  const phase = lastCompletion?.nextPhase || 'focus';
  const duration = lastCompletion?.nextDurationSeconds || getPhaseDurationSeconds(phase);
  const task = phase === 'focus' ? '' : (lastCompletion?.completedTask || timerState?.currentTask || '');

  await startPhase(phase, duration, task);
  window.close();
}

async function handleExtend() {
  const phase = lastCompletion?.completedPhase || 'focus';
  const task = phase === 'focus' ? (lastCompletion?.completedTask || timerState?.currentTask || '') : '';
  await startPhase(phase, 5 * 60, task);
  window.close();
}

async function handleSkipBreak() {
  // Re-read settings to ensure we have the latest values
  const result = await getStorage(['settings']);
  const syncResult = await getSyncStorage(['settings']);
  settings = mergeSettings(result.settings || syncResult.settings);

  await startPhase('focus', getPhaseDurationSeconds('focus'), '');
  window.close();
}

function playAlarmSound() {
  if (!settings.soundEnabled) return;

  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [800, 1000];

    notes.forEach((freq, idx) => {
      const t = audioContext.currentTime + idx * 0.6;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.24, t);
      gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.45);

      oscillator.start(t);
      oscillator.stop(t + 0.45);
    });
  } catch (err) {
    console.log('Audio not supported', err);
  }
}

async function initialize() {
  const result = await getStorage(['settings', 'timerState', 'lastCompletion']);
  const syncResult = await getSyncStorage(['settings']);

  // Merge settings: local > sync > defaults
  settings = mergeSettings(result.settings || syncResult.settings);
  timerState = result.timerState || null;
  lastCompletion = result.lastCompletion || null;

  // Apply theme
  const theme = settings.theme || 'light';
  document.documentElement.setAttribute('data-theme', theme);

  // Initialize i18n and apply translations
  await initI18n();
  applyI18nToDocument();

  selectRandomQuote();
  showCompletionInfo();

  document.addEventListener('click', playAlarmSound, { once: true });
}

nextBtn.addEventListener('click', () => {
  handleStartNext().catch((err) => console.error(i18n('error_start_next'), err));
});

extendBtn.addEventListener('click', () => {
  handleExtend().catch((err) => console.error(i18n('error_extend'), err));
});

skipBtn.addEventListener('click', () => {
  handleSkipBreak().catch((err) => console.error(i18n('error_skip_break'), err));
});

closeBtn.addEventListener('click', () => {
  window.close();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    window.close();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initialize().catch((err) => {
    console.error(i18n('error_init_alarm'), err);
  });
});
