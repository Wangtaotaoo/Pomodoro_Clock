// Statistics Page - Canvas-based charts (no external dependencies)

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

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function mergeSettings(rawSettings) {
  return { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
}

// Global state
let history = [];
let currentPeriod = 'month';

// DOM Elements
const totalMinutesEl = document.getElementById('totalMinutes');
const totalPomodorosEl = document.getElementById('totalPomodoros');
const currentStreakEl = document.getElementById('currentStreak');
const heatmapEl = document.getElementById('heatmap');
const heatmapMonthEl = document.getElementById('heatmapMonth');
const trendChart = document.getElementById('trendChart');
const categoryChart = document.getElementById('categoryChart');
const periodBtns = document.querySelectorAll('.period-btn');
const exportCSVBtn = document.getElementById('exportCSV');
const exportJSONBtn = document.getElementById('exportJSON');

// Month names using i18n
function getMonthNames() {
  return [
    i18n('month_1'), i18n('month_2'), i18n('month_3'), i18n('month_4'),
    i18n('month_5'), i18n('month_6'), i18n('month_7'), i18n('month_8'),
    i18n('month_9'), i18n('month_10'), i18n('month_11'), i18n('month_12')
  ];
}

// Day labels using i18n
function getDayLabels() {
  return [i18n('day_mon'), i18n('day_wed'), i18n('day_fri')];
}

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

// Calculate statistics for a period
function getPeriodStats(period) {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const filteredHistory = history.filter(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return false;
    const completedDate = new Date(item.completedAt);
    return completedDate >= startDate;
  });

  const totalMinutes = filteredHistory.reduce((sum, item) => sum + (item.minutes || 0), 0);
  const totalPomodoros = filteredHistory.length;
  const currentStreak = calculateStreak();

  return {
    totalMinutes,
    totalPomodoros,
    currentStreak,
    filteredHistory,
    startDate
  };
}

// Calculate current streak
function calculateStreak() {
  if (!history || history.length === 0) return 0;

  const focusItems = history.filter(item => item && item.completedAt && item.phase === 'focus');
  if (focusItems.length === 0) return 0;

  const completedDates = new Set();
  focusItems.forEach(item => {
    const date = new Date(item.completedAt);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    completedDates.add(dateKey);
  });

  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  // Check if today has any completed pomodoros, if not start from yesterday
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

// Get daily data for trend chart
function getDailyData(startDate, endDate) {
  const dailyData = {};
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0];
    dailyData[dateKey] = 0;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  history.forEach(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return;
    const dateKey = item.completedAt.split('T')[0];
    if (dailyData.hasOwnProperty(dateKey)) {
      dailyData[dateKey] += item.minutes || 0;
    }
  });

  return Object.entries(dailyData).map(([date, minutes]) => ({ date, minutes }));
}

// Render heatmap
function renderHeatmap() {
  heatmapEl.innerHTML = '';
  heatmapMonthEl.innerHTML = '';

  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Get daily totals
  const dailyTotals = {};
  history.forEach(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return;
    const dateKey = item.completedAt.split('T')[0];
    if (!dailyTotals[dateKey]) dailyTotals[dateKey] = 0;
    dailyTotals[dateKey] += item.minutes || 0;
  });

  // Find max for scaling
  const values = Object.values(dailyTotals);
  const maxVal = values.length > 0 ? Math.max(...values) : 60;

  // Create grid
  for (let week = 0; week < 53; week++) {
    for (let day = 0; day < 7; day++) {
      const cellDate = new Date(yearAgo);
      cellDate.setDate(cellDate.getDate() + (week * 7) + day);

      if (cellDate > now) continue;

      const dateKey = cellDate.toISOString().split('T')[0];
      const minutes = dailyTotals[dateKey] || 0;

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.title = i18n('stats_heatmap_minutes', [dateKey, minutes]);

      let level = 0;
      if (minutes > 0) {
        level = Math.min(4, Math.ceil((minutes / maxVal) * 4));
      }
      cell.setAttribute('data-level', level);

      heatmapEl.appendChild(cell);
    }
  }

  // Add day labels
  const labelContainer = document.createElement('div');
  labelContainer.className = 'heatmap-label';
  const dayLabels = getDayLabels();
  labelContainer.innerHTML = `
    <span>${dayLabels[0]}</span>
    <span>${dayLabels[1]}</span>
    <span>${dayLabels[2]}</span>
  `;
  heatmapEl.appendChild(labelContainer);

  // Add month labels
  const months = getMonthNames();
  let currentMonth = -1;

  for (let week = 0; week < 53; week += 4) {
    const cellDate = new Date(yearAgo);
    cellDate.setDate(cellDate.getDate() + (week * 7));

    if (cellDate > now) break;

    if (cellDate.getMonth() !== currentMonth) {
      currentMonth = cellDate.getMonth();
      const monthLabel = document.createElement('span');
      monthLabel.textContent = months[currentMonth];
      heatmapMonthEl.appendChild(monthLabel);
    } else {
      const spacer = document.createElement('span');
      heatmapMonthEl.appendChild(spacer);
    }
  }
}

