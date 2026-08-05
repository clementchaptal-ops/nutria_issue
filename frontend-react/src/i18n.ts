import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

// Initialize i18next with HTTP backend loading, browser language detection, and React integration
i18n
  .use(HttpApi)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Fallback language used when the detected language is not available
    fallbackLng: 'en',
    // Options for detecting the user's language preference
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupQuerystring: 'lng'
    },
    // Path pattern used to resolve translation files dynamically
    backend: {
      loadPath: '/translation/{{lng}}/translation.json',
    },
    // React safely escapes values by default to prevent XSS, so additional escaping is disabled
    interpolation: {
      escapeValue: false
    }
  });

/**
 * The initialized and configured i18next instance.
 * Used globally across the application for localization and translation services.
 */
export default i18n;