import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(HttpApi)
  .use(LanguageDetector) // Tell i18n to use the language detector
  .use(initReactI18next)
  .init({
    fallbackLng: 'en', // Universal fallback language
    detection: {
      // Order of checks: first the URL (if forced via ?lng=fr), 
      // then local storage, then browser settings (Chrome/Edge/etc.)
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'], // Caches the detected language for future visits
      lookupQuerystring: 'lng'
    },
    backend: {
      loadPath: '/translation/{{lng}}/translation.json',
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;