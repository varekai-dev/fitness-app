import { readSettingSync, reloadApp, writeSettingSync } from '@/lib/app-settings';

export const LANGUAGES = ['uk', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
/** What the user picked in settings: a language, or follow the device. */
export type LanguagePreference = Language | 'system';

const KEY = 'language';

function readPreference(): LanguagePreference {
  const value = readSettingSync(KEY);
  return value === 'uk' || value === 'en' ? value : 'system';
}

function deviceLanguage(): Language {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('uk')
      ? 'uk'
      : 'en';
  } catch {
    return 'uk';
  }
}

export const languagePreference = readPreference();

/**
 * Resolved once at startup: module-level labels and formatters read it while
 * loading, so changing the language reloads the app.
 */
export const lang: Language =
  languagePreference === 'system' ? deviceLanguage() : languagePreference;

/** BCP 47 tag for `Intl` formatters. British English keeps 24-hour time and day-first dates. */
export const locale = lang === 'uk' ? 'uk-UA' : 'en-GB';

/** Picks the text (or any value, e.g. a formatter function) for the current language. */
export const tr = <T>(uk: T, en: T): T => (lang === 'uk' ? uk : en);

/** Ukrainian plural form: 1 день, 2 дні, 5 днів. */
export function ukPlural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (!Number.isInteger(n)) return few;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** The noun for `n` in the current language: plural(5, ['день', 'дні', 'днів'], ['day', 'days']). */
export const plural = (
  n: number,
  uk: [one: string, few: string, many: string],
  en: [one: string, other: string],
) => (lang === 'uk' ? ukPlural(n, ...uk) : n === 1 ? en[0] : en[1]);

export async function setLanguage(preference: LanguagePreference) {
  if (preference === languagePreference) return;
  writeSettingSync(KEY, preference === 'system' ? null : preference);
  await reloadApp('Language changed');
}
