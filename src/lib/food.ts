export const DEFAULT_KCAL_GOAL = 2000;
export const KCAL_GOAL_STEP = 100;
export const MIN_KCAL_GOAL = 1000;
export const MAX_KCAL_GOAL = 5000;

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
