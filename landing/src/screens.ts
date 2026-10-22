import type { ImageMetadata } from 'astro';
import type { Lang } from './i18n';

/**
 * The README screenshots, so a retaken one shows up here as well. English ones
 * live in docs/screenshots/en; a screen without one falls back to Ukrainian.
 */
const files = import.meta.glob<{ default: ImageMetadata }>('../../docs/screenshots/**/*.png', {
  eager: true,
});

export function screenshot(name: string, lang: Lang = 'uk'): ImageMetadata {
  const file =
    (lang === 'en' && files[`../../docs/screenshots/en/${name}.png`]) ||
    files[`../../docs/screenshots/${name}.png`];
  if (!file) throw new Error(`No screenshot docs/screenshots/${name}.png`);
  return file.default;
}
