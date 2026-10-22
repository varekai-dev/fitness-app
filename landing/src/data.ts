import { mdiBottleSodaClassicOutline, mdiCupOutline, mdiCupWater } from '@mdi/js';

/** .github/workflows/release.yml publishes every APK under this name. */
export const RELEASES_REPO = 'varekai-dev/fitness-app-releases';
export const APK_URL = `https://github.com/${RELEASES_REPO}/releases/latest/download/fitness.apk`;
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
export const DEVELOPER_URL = 'https://serhiisaviuk.com/';

/**
 * The app's activity levels and goals (src/lib/profile.ts), for the calculators.
 * Their labels are in i18n.ts, in the same order.
 */
export const activity = [
  { factor: 1.2, waterMl: 0 },
  { factor: 1.375, waterMl: 250 },
  { factor: 1.55, waterMl: 500 },
  { factor: 1.725, waterMl: 750 },
  { factor: 1.9, waterMl: 1000 },
];

export const weightGoals = [{ factor: 0.8 }, { factor: 1 }, { factor: 1.1 }];

/** The app's water containers (GLASS_PRESETS in src/lib/water.ts) with their MDI icons. */
export const glasses = [
  { ml: 200, icon: mdiCupOutline },
  { ml: 300, icon: mdiCupWater },
  { ml: 500, icon: mdiBottleSodaClassicOutline },
];
