import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector'; // <-- Nouvel import

i18n
  .use(HttpApi)
  .use(LanguageDetector) // <-- On demande à i18n d'utiliser le détecteur
  .use(initReactI18next)
  .init({
    fallbackLng: 'en', // Langue de secours universelle
    detection: {
      // Ordre des vérifications : d'abord l'URL (si on force ?lng=fr), 
      // puis le stockage local, puis les paramètres du navigateur Chrome/Edge
      order: ['querystring', 'localStorage', 'navigator'],
      caches: ['localStorage'], // Garde en mémoire la langue pour les prochaines visites
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