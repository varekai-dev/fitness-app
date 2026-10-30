import { t } from '@lingui/core/macro';
import type { IconName } from '@/components/ui';
import { MEALS, type Meal } from '@/db/schema';

export { MEALS, type Meal };

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: t`Сніданок`,
  lunch: t`Обід`,
  dinner: t`Вечеря`,
  snack: t`Перекуси`,
};

/** Meals of a day's plan, in order; snacks go in between. */
export const MAIN_MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];

export const MEAL_ICONS: Record<Meal, IconName> = {
  breakfast: 'sunny',
  lunch: 'partly-sunny',
  dinner: 'moon',
  snack: 'nutrition',
};

/** The meal a moment falls in by time of day: before 11:00, before 17:00, then evening. */
export function mealAt(ms: number): Meal {
  const hour = new Date(ms).getHours();
  return hour < 11 ? 'breakfast' : hour < 17 ? 'lunch' : 'dinner';
}

/** An entry's meal, falling back to its time for entries logged before meals existed. */
export const mealOf = (entry: { meal: Meal | null; eatenAt: number }) =>
  entry.meal ?? mealAt(entry.eatenAt);
