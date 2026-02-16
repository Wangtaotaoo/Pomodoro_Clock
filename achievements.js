// Achievements System

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

// Achievements with i18n
function getAchievements() {
  return [
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
}

const DAILY_GOAL_MINUTES = 120;
const WEEKLY_GOAL_MINUTES = 720;

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function mergeSettings(rawSettings) {
  return { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
}

// DOM Elements
const unlockedCountEl = document.getElementById('unlockedCount');
const totalHoursEl = document.getElementById('totalHours');
const currentStreakEl = document.getElementById('currentStreak');
const achievementsGrid = document.getElementById('achievementsGrid');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const recentSection = document.getElementById('recentSection');
const recentList = document.getElementById('recentList');

// Global state
let history = [];
let unlockedAchievements = {};
let recentUnlocks = [];

// Initialize theme
async function initTheme() {
  const result = await getStorage(['settings']);
  const settings = mergeSettings(result.settings);
  const theme = settings.theme || 'light';
  document.documentElement.setAttribute('data-theme', theme);

  // Initialize i18n and apply translations
  await initI18n();
  applyI18nToDocument();
}

// Load data
async function loadAchievements() {
  const result = await getStorage(['history', 'achievements']);
  history = Array.isArray(result.history) ? result.history : [];
  unlockedAchievements = result.achievements || {};

  // Extract recent unlocks
  recentUnlocks = [];
  Object.entries(unlockedAchievements).forEach(([id, data]) => {
    if (data.unlockedAt) {
      recentUnlocks.push({ id, unlockedAt: data.unlockedAt });
    }
  });
  recentUnlocks.sort((a, b) => new Date(b.unlockedAt) - new Date(a.unlockedAt));
  recentUnlocks = recentUnlocks.slice(0, 5);

  renderOverview();
  renderAchievements();
  renderRecent();
}

// Calculate statistics
function calculateStats() {
  const focusItems = history.filter(item => item && item.completedAt && item.phase === 'focus');

  // Total minutes
  const totalMinutes = focusItems.reduce((sum, item) => sum + (item.minutes || 0), 0);

  // Current streak
  const streak = calculateStreak();

  return {
    totalMinutes,
    totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    currentStreak: streak,
    completedPomodoros: focusItems.length
  };
}

// Calculate streak
function calculateStreak() {
  if (!history || history.length === 0) return 0;

  const focusItems = history.filter(item => item && item.completedAt && item.phase === 'focus');
  if (focusItems.length === 0) return 0;

  // Get daily totals
  const dailyTotals = {};
  focusItems.forEach(item => {
    const date = new Date(item.completedAt);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!dailyTotals[dateKey]) dailyTotals[dateKey] = 0;
    dailyTotals[dateKey] += item.minutes || 0;
  });

  // Check days with goal met
  const daysWithGoal = Object.entries(dailyTotals).filter(([_, minutes]) => minutes >= DAILY_GOAL_MINUTES);
  const completedDates = new Set(daysWithGoal.map(([dateKey]) => dateKey));

  // Calculate streak
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

// Check achievements
function checkAchievements() {
  const stats = calculateStats();
  const focusItems = history.filter(item => item && item.completedAt && item.phase === 'focus');
  const newlyUnlocked = [];
  const ACHIEVEMENTS = getAchievements();

  ACHIEVEMENTS.forEach(achievement => {
    if (unlockedAchievements[achievement.id]) return;

    let unlocked = false;

    switch (achievement.id) {
      case 'first_pomodoro':
        unlocked = stats.completedPomodoros >= 1;
        break;
      case 'daily_goal':
        unlocked = checkDailyGoal();
        break;
      case 'week_goal':
        unlocked = checkWeeklyGoal();
        break;
      case 'streak_3':
        unlocked = stats.currentStreak >= 3;
        break;
      case 'streak_7':
        unlocked = stats.currentStreak >= 7;
        break;
      case 'streak_30':
        unlocked = stats.currentStreak >= 30;
        break;
      case 'focus_100':
        unlocked = stats.totalHours >= 100;
        break;
      case 'focus_500':
        unlocked = stats.totalHours >= 500;
        break;
      case 'early_bird':
        unlocked = checkEarlyBird(focusItems);
        break;
      case 'night_owl':
        unlocked = checkNightOwl(focusItems);
        break;
      case 'speed_demon':
        unlocked = checkSpeedDemon(focusItems);
        break;
      case 'marathon':
        unlocked = checkMarathon();
        break;
      case 'perfectionist':
        unlocked = checkPerfectionist(focusItems);
        break;
    }

    if (unlocked) {
      unlockedAchievements[achievement.id] = {
        unlockedAt: new Date().toISOString(),
        unlockedCount: 1
      };
      newlyUnlocked.push(achievement);
    }
  });

  if (newlyUnlocked.length > 0) {
    setStorage({ achievements: unlockedAchievements });
    newlyUnlocked.forEach(achievement => {
      showAchievementNotification(achievement);
    });
  }

  return newlyUnlocked;
}

function checkDailyGoal() {
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

function checkWeeklyGoal() {
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

function checkEarlyBird(focusItems) {
  return focusItems.some(item => {
    const date = new Date(item.completedAt);
    return date.getHours() < 8;
  });
}

function checkNightOwl(focusItems) {
  return focusItems.some(item => {
    const date = new Date(item.completedAt);
    return date.getHours() >= 22;
  });
}

function checkSpeedDemon(focusItems) {
  // Check for any day with 8+ pomodoros
  const dailyCounts = {};
  focusItems.forEach(item => {
    const date = new Date(item.completedAt);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
  });

  return Object.values(dailyCounts).some(count => count >= 8);
}

function checkMarathon() {
  // Check for any day with 4+ hours
  const dailyMinutes = {};
  history.forEach(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return;
    const date = new Date(item.completedAt);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    dailyMinutes[dateKey] = (dailyMinutes[dateKey] || 0) + (item.minutes || 0);
  });

  return Object.values(dailyMinutes).some(minutes => minutes >= 240);
}

function checkPerfectionist(focusItems) {
  // Check for 7 consecutive pomodoros
  const sortedItems = [...focusItems].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

  let consecutive = 0;
  for (let i = 0; i < sortedItems.length; i++) {
    if (i > 0) {
      const current = new Date(sortedItems[i].completedAt);
      const prev = new Date(sortedItems[i - 1].completedAt);
      const diff = current - prev;

      // Check if within reasonable time (e.g., within a day, not taking long breaks)
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

// Show notification for achievement
function showAchievementNotification(achievement) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title: i18n('notification_achievement_unlocked'),
    message: `${i18n(achievement.nameKey)} - ${i18n(achievement.descKey)}`,
    priority: 2
  });
}

// Render functions
function renderOverview() {
  const stats = calculateStats();
  const unlocked = Object.keys(unlockedAchievements).length;
  const ACHIEVEMENTS = getAchievements();

  unlockedCountEl.textContent = unlocked;
  totalHoursEl.textContent = stats.totalHours;
  currentStreakEl.textContent = stats.currentStreak;

  // Update progress
  const progress = (unlocked / ACHIEVEMENTS.length) * 100;
  progressFill.style.width = `${progress}%`;
  progressText.textContent = `${unlocked}/${ACHIEVEMENTS.length}`;
}

function renderAchievements() {
  achievementsGrid.innerHTML = '';
  const ACHIEVEMENTS = getAchievements();

  ACHIEVEMENTS.forEach(achievement => {
    const isUnlocked = !!unlockedAchievements[achievement.id];
    const card = document.createElement('div');
    card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;

    card.innerHTML = `
      ${isUnlocked ? `<span class="achievement-badge">${i18n('achievements_unlocked_badge')}</span>` : ''}
      <div class="achievement-icon">
        <span class="material-icons">${achievement.icon}</span>
      </div>
      <div class="achievement-title">${i18n(achievement.nameKey)}</div>
      <div class="achievement-desc">${i18n(achievement.descKey)}</div>
    `;

    achievementsGrid.appendChild(card);
  });
}

function renderRecent() {
  if (recentUnlocks.length === 0) {
    recentSection.style.display = 'none';
    return;
  }

  recentSection.style.display = 'block';
  recentList.innerHTML = '';
  const ACHIEVEMENTS = getAchievements();

  recentUnlocks.forEach(({ id, unlockedAt }) => {
    const achievement = ACHIEVEMENTS.find(a => a.id === id);
    if (!achievement) return;

    const item = document.createElement('div');
    item.className = 'recent-item';

    const timeStr = new Date(unlockedAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    item.innerHTML = `
      <div class="achievement-icon">
        <span class="material-icons">${achievement.icon}</span>
      </div>
      <div class="recent-item-info">
        <div class="recent-item-title">${i18n(achievement.nameKey)}</div>
        <div class="recent-item-time">${timeStr}</div>
      </div>
    `;

    recentList.appendChild(item);
  });
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings && changes.settings.newValue) {
    const theme = changes.settings.newValue.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }
  if (changes.history) {
    history = Array.isArray(changes.history.newValue) ? changes.history.newValue : [];
    renderOverview();
    checkAchievements();
  }
  if (changes.achievements) {
    unlockedAchievements = changes.achievements.newValue || {};

    // Update recent unlocks
    recentUnlocks = [];
    Object.entries(unlockedAchievements).forEach(([id, data]) => {
      if (data.unlockedAt) {
        recentUnlocks.push({ id, unlockedAt: data.unlockedAt });
      }
    });
    recentUnlocks.sort((a, b) => new Date(b.unlockedAt) - new Date(a.unlockedAt));
    recentUnlocks = recentUnlocks.slice(0, 5);

    renderOverview();
    renderAchievements();
    renderRecent();
  }
});

// Initialize
initTheme().then(() => {
  loadAchievements().catch(err => console.error(i18n('error_load_achievements'), err));
  checkAchievements();
});