// Render trend chart (line chart)
function renderTrendChart(startDate, endDate) {
  const ctx = trendChart.getContext('2d');
  const canvas = trendChart;

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };

  const data = getDailyData(startDate, endDate);
  const values = data.map(d => d.minutes);
  const maxVal = Math.max(...values, 60);

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Draw grid lines and Y-axis labels
  ctx.strokeStyle = '#e0e0e0';
  ctx.fillStyle = '#757575';
  ctx.font = '11px Roboto, sans-serif';
  ctx.textAlign = 'right';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (height - padding.top - padding.bottom) * (i / 5);
    const value = Math.round(maxVal * (5 - i) / 5);

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillText(value.toString(), padding.left - 8, y + 4);
  }

  // Draw X-axis labels
  ctx.textAlign = 'center';
  const numLabels = Math.min(data.length, 7);
  const step = Math.ceil(data.length / numLabels);

  for (let i = 0; i < data.length; i += step) {
    const x = padding.left + (width - padding.left - padding.right) * (i / (data.length - 1));
    const date = new Date(data[i].date);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    ctx.fillText(label, x, height - padding.bottom + 20);
  }

  // Draw line
  if (data.length > 1) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.strokeStyle = isDark ? '#ff80ab' : '#e91e63';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padding.left + (width - padding.left - padding.right) * (i / (data.length - 1));
      const y = padding.top + (height - padding.top - padding.bottom) * (1 - d.minutes / maxVal);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw area under line
    ctx.fillStyle = isDark ? 'rgba(255, 128, 171, 0.1)' : 'rgba(233, 30, 99, 0.1)';
    ctx.lineTo(padding.left + (width - padding.left - padding.right), height - padding.bottom);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // Draw points
    ctx.fillStyle = isDark ? '#ff80ab' : '#e91e63';
    data.forEach((d, i) => {
      const x = padding.left + (width - padding.left - padding.right) * (i / (data.length - 1));
      const y = padding.top + (height - padding.top - padding.bottom) * (1 - d.minutes / maxVal);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// Render category distribution chart (pie chart)
function renderCategoryChart() {
  const ctx = categoryChart.getContext('2d');
  const canvas = categoryChart;

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  // Group by task (using task text as category)
  const categories = {};
  history.forEach(item => {
    if (!item || !item.completedAt || item.phase !== 'focus') return;
    const category = item.task || i18n('stats_uncategorized');
    if (!categories[category]) categories[category] = 0;
    categories[category] += item.minutes || 0;
  });

  const data = Object.entries(categories).map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  const total = data.reduce((sum, d) => sum + d.minutes, 0);

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  if (data.length === 0) {
    ctx.fillStyle = '#9e9e9e';
    ctx.font = '14px Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(i18n('stats_no_data'), width / 2, height / 2);
    return;
  }

  // Colors
  const colors = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b'];

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 20;

  let startAngle = -Math.PI / 2;

  data.forEach((item, i) => {
    const sliceAngle = (item.minutes / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();

    startAngle += sliceAngle;
  });

  // Draw legend
  const legendX = width - 120;
  let legendY = 20;
  const maxLegendItems = 6;

  ctx.font = '11px Roboto, sans-serif';
  ctx.textAlign = 'left';

  data.slice(0, maxLegendItems).forEach((item, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(legendX, legendY, 12, 12);

    ctx.fillStyle = '#212121';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) ctx.fillStyle = '#ffffff';
    const label = item.name.length > 10 ? item.name.substring(0, 10) + '...' : item.name;
    ctx.fillText(`${label} (${Math.round(item.minutes / total * 100)}%)`, legendX + 18, legendY + 10);
    legendY += 20;
  });
}

// Update summary cards
function updateSummary() {
  const stats = getPeriodStats(currentPeriod);

  totalMinutesEl.textContent = stats.totalMinutes;
  totalPomodorosEl.textContent = stats.totalPomodoros;
  currentStreakEl.textContent = stats.currentStreak;

  // Update charts
  renderHeatmap();
  renderTrendChart(stats.startDate, new Date());
  renderCategoryChart();
}

// Export CSV
function exportCSV() {
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

// Export JSON
function exportJSON() {
  const data = {
    exportDate: new Date().toISOString(),
    totalPomodoros: history.filter(h => h && h.phase === 'focus').length,
    totalMinutes: history.filter(h => h && h.phase === 'focus').reduce((sum, h) => sum + (h.minutes || 0), 0),
    history: history.filter(h => h && h.phase === 'focus')
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date();
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');

  link.href = url;
  link.download = `pomodoro-history-${y}${m}${d}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Period selector
periodBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    periodBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    updateSummary();
  });
});

// Export buttons
exportCSVBtn.addEventListener('click', exportCSV);
exportJSONBtn.addEventListener('click', exportJSON);

// Load data and initialize
async function loadStats() {
  const result = await getStorage(['history']);
  history = Array.isArray(result.history) ? result.history : [];
  updateSummary();
}

// Theme change listener
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings && changes.settings.newValue) {
    const theme = changes.settings.newValue.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    updateSummary();
  }
  if (changes.history) {
    history = Array.isArray(changes.history.newValue) ? changes.history.newValue : [];
    updateSummary();
  }
});

// Handle resize
window.addEventListener('resize', () => {
  updateSummary();
});

// Initialize
initTheme().then(() => {
  loadStats().catch(err => console.error(i18n('error_load_stats'), err));
});
