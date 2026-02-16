const TIMER_ALARM_NAME = 'tomatoTimer';
const MAX_HISTORY_ITEMS = 1000;
const MENU_TOGGLE = 'pomodoro-toggle';
const MENU_RESET = 'pomodoro-reset';

// Available locales
const AVAILABLE_LOCALES = ['zh_CN', 'en', 'ru', 'fr'];
const DEFAULT_LOCALE = 'zh_CN';

// Messages cache for i18n
let messagesCache = {};
let currentLocale = DEFAULT_LOCALE;

// Achievement definitions with i18n keys
const ACHIEVEMENTS = [
  { id: 'first_pomodoro', nameKey: 'ach_first_pomodoro_name', descKey: 'ach_first_pomodoro_desc', icon: 'stars' },
  { id: 'daily_goal', nameKey: 'ach_daily_goal_name', descKey: 'ach_daily_goal_desc', icon: 'emoji_events' },
  { id: 'week_goal', nameKey: 'ach_week_goal_name', descKey: 'ach_week_goal_desc', icon: 'military_tech' },
  { id: 'streak_3', nameKey: 'ach_streak_3_name', descKey: 'ach_streak_3_desc', icon: 'local_fire_department' },
  { id: 'streak_7', nameKey: 'ach_streak_7_name', descKey: 'ach_streak_7_desc', icon: 'whatshot' },
  { id: 'streak_30', nameKey: 'ach_streak_30_name', descKey: 'ach_streak_30_desc', icon: 'workspace_premium' },
  { id: 'focus_100', nameKey: 'ach_focus_100_name', descKey: 'ach_focus_100_desc', icon: 'timer' },
  { id: 'focus_500', nameKey: 'ach_focus_500_name', descKey: 'ach_focus_500_desc', icon: 'diamond' },
  { id: 'early_bird', nameKey: 'ach_early_bird_name', descKey: 'ach_early_bird_desc', icon: 'wb_sunny' },
  { id: 'night_owl', nameKey: 'ach_night_owl_name', descKey: 'ach_night_owl_desc', icon: 'nightlight' },
  { id: 'speed_demon', nameKey: 'ach_speed_demon_name', descKey: 'ach_speed_demon_desc', icon: 'speed' },
  { id: 'marathon', nameKey: 'ach_marathon_name', descKey: 'ach_marathon_desc', icon: 'directions_run' },
  { id: 'perfectionist', nameKey: 'ach_perfectionist_name', descKey: 'ach_perfectionist_desc', icon: 'verified' }
];

const DAILY_GOAL_MINUTES = 120;
const WEEKLY_GOAL_MINUTES = 720;

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

// Load messages for a specific locale
async function loadMessages(locale) {
  try {
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const response = await fetch(url);
    if (response.ok) {
      const messages = await response.json();
      messagesCache[locale] = messages;
    }
  } catch (e) {
    console.error('Error loading messages:', e);
  }
}

// Initialize locale from storage
async function initLocale() {
  try {
    const result = await getStorage(['locale']);
    if (result.locale && AVAILABLE_LOCALES.includes(result.locale)) {
      currentLocale = result.locale;
    } else {
      // Use browser locale or default
      const browserLocale = chrome.i18n.getUILanguage().replace('-', '_');
      if (AVAILABLE_LOCALES.includes(browserLocale)) {
        currentLocale = browserLocale;
      } else {
        const prefix = browserLocale.split('_')[0];
        const match = AVAILABLE_LOCALES.find(loc => loc.startsWith(prefix));
        currentLocale = match || DEFAULT_LOCALE;
      }
    }
    await loadMessages(currentLocale);
    // Also load default locale as fallback
    if (currentLocale !== DEFAULT_LOCALE) {
      await loadMessages(DEFAULT_LOCALE);
    }
  } catch (e) {
    console.error('Error initializing locale:', e);
    currentLocale = DEFAULT_LOCALE;
    await loadMessages(DEFAULT_LOCALE);
  }
}

