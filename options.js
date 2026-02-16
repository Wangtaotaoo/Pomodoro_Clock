const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartNext: false,
  notificationEnabled: true,
  soundEnabled: true,
  openAlarmPage: true,
  theme: 'light',
  blockSitesEnabled: false,
  blockedSites: []
};

let currentTheme = 'light';
let i18nReady = false;

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function getSyncStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function setSyncStorage(data) {
  return new Promise((resolve) => chrome.storage.sync.set(data, resolve));
}

function mergeSettings(rawSettings) {
  return { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function updateThemeSelector() {
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
  });
}

function updateLanguageSelector() {
  const locale = typeof getCurrentLocale === 'function' ? getCurrentLocale() : 'zh_CN';
  document.querySelectorAll('.lang-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.locale === locale);
  });
}

// Safe i18n wrapper that handles cases where i18n isn't ready yet
function safeI18n(key, substitutions) {
  if (typeof i18n === 'function' && i18nReady) {
    return i18n(key, substitutions);
  }
  return key;
}

async function loadSettings() {
  const localData = await getStorage(['settings', 'locale']);
  const syncData = await getSyncStorage(['settings']);
  const merged = mergeSettings(localData.settings || syncData.settings);

  if (!localData.settings && syncData.settings) {
    await setStorage({ settings: merged });
  }

  document.getElementById('focusMinutes').value = merged.focusMinutes;
  document.getElementById('shortBreakMinutes').value = merged.shortBreakMinutes;
  document.getElementById('longBreakMinutes').value = merged.longBreakMinutes;
  document.getElementById('longBreakInterval').value = merged.longBreakInterval;
  document.getElementById('autoStartNext').checked = merged.autoStartNext;
  document.getElementById('notificationEnabled').checked = merged.notificationEnabled;
  document.getElementById('openAlarmPage').checked = merged.openAlarmPage;
  document.getElementById('soundEnabled').checked = merged.soundEnabled;
  document.getElementById('blockSitesEnabled').checked = merged.blockSitesEnabled || false;
  document.getElementById('blockedSites').value = Array.isArray(merged.blockedSites)
    ? merged.blockedSites.join('\n')
    : '';

  // Load theme
  currentTheme = merged.theme || 'light';
  applyTheme(currentTheme);
  updateThemeSelector();

  // Initialize i18n and apply translations
  if (typeof initI18n === 'function') {
    await initI18n();
    i18nReady = true;
  }
  updateLanguageSelector();
  if (typeof applyI18nToDocument === 'function') {
    applyI18nToDocument();
  }
}

async function saveSettings() {
  const blockedSitesText = document.getElementById('blockedSites').value;
  const blockedSites = blockedSitesText
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const settings = {
    focusMinutes: clamp(parseInt(document.getElementById('focusMinutes').value, 10) || 25, 1, 180),
    shortBreakMinutes: clamp(parseInt(document.getElementById('shortBreakMinutes').value, 10) || 5, 1, 60),
    longBreakMinutes: clamp(parseInt(document.getElementById('longBreakMinutes').value, 10) || 15, 1, 90),
    longBreakInterval: clamp(parseInt(document.getElementById('longBreakInterval').value, 10) || 4, 2, 8),
    autoStartNext: document.getElementById('autoStartNext').checked,
    notificationEnabled: document.getElementById('notificationEnabled').checked,
    openAlarmPage: document.getElementById('openAlarmPage').checked,
    soundEnabled: document.getElementById('soundEnabled').checked,
    theme: currentTheme,
    blockSitesEnabled: document.getElementById('blockSitesEnabled').checked,
    blockedSites: blockedSites
  };

  // Save both settings and locale
  const currentLocale = typeof getCurrentLocale === 'function' ? getCurrentLocale() : 'zh_CN';
  await setStorage({ settings, locale: currentLocale });
  await setSyncStorage({ settings });

  const status = document.getElementById('status');
  status.textContent = safeI18n('msg_saved');
  status.classList.add('success');
  setTimeout(() => {
    status.textContent = '';
    status.classList.remove('success');
  }, 2000);
}

function setTheme(theme) {
  currentTheme = theme;
  applyTheme(theme);
  updateThemeSelector();
}

async function setLanguage(locale) {
  if (typeof setCurrentLocale === 'function') {
    await setCurrentLocale(locale);
  }
  updateLanguageSelector();
  if (typeof applyI18nToDocument === 'function') {
    applyI18nToDocument();
  }

  // Update page title
  if (typeof i18n === 'function') {
    document.title = i18n('options_title');
  }
}

document.getElementById('saveBtn').addEventListener('click', () => {
  saveSettings().catch((err) => {
    console.error('Failed to save settings:', err);
  });
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSettings();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  // Theme selector listeners
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.theme);
    });
  });

  // Language selector listeners
  document.querySelectorAll('.lang-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setLanguage(btn.dataset.locale);
    });
  });
});
