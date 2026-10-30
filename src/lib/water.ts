import { t } from '@lingui/core/macro';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import { flOz, unitSystem } from '@/lib/units';

export type GlassIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type GlassPreset = { ml: number; label: string; icon: GlassIconName };

const imperial = unitSystem === 'imperial';

/** Sizes of the cup, glass and bottle: round millilitres or round ounces. */
const PRESET_ML = imperial ? [7, 10, 16].map(flOz) : [200, 300, 500];

/** Containers offered for logging water, smallest first. */
export const GLASS_PRESETS: GlassPreset[] = [
  { ml: PRESET_ML[0], label: t`Чашка`, icon: 'cup-outline' },
  { ml: PRESET_ML[1], label: t`Склянка`, icon: 'cup-water' },
  { ml: PRESET_ML[2], label: t`Пляшка`, icon: 'bottle-soda-classic-outline' },
];

export const DEFAULT_WATER_GOAL_ML = 2500;

/** The goal stepper's grid, in the chosen unit (ml or fl oz). */
export const WATER_GOAL_STEP = imperial ? 8 : 250;
export const MIN_WATER_GOAL = imperial ? 16 : 500;
export const MAX_WATER_GOAL = imperial ? 200 : 6000;

export const glassForAmount = (ml: number) =>
  GLASS_PRESETS.find((g) => g.ml === ml) ?? {
    ml,
    label: t`Вода`,
    icon: 'water-outline' as const,
  };

/** The smallest container that holds `ml` (the biggest one if none does). */
export const glassToHold = (ml: number) =>
  GLASS_PRESETS.find((g) => g.ml >= ml) ?? GLASS_PRESETS[GLASS_PRESETS.length - 1];

/** Local midnight of the day containing `ms`. */
export function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `days` days after the one containing `ms` (DST-safe). */
export function addDays(ms: number, days: number) {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * The time of day of `timeOf` (now by default) on `day`, a local midnight, but
 * never in the future: logging into a past day or today keeps a sensible time.
 */
export function timeOnDay(day: number, timeOf = Date.now()) {
  const now = Date.now();
  return Math.min(day + (timeOf - startOfDay(timeOf)), addDays(day, 1) - 1, now);
}