// Helper to get i18n message in service worker
function i18n(key, substitutions) {
  const messages = messagesCache[currentLocale];
  let message = null;

  if (messages && messages[key]) {
    message = messages[key].message;
  } else {
    // Fallback to default locale
    const defaultMessages = messagesCache[DEFAULT_LOCALE];
    if (defaultMessages && defaultMessages[key]) {
      message = defaultMessages[key].message;
    }
  }

  if (!message) {
    return key;
  }

  // Apply substitutions
  if (substitutions) {
    const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
    subs.forEach((sub, index) => {
      message = message.replace(new RegExp(`\\{${index}\\}`, 'g'), sub);
    });
  }

  return message;
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function getSyncStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function clearTimerAlarm() {
  return new Promise((resolve) => chrome.alarms.clear(TIMER_ALARM_NAME, resolve));
}

function createTimerAlarm(whenMs) {
  chrome.alarms.create(TIMER_ALARM_NAME, { when: whenMs });
}

function getRemainingSecondsFromEnd(endTime) {
  if (!endTime) return 0;
  return Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
}

function getPhaseDurationSeconds(phase, settings) {
  if (phase === 'shortBreak') {
    return settings.shortBreakMinutes * 60;
  }
  if (phase === 'longBreak') {
    return settings.longBreakMinutes * 60;
  }
  return settings.focusMinutes * 60;
}

function getDefaultTimerState(settings) {
  const totalSeconds = getPhaseDurationSeconds('focus', settings);
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

function mergeSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

function nextPhaseFrom(state, settings) {
  if (state.phase === 'focus') {
    const nextFocusCount = (state.completedFocusCount || 0) + 1;
    return nextFocusCount % settings.longBreakInterval === 0 ? 'longBreak' : 'shortBreak';
  }
  return 'focus';
}

function createCompletionMessage(completedPhase, nextPhase) {
  if (completedPhase === 'focus') {
    if (nextPhase === 'longBreak') {
      return i18n('notification_focus_complete_long');
    }
    return i18n('notification_focus_complete');
  }
  return i18n('notification_break_complete');
}

function createHistoryEntry(state) {
  return {
    id: Date.now(),
    completedAt: new Date().toISOString(),
    minutes: Math.round((state.totalSeconds || 0) / 60),
    task: state.currentTask || '',
    phase: state.phase
  };
}

async function ensureInitialized() {
  const { settings, timerState, history, totalTime, remainingTime, isRunning, isPaused, endTime } = await getStorage([
    'settings',
    'timerState',
    'history',
    'totalTime',
    'remainingTime',
    'isRunning',
    'isPaused',
    'endTime'
  ]);
  const { settings: syncSettings } = await getSyncStorage(['settings']);

  const mergedSettings = mergeSettings(settings || syncSettings);
  let nextTimerState = timerState;

  if (!nextTimerState) {
    nextTimerState = getDefaultTimerState(mergedSettings);

    if (totalTime && remainingTime !== undefined) {
      nextTimerState = {
        ...nextTimerState,
        phase: 'focus',
        totalSeconds: totalTime,
        remainingSeconds: remainingTime,
        isRunning: Boolean(isRunning),
        isPaused: Boolean(isPaused),
        endTime: endTime || null
      };
    }
  }

  const nextHistory = Array.isArray(history) ? history : [];

  await setStorage({
    settings: mergedSettings,
    timerState: nextTimerState,
    history: nextHistory
  });

  if (nextTimerState.isRunning && !nextTimerState.isPaused && nextTimerState.endTime) {
    if (nextTimerState.endTime <= Date.now()) {
      await handleTimerCompletion();
    } else {
      createTimerAlarm(nextTimerState.endTime);
    }
  }
}

async function handleTimerCompletion() {
  const { settings, timerState, history } = await getStorage(['settings', 'timerState', 'history']);
  const mergedSettings = mergeSettings(settings);
  const state = timerState || getDefaultTimerState(mergedSettings);

  if (!state.isRunning || state.isPaused) {
    return;
  }

  const now = Date.now();
  if (state.endTime && state.endTime > now + 1000) {
    return;
  }

  const completedPhase = state.phase;
  const nextPhase = nextPhaseFrom(state, mergedSettings);
  const nextDurationSeconds = getPhaseDurationSeconds(nextPhase, mergedSettings);
  const nextCompletedFocusCount = completedPhase === 'focus'
    ? (state.completedFocusCount || 0) + 1
    : (state.completedFocusCount || 0);

  const nextState = {
    ...state,
    phase: nextPhase,
    totalSeconds: nextDurationSeconds,
    remainingSeconds: nextDurationSeconds,
    isRunning: mergedSettings.autoStartNext,
    isPaused: false,
    endTime: mergedSettings.autoStartNext ? now + nextDurationSeconds * 1000 : null,
    completedFocusCount: nextCompletedFocusCount,
    currentTask: nextPhase === 'focus' ? '' : state.currentTask
  };

  const nextHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_ITEMS) : [];
  if (completedPhase === 'focus') {
    nextHistory.push(createHistoryEntry(state));
  }

  const lastCompletion = {
    completedAt: new Date(now).toISOString(),
    completedPhase,
    nextPhase,
    nextDurationSeconds,
    completedTask: state.currentTask || '',
    autoStarted: mergedSettings.autoStartNext
  };

  await clearTimerAlarm();

  await setStorage({
    settings: mergedSettings,
    timerState: nextState,
    history: nextHistory.slice(-MAX_HISTORY_ITEMS),
    lastCompletion
  });

  if (mergedSettings.notificationEnabled) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: i18n('notification_pomodoro'),
      message: createCompletionMessage(completedPhase, nextPhase),
      priority: 2
    });
  }

  if (mergedSettings.openAlarmPage) {
    chrome.tabs.create({
      url: chrome.runtime.getURL('alarm.html')
    });
  }

  if (mergedSettings.autoStartNext && nextState.endTime) {
    createTimerAlarm(nextState.endTime);
  }

  // Check achievements after focus completion
  if (completedPhase === 'focus') {
    checkAchievements(nextHistory).catch((err) => {
      console.error(i18n('error_check_achievements'), err);
    });
  }
}

