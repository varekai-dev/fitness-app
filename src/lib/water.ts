import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

export type GlassIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type GlassPreset = { ml: number; label: string; icon: GlassIconName };

/** Containers offered for logging water, smallest first. */
export const GLASS_PRESETS: GlassPreset[] = [
  { ml: 150, label: 'Чашка', icon: 'cup-outline' },
  { ml: 250, label: 'Склянка', icon: 'cup-water' },
  { ml: 350, label: 'Кухоль', icon: 'glass-mug-variant' },
  { ml: 500, label: 'Пляшка', icon: 'bottle-soda-classic-outline' },
  { ml: 750, label: 'Спортпляшка', icon: 'bottle-tonic-outline' },
];

/** The quick-add buttons on the home card. */
export const QUICK_GLASSES = GLASS_PRESETS.filter((g) => g.ml === 250 || g.ml === 500);

export const DEFAULT_WATER_GOAL_ML = 2500;
export const WATER_GOAL_STEP_ML = 250;
export const MIN_WATER_GOAL_ML = 500;
export const MAX_WATER_GOAL_ML = 6000;

const mlFormatter = new Intl.NumberFormat('uk-UA');

/** "1 800" — grouped like the rest of the Ukrainian UI. */
export const formatMl = (ml: number) => mlFormatter.format(Math.round(ml));

/** "1,8 л" for compact labels such as chart bars. */
export const formatLiters = (ml: number) =>
  `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(ml / 1000)} л`;

export const glassForAmount = (ml: number) =>
  GLASS_PRESETS.find((g) => g.ml === ml) ?? { ml, label: 'Вода', icon: 'water-outline' as const };

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
