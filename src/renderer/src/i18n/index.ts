import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ptBR from './pt-BR.json';

export const supportedLanguages = ['en', 'pt-BR'] as const;

/** Maps an OS/app locale (e.g. "pt-PT", "en-US") to a supported language. */
export function resolveLanguage(locale: string): (typeof supportedLanguages)[number] {
  return locale.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