// Achievement checking functions
async function checkAchievements(history) {
  const { achievements } = await getStorage(['achievements']);
  const unlocked = achievements || {};

  const newlyUnlocked = [];
  const focusItems = history.filter(item => item && item.completedAt && item.phase === 'focus');
  const totalMinutes = focusItems.reduce((sum, item) => sum + (item.minutes || 0), 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
  const currentStreak = calculateStreak(history);

  ACHIEVEMENTS.forEach(achievement => {
    if (unlocked[achievement.id]) return;

    let isUnlocked = false;

    switch (achievement.id) {
      case 'first_pomodoro':
        isUnlocked = focusItems.length >= 1;
        break;
      case 'daily_goal':
        isUnlocked = checkDailyGoal(history);
        break;
      case 'week_goal':
        isUnlocked = checkWeeklyGoal(history);
        break;
      case 'streak_3':
      case 'streak_7':
      case 'streak_30':
        const requiredStreak = parseInt(achievement.id.split('_')[1], 10);
        isUnlocked = currentStreak >= requiredStreak;
        break;
      case 'focus_100':
        isUnlocked = totalHours >= 100;
        break;
      case 'focus_500':
        isUnlocked = totalHours >= 500;
        break;
      case 'early_bird':
        isUnlocked = focusItems.some(item => new Date(item.completedAt).getHours() < 8);
        break;
      case 'night_owl':
        isUnlocked = focusItems.some(item => new Date(item.completedAt).getHours() >= 22);
        break;
      case 'speed_demon':
        isUnlocked = checkSpeedDemon(history);
        break;
      case 'marathon':
        isUnlocked = checkMarathon(history);
        break;
      case 'perfectionist':
        isUnlocked = checkPerfectionist(history);
        break;
    }

    if (isUnlocked) {
      unlocked[achievement.id] = {
        unlockedAt: new Date().toISOString(),
        unlockedCount: 1
      };
      newlyUnlocked.push(achievement);
    }
  });

  if (newlyUnlocked.length > 0) {
    await setStorage({ achievements: unlocked });
    newlyUnlocked.forEach(achievement => {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: i18n('notification_achievement_unlocked'),
        message: `${i18n(achievement.nameKey)} - ${i18n(achievement.descKey)}`,
        priority: 2
      });
    });
  }

  return newlyUnlocked;
}

function calculateStreak(history) {
  if (!history || history.length === 0) return 0;

  const focusItems = history.filter(item => item && item.completedAt && item.phase === 'focus');
  if (focusItems.length === 0) return 0;

  const dailyTotals = {};
  focusItems.forEach(item => {
    const date = new Date(item.completedAt);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!dailyTotals[dateKey]) dailyTotals[dateKey] = 0;
    dailyTotals[dateKey] += item.minutes || 0;
  });

  const daysWithGoal = Object.entries(dailyTotals).filter(([_, minutes]) => minutes >= DAILY_GOAL_MINUTES);
  const completedDates = new Set(daysWithGoal.map(([dateKey]) => dateKey));

  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  const todayKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
  if (!completedDates.has(todayKey)) {
    currentDate.setDate(currentDate.getDate() - 1);
  }

  while (true) {
    const dateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
    if (completedDates.has(dateKey)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function checkDailyGoal(history) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  let todayMinutes = 0;
  history.forEach(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return;
    const date = new Date(item.completedAt);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (dateKey === todayKey) {
      todayMinutes += item.minutes || 0;
    }
  });

  return todayMinutes >= DAILY_GOAL_MINUTES;
}

