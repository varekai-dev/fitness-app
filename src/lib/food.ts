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

// One weight or volume in a normalized dish text: "400 г", "0,5 л", "330ml".
const AMOUNT_RE = /(^|[\s(])(\d+(?:[.,]\d+)?)\s*(кг|kg|гр|г|g|мл|ml|л|l)\.?(?=$|[\s),;])/g;
// What a dish key must not keep: a bare count ("2 яйця") or several foods at once.
const NOT_ONE_DISH_RE = /(^|\s)\d+(?:[.,]\d+)?(\s|$)|\+|,\s/;

/**
 * "Куряче філе 400 г" as the dish "куряче філе" (a cache key) and 400 g or ml,
 * so the same dish in another amount is scaled instead of asked again. Null
 * without exactly one weight or volume, or when the rest isn't a single dish.
 */
export function splitAmount(text: string): { dish: string; grams: number } | null {
  const t = normalizeDish(text);
  const matches = [...t.matchAll(AMOUNT_RE)];
  if (matches.length !== 1) return null;
  const [m] = matches;
  const grams = Number(m[2].replace(',', '.')) * (/^(кг|kg|л|l)$/.test(m[3]) ? 1000 : 1);
  const dish = normalizeDish(t.replace(m[0], `${m[1]} `).replace(/\(\s*\)/g, ''));
  if (!dish || !(grams > 0) || NOT_ONE_DISH_RE.test(dish)) return null;
  return { dish, grams };
}

const kcalFormatter =new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
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

type Dish = Macros & {
  name: string;
  portion: string | null;
  fiberG?: number | null;
  sugarG?: number | null;
};

/** "1 500,5 г" as 1500.5 and "г"; null for a portion that isn't a number and a unit. */
function parseAmount(portion: string) {
  const m = /^([\d\s]+(?:[.,]\d+)?)\s+(\S+)$/.exec(portion.trim());
  if (!m) return null;
  const amount = Number(m[1].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(amount) ? { amount, unit: m[2] } : null;
}

/** Portions of one dish summed ("100 г" + "150 г" → "250 г"), or listed when units differ. */
function sumPortions(portions: (string | null)[]) {
  const known = portions.filter((p): p is string => !!p);
  if (known.length === 0) return null;
  const parsed = known.map(parseAmount);
  const unit = parsed[0]?.unit;
  if (known.length === portions.length && parsed.every((p) => p && p.unit === unit))
    return `${formatGrams(parsed.reduce((s, p) => s + p!.amount, 0))} ${unit}`;
  return known.join(' + ');
}

const sumOptional = (values: (number | null | undefined)[]) =>
  values.some((v) => v != null) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null;

/**
 * The day's dishes with the same name as one, amounts and nutrition summed, in
 * the order each was first eaten. `parts` are the merged rows.
 */
export function mergeDishes<T extends Dish>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizeDish(row.name);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((parts) => ({
    ...parts[0],
    ...sumMacros(parts),
    portion: sumPortions(parts.map((p) => p.portion)),
    fiberG: sumOptional(parts.map((p) => p.fiberG)),
    sugarG: sumOptional(parts.map((p) => p.sugarG)),
    parts,
  }));
}

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
