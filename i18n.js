// i18n utility functions for Pomodoro Timer Chrome Extension
// Supports dynamic language switching

// Available locales
const AVAILABLE_LOCALES = ['zh_CN', 'en', 'ru', 'fr'];
const DEFAULT_LOCALE = 'zh_CN';

// Locale display names
const LOCALE_NAMES = {
  zh_CN: '中文',
  en: 'English',
  ru: 'Русский',
  fr: 'Français'
};

// Cache for loaded messages
let messagesCache = {};
let currentLocale = DEFAULT_LOCALE;

/**
 * Get available locales
 * @returns {Array} - Array of locale codes
 */
function getAvailableLocales() {
  return AVAILABLE_LOCALES;
}

/**
 * Get locale display name
 * @param {string} locale - Locale code
 * @returns {string} - Display name
 */
function getLocaleName(locale) {
  return LOCALE_NAMES[locale] || locale;
}

/**
 * Get current locale
 * @returns {string} - Current locale code
 */
function getCurrentLocale() {
  return currentLocale;
}

/**
 * Set current locale and save to storage
 * @param {string} locale - Locale code
 */
async function setCurrentLocale(locale) {
  if (!AVAILABLE_LOCALES.includes(locale)) {
    locale = DEFAULT_LOCALE;
  }
  currentLocale = locale;

  // Save to storage
  try {
    await new Promise((resolve) => {
      chrome.storage.local.set({ locale }, resolve);
    });
  } catch (e) {
    console.error('Failed to save locale:', e);
  }

  // Reload messages for new locale
  await loadMessages(locale);
}

/**
 * Load messages for a specific locale
 * @param {string} locale - Locale code
 */
async function loadMessages(locale) {
  try {
    // Try to fetch the messages file
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const response = await fetch(url);
    if (response.ok) {
      const messages = await response.json();
      messagesCache[locale] = messages;
    } else {
      console.error(`Failed to load messages for locale: ${locale}`);
    }
  } catch (e) {
    console.error('Error loading messages:', e);
  }
}

/**
 * Initialize i18n system
 * Loads saved locale preference or uses browser locale
 */
async function initI18n() {
  // Try to get saved locale from storage
  let savedLocale = null;
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['locale'], resolve);
    });
    savedLocale = result.locale;
  } catch (e) {
    console.error('Failed to get saved locale:', e);
  }

  if (savedLocale && AVAILABLE_LOCALES.includes(savedLocale)) {
    currentLocale = savedLocale;
  } else {
    // Try to detect browser locale
    const browserLocale = chrome.i18n.getUILanguage().replace('-', '_');
    if (AVAILABLE_LOCALES.includes(browserLocale)) {
      currentLocale = browserLocale;
    } else {
      // Check for language prefix match (e.g., 'zh' matches 'zh_CN')
      const prefix = browserLocale.split('_')[0];
      const match = AVAILABLE_LOCALES.find(loc => loc.startsWith(prefix));
      if (match) {
        currentLocale = match;
      } else {
        currentLocale = DEFAULT_LOCALE;
      }
    }
  }

  // Load messages for current locale
  await loadMessages(currentLocale);

  // Also load default locale as fallback
  if (currentLocale !== DEFAULT_LOCALE) {
    await loadMessages(DEFAULT_LOCALE);
  }

  return currentLocale;
}

/**
 * Get localized message
 * @param {string} key - Message key
 * @param {string|string[]} [substitutions] - Optional substitutions
 * @returns {string} - Localized message or key if not found
 */
function i18n(key, substitutions) {
  const messages = messagesCache[currentLocale];
  if (!messages || !messages[key]) {
    // Fallback to default locale
    const defaultMessages = messagesCache[DEFAULT_LOCALE];
    if (!defaultMessages || !defaultMessages[key]) {
      return key;
    }
    return substituteMessage(defaultMessages[key].message, substitutions);
  }
  return substituteMessage(messages[key].message, substitutions);
}

/**
 * Substitute placeholders in message
 * @param {string} message - Message with placeholders
 * @param {string|string[]} substitutions - Substitutions
 * @returns {string} - Substituted message
 */
function substituteMessage(message, substitutions) {
  if (!substitutions) return message;

  const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
  let result = message;

  subs.forEach((sub, index) => {
    // Chrome i18n uses {0}, {1}, etc.
    result = result.replace(new RegExp(`\\{${index}\\}`, 'g'), sub);
  });

  return result;
}

/**
 * Apply i18n translations to all elements with data-i18n attribute
 * Elements with data-i18n will have their textContent set to the translated message
 * Elements with data-i18n-placeholder will have their placeholder attribute set
 * Elements with data-i18n-title will have their title attribute set
 */
function applyI18nToDocument() {
  // Apply text content
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = i18n(key);
    }
  });

  // Apply placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.placeholder = i18n(key);
    }
  });

  // Apply title attributes
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = i18n(key);
    }
  });

  // Apply aria-label attributes
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) {
      el.setAttribute('aria-label', i18n(key));
    }
  });
}

// Export for use in other scripts (if using modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    i18n,
    applyI18nToDocument,
    getCurrentLocale,
    setCurrentLocale,
    initI18n,
    getAvailableLocales,
    getLocaleName
  };
}