function checkWeeklyGoal(history) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let weekMinutes = 0;
  history.forEach(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return;
    const date = new Date(item.completedAt);
    if (date >= weekAgo && date <= now) {
      weekMinutes += item.minutes || 0;
    }
  });

  return weekMinutes >= WEEKLY_GOAL_MINUTES;
}

function checkSpeedDemon(history) {
  const dailyCounts = {};
  history.forEach(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return;
    const date = new Date(item.completedAt);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
  });

  return Object.values(dailyCounts).some(count => count >= 8);
}

function checkMarathon(history) {
  const dailyMinutes = {};
  history.forEach(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return;
    const date = new Date(item.completedAt);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    dailyMinutes[dateKey] = (dailyMinutes[dateKey] || 0) + (item.minutes || 0);
  });

  return Object.values(dailyMinutes).some(minutes => minutes >= 240);
}

function checkPerfectionist(history) {
  const focusItems = history.filter(item => item && item.completedAt && item.phase === 'focus');
  const sortedItems = [...focusItems].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

  let consecutive = 0;
  for (let i = 0; i < sortedItems.length; i++) {
    if (i > 0) {
      const current = new Date(sortedItems[i].completedAt);
      const prev = new Date(sortedItems[i - 1].completedAt);
      const diff = current - prev;

      if (diff < 24 * 60 * 60 * 1000) {
        consecutive++;
      } else {
        consecutive = 1;
      }
    } else {
      consecutive = 1;
    }

    if (consecutive >= 7) return true;
  }

  return false;
}

async function toggleStartPause() {
  const { settings, timerState } = await getStorage(['settings', 'timerState']);
  const mergedSettings = mergeSettings(settings);
  const current = timerState || getDefaultTimerState(mergedSettings);

  if (current.isRunning && !current.isPaused) {
    await clearTimerAlarm();
    const pausedState = {
      ...current,
      isRunning: true,
      isPaused: true,
      remainingSeconds: getRemainingSecondsFromEnd(current.endTime),
      endTime: null
    };
    await setStorage({ timerState: pausedState });
    return;
  }

  const remainingSeconds = current.isPaused
    ? Math.max(1, current.remainingSeconds || current.totalSeconds)
    : Math.max(1, current.totalSeconds || getPhaseDurationSeconds(current.phase, mergedSettings));

  const runningState = {
    ...current,
    totalSeconds: current.totalSeconds || remainingSeconds,
    remainingSeconds,
    isRunning: true,
    isPaused: false,
    endTime: Date.now() + remainingSeconds * 1000
  };

  createTimerAlarm(runningState.endTime);
  await setStorage({ timerState: runningState });
}

async function resetTimerState() {
  const { settings } = await getStorage(['settings']);
  const mergedSettings = mergeSettings(settings);
  const totalSeconds = getPhaseDurationSeconds('focus', mergedSettings);

  await clearTimerAlarm();
  await setStorage({
    timerState: {
      phase: 'focus',
      totalSeconds,
      remainingSeconds: totalSeconds,
      isRunning: false,
      isPaused: false,
      endTime: null,
      completedFocusCount: 0,
      currentTask: '',
      currentTaskId: null
    }
  });
}

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_TOGGLE,
      title: i18n('menu_toggle'),
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: MENU_RESET,
      title: i18n('menu_reset'),
      contexts: ['action']
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await initLocale();
  ensureInitialized().catch((err) => {
    console.error(i18n('error_init'), err);
  });
  createContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await initLocale();
  ensureInitialized().catch((err) => {
    console.error(i18n('error_startup'), err);
  });
  createContextMenus();
});

// Listen for locale changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.locale) {
    initLocale().then(() => {
      createContextMenus();
    });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TIMER_ALARM_NAME) {
    return;
  }

  handleTimerCompletion().catch((err) => {
    console.error(i18n('error_timer_complete'), err);
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'start-pause-timer') {
    toggleStartPause().catch((err) => console.error(i18n('error_shortcut_toggle'), err));
    return;
  }
  if (command === 'reset-timer') {
    resetTimerState().catch((err) => console.error(i18n('error_shortcut_reset'), err));
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_TOGGLE) {
    toggleStartPause().catch((err) => console.error(i18n('error_menu_toggle'), err));
    return;
  }
  if (info.menuItemId === MENU_RESET) {
    resetTimerState().catch((err) => console.error(i18n('error_menu_reset'), err));
  }
});
