import { locale, tr } from '@/lib/i18n';
import type { WeightGoal } from '@/lib/profile';

export const DEFAULT_KCAL_GOAL = 2000;
export const KCAL_GOAL_STEP = 50;
export const MIN_KCAL_GOAL = 1000;
export const MAX_KCAL_GOAL = 6000;

/** Cache key for a dish: case, spacing and trailing punctuation do not make a new dish. */
export function normalizeDish(text: string) {
  return text
    .toLocaleLowerCase('uk-UA')
    .replace(/[’`']/g, '’')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,!?;:]+$/, '')
    .trim();
}

const kcalFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
const gramFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

export const formatKcal = (kcal: number) => kcalFormatter.format(kcal);
export const formatGrams = (g: number) => gramFormatter.format(g);

export type Macros = { kcal: number; proteinG: number; fatG: number; carbsG: number };

export const sumMacros = (rows: Macros[]): Macros =>
  rows.reduce(
    (s, r) => ({
      kcal: s.kcal + r.kcal,
      proteinG: s.proteinG + r.proteinG,
      fatG: s.fatG + r.fatG,
      carbsG: s.carbsG + r.carbsG,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );

/** Protein per kg of body weight: more in a deficit to keep muscle, more for gaining it. */
const PROTEIN_PER_KG: Record<WeightGoal, number> = { lose: 2, maintain: 1.6, gain: 1.8 };
/** Without a body weight, and as a ceiling for heavy bodies on small goals. */
const PROTEIN_SHARE = 0.25;
const MAX_PROTEIN_SHARE = 0.35;
const FAT_SHARE = 0.3;

/**
 * Daily protein, fat and carbs for a kcal goal: protein by body weight and the
 * weight goal, fat at 30% of kcal, carbs the rest. Rounded to whole grams.
 */
export function macroTargets(kcal: number, weightKg: number | null, goal: WeightGoal): Macros {
  const proteinG = Math.min(
    weightKg ? weightKg * PROTEIN_PER_KG[goal] : (kcal * PROTEIN_SHARE) / 4,
    (kcal * MAX_PROTEIN_SHARE) / 4,
  );
  const fatG = (kcal * FAT_SHARE) / 9;
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  return {
    kcal,
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
  };
}

type PortionNutrition = Macros & {
  portionG: number | null;
  fiberG: number | null;
  sugarG: number | null;
};

/** Nutrition of `grams` of a dish whose stored values describe one portion of `portionG`. */
export function scaleNutrition(food: PortionNutrition, grams: number) {
  const k = food.portionG ? grams / food.portionG : 1;
  return {
    kcal: food.kcal * k,
    proteinG: food.proteinG * k,
    fatG: food.fatG * k,
    carbsG: food.carbsG * k,
    fiberG: food.fiberG === null ? null : food.fiberG * k,
    sugarG: food.sugarG === null ? null : food.sugarG * k,
  };
}

/** Dish names of a meal for one line, repeats counted: "Яйця ×3, Тост". */
export function describeDishes(names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ');
}

/** Drinks are logged in millilitres, everything else in grams. */
export const amountUnit = (food: { isDrink: boolean }) =>
  food.isDrink ? tr('мл', 'ml') : tr('г', 'g');
