import { es } from './es.js';
import { en } from './en.js';
import type { Translations } from './es.js';

export type Language = 'es' | 'en';

let currentLang: Language = detectLanguage();

function detectLanguage(): Language {
  const lang = process.env['LANG'] ?? process.env['LANGUAGE'] ?? '';
  return lang.startsWith('es') ? 'es' : 'es'; // Español por defecto
}

export function setLanguage(lang: Language): void {
  currentLang = lang;
}

export function getLanguage(): Language {
  return currentLang;
}

const translations: Record<Language, Translations> = { es, en };

export function t<K1 extends keyof Translations>(
  section: K1
): Translations[K1];
export function t<K1 extends keyof Translations, K2 extends keyof Translations[K1]>(
  section: K1,
  key: K2
): Translations[K1][K2];
export function t(section: string, key?: string): unknown {
  const dict = translations[currentLang] ?? es;
  const sec = dict[section as keyof Translations];
  if (key === undefined) return sec;
  return (sec as Record<string, unknown>)[key];
}

/** Look up a manager's display name by its dynamic id (falls back to the id). */
export function managerName(id: string): string {
  const dict = translations[currentLang] ?? es;
  const names = dict.managers as Record<string, string>;
  return names[id] ?? id;
}

export type { Translations };
