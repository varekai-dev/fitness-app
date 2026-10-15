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

const kcalFormatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
const gramFormatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });

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

/** Drinks are logged in millilitres, everything else in grams. */
export const amountUnit = (food: { isDrink: boolean }) => (food.isDrink ? 'мл' : 'г');
