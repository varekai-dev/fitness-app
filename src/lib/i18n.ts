import { setupI18n } from '@lingui/core';

import { readSettingSync, reloadApp, writeSettingSync } from '@/lib/app-settings';
import { messages as enMessages } from '@/locales/en.po';
import { messages as ukMessages } from '@/locales/uk.po';

// Lingui's plurals need Intl.PluralRules, which Hermes may lack. Required only
// when missing: the polyfills are slow to load on low-end phones.
/* eslint-disable @typescript-eslint/no-require-imports */
if (typeof Intl.Locale === 'undefined') require('@formatjs/intl-locale/polyfill-force.js');
if (typeof Intl.PluralRules === 'undefined') {
  require('@formatjs/intl-pluralrules/polyfill-force.js');
  require('@formatjs/intl-pluralrules/locale-data/uk.js');
  require('@formatjs/intl-pluralrules/locale-data/en.js');
}
/* eslint-enable @typescript-eslint/no-require-imports */

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

/**
 * Lingui instance the `t` / `plural` macros translate with (see lingui.config.ts).
 * Ukrainian is the source language; other languages live in src/locales/*.po.
 */
export const i18n = setupI18n({
  locale: lang,
  messages: { uk: ukMessages, en: enMessages },
});

/**
 * Picks a value for the current language. Only for content too big for the
 * catalogs (AI prompts, phrase lists, demo data); interface texts use the macros.
 */
export const tr = <T>(uk: T, en: T): T => (lang === 'uk' ? uk : en);

export async function setLanguage(preference: LanguagePreference) {
  if (preference === languagePreference) return;
  writeSettingSync(KEY, preference === 'system' ? null : preference);
  await reloadApp('Language changed');
}
