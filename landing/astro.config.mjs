// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Ukrainian at the root, English under /en/.
  i18n: {
    locales: ['uk', 'en'],
    defaultLocale: 'uk',
    routing: { prefixDefaultLocale: false },
  },
  // Screenshots and the icon are read straight from the app (docs/screenshots,
  // assets/images), so the page never shows a stale copy of them.
  vite: { server: { fs: { allow: ['..'] } } },
});
