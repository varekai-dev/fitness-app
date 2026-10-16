import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import { tr } from '@/lib/i18n';
import { flOz, unitSystem } from '@/lib/units';

export type GlassIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type GlassPreset = { ml: number; label: string; icon: GlassIconName };

const imperial = unitSystem === 'imperial';

/** Sizes of the cup, glass, mug, bottle and sports bottle: round millilitres or round ounces. */
const PRESET_ML = imperial ? [6, 8, 12, 16, 24].map(flOz) : [150, 250, 350, 500, 750];

/** Containers offered for logging water, smallest first. */
export const GLASS_PRESETS: GlassPreset[] = [
  { ml: PRESET_ML[0], label: tr('Чашка', 'Cup'), icon: 'cup-outline' },
  { ml: PRESET_ML[1], label: tr('Склянка', 'Glass'), icon: 'cup-water' },
  { ml: PRESET_ML[2], label: tr('Кухоль', 'Mug'), icon: 'glass-mug-variant' },
  { ml: PRESET_ML[3], label: tr('Пляшка', 'Bottle'), icon: 'bottle-soda-classic-outline' },
  { ml: PRESET_ML[4], label: tr('Спортпляшка', 'Sports bottle'), icon: 'bottle-tonic-outline' },
];

export const DEFAULT_WATER_GOAL_ML = 2500;

/** The goal stepper's grid, in the chosen unit (ml or fl oz). */
export const WATER_GOAL_STEP = imperial ? 8 : 250;
export const MIN_WATER_GOAL = imperial ? 16 : 500;
export const MAX_WATER_GOAL = imperial ? 200 : 6000;

export const glassForAmount = (ml: number) =>
  GLASS_PRESETS.find((g) => g.ml === ml) ?? {
    ml,
    label: tr('Вода', 'Water'),
    icon: 'water-outline' as const,
  };

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
