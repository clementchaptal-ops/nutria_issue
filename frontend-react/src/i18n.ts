import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(HttpApi)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupQuerystring: 'lng'
    },
    backend: {
      loadPath: '/translation/{{lng}}/translation.json',
    },
    interpolation: {
      escapeValue: false
    }
  });

/** The configured i18next instance for application internationalization. */
export default i18n;