/**
 * i18n Configuration
 * Languages: Slovak (sk) and English (en)
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from '../translations/en.json';
import skTranslations from '../translations/sk.json';

// Get saved language — wrapped in try/catch because localStorage throws SecurityError
// in Android private/incognito mode and some WebView configurations
let savedLanguage = 'sk';
try {
  savedLanguage = localStorage.getItem('language') || 'sk';
} catch {
  // storage blocked — fall back to Slovak default
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
      sk: {
        translation: skTranslations,
      },
    },
    lng: savedLanguage, // Default language
    fallbackLng: 'sk',  // Fallback to Slovak if translation not found
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false, // Disable suspense for better loading experience
    },
  });

export default i18n;


