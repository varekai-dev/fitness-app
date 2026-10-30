import { defineConfig } from '@lingui/cli';

export default defineConfig({
  // Texts in the code are Ukrainian; every other language is a catalog.
  sourceLocale: 'uk',
  locales: ['uk', 'en'],
  fallbackLocales: false,
  catalogs: [{ path: '<rootDir>/src/locales/{locale}', include: ['src'] }],
  // Macros read the instance from the module that activates the language, so
  // labels translated while a module loads already see the catalog.
  runtimeConfigModule: ['@/lib/i18n', 'i18n'],
});
