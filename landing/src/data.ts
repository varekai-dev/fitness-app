import { mdiBottleSodaClassicOutline, mdiCupOutline, mdiCupWater } from '@mdi/js';

export const DEVELOPER_URL = 'https://serhiisaviuk.com/';
/** The app's server (server/ in the repo), for deleting an account from the website. */
export const API_URL = import.meta.env.PUBLIC_API_URL ?? 'https://fitness-api.serhijsav.workers.dev';

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
