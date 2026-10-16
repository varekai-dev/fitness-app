import type { IconName } from '@/components/ui';
import { MEALS, type Meal } from '@/db/schema';

export { MEALS, type Meal };

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Сніданок',
  lunch: 'Обід',
  dinner: 'Вечеря',
};

export const MEAL_ICONS: Record<Meal, IconName> = {
  breakfast: 'sunny',
  lunch: 'partly-sunny',
  dinner: 'moon',
};

/** The meal a moment falls in by time of day: before 11:00, before 17:00, then evening. */
export function mealAt(ms: number): Meal {
  const hour = new Date(ms).getHours();
  return hour < 11 ? 'breakfast' : hour < 17 ? 'lunch' : 'dinner';
}

/** An entry's meal, falling back to its time for entries logged before meals existed. */
export const mealOf = (entry: { meal: Meal | null; eatenAt: number }) =>
  entry.meal ?? mealAt(entry.eatenAt);
