import { asc, desc, eq, gte, like } from 'drizzle-orm';

import {
  amountUnit,
  DEFAULT_KCAL_GOAL,
  formatGrams,
  normalizeDish,
  scaleNutrition,
  sumMacros,
} from '@/lib/food';
import { askGroqHealth, askGroqNutrition } from '@/lib/groq';
import { addDays, startOfDay } from '@/lib/water';
import { db } from './client';
import { foodEntries, foods, settings, type Food, type Meal } from './schema';

const GOAL_KEY = 'kcal_goal';
export const FOOD_HISTORY_DAYS = 7;

export async function getKcalGoal() {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, GOAL_KEY) });
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_KCAL_GOAL;
}

export async function setKcalGoal(kcal: number) {
  await db
    .insert(settings)
    .values({ key: GOAL_KEY, value: String(kcal) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(kcal) } });
}

/** Cached dishes whose text contains `text`, most recently used first. */
export async function searchFoods(text: string, limit = 5) {
  const q = normalizeDish(text);
  return db.query.foods.findMany({
    where: q ? like(foods.query, `%${q.replace(/[%_]/g, '')}%`) : undefined,
    orderBy: [desc(foods.lastUsedAt)],
    limit,
  });
}

/**
 * Nutrition for `text`: from the local cache when this dish was looked up
 * before, otherwise from Groq, storing the answer for next time. Dishes cached
 * before portions had a weight are asked again, since logging is by grams.
 */
export async function lookupFood(text: string): Promise<{ food: Food; cached: boolean }> {
  const query = normalizeDish(text);
  const existing = await db.query.foods.findFirst({ where: eq(foods.query, query) });
  if (existing?.portionG) return { food: existing, cached: true };

  const nutrition = await askGroqNutrition(text.trim());
  const [food] = await db
    .insert(foods)
    .values({ query, ...nutrition })
    .onConflictDoUpdate({ target: foods.query, set: nutrition })
    .returning();
  return { food, cached: false };
}

export type ManualFood = Pick<Food, 'name' | 'isDrink' | 'kcal' | 'proteinG' | 'fatG' | 'carbsG'>;

/**
 * Saves a dish entered by hand, its values per 100 g (or ml), replacing a cached
 * dish of the same name.
 */
export async function saveFood(food: ManualFood): Promise<Food> {
  const values = {
    ...food,
    name: food.name.trim(),
    portion: `100 ${amountUnit(food)}`,
    portionG: 100,
    fiberG: null,
    sugarG: null,
    // New numbers need a new rating: AI rates the dish once it's picked.
    health: null,
    healthNote: null,
  };
  const [saved] = await db
    .insert(foods)
    .values({ query: normalizeDish(food.name), ...values })
    .onConflictDoUpdate({ target: foods.query, set: values })
    .returning();
  return saved;
}

/** Asks AI how healthy a cached dish is (by its nutrition per 100 g) and stores the answer. */
export async function rateFood(food: Food): Promise<Food> {
  const rating = await askGroqHealth({ name: food.name, ...scaleNutrition(food, 100) });
  const [rated] = await db.update(foods).set(rating).where(eq(foods.id, food.id)).returning();
  return rated ?? { ...food, ...rating };
}

export async function deleteFood(id: number) {
  await db.delete(foods).where(eq(foods.id, id));
}

/**
 * Logs `amount` of a cached dish into `meal`, in grams or, when `isDrink`,
 * millilitres, scaling its portion's nutrition. A unit the user switched is
 * remembered on the cached dish for next time.
 */
export async function logFood(
  food: Food,
  amount: number,
  meal: Meal,
  isDrink = food.isDrink,
  at = Date.now(),
) {
  await db.transaction((tx) => {
    tx.insert(foodEntries)
      .values({
        eatenAt: at,
        meal,
        foodId: food.id,
        name: food.name,
        portion: `${formatGrams(amount)} ${amountUnit({ isDrink })}`,
        grams: amount,
        ...scaleNutrition(food, amount),
      })
      .run();
    tx.update(foods).set({ lastUsedAt: at, isDrink }).where(eq(foods.id, food.id)).run();
  });
}

export async function deleteFoodEntry(id: number) {
  await db.delete(foodEntries).where(eq(foodEntries.id, id));
}

/**
 * Meals of `day` (oldest first, today by default), their totals, the goal and
 * per-day kcal for the week up to today.
 */
export async function loadFood(now = Date.now(), day = startOfDay(now)) {
  const today = startOfDay(now);
  const from = addDays(today, -(FOOD_HISTORY_DAYS - 1));
  const dayEnd = addDays(day, 1);
  const [goal, rows, recent] = await Promise.all([
    getKcalGoal(),
    db.query.foodEntries.findMany({
      where: gte(foodEntries.eatenAt, Math.min(from, day)),
      orderBy: [asc(foodEntries.eatenAt)],
    }),
    db.query.foods.findMany({ orderBy: [desc(foods.lastUsedAt)], limit: 12 }),
  ]);
  const days = Array.from({ length: FOOD_HISTORY_DAYS }, (_, i) => ({
    dayStart: addDays(from, i),
    kcal: 0,
  }));
  for (const r of rows) {
    const d = days.findLast((x) => r.eatenAt >= x.dayStart);
    if (d) d.kcal += r.kcal;
  }
  const dayEntries = rows.filter((r) => r.eatenAt >= day && r.eatenAt < dayEnd);
  return { goal, dayEntries, totals: sumMacros(dayEntries), days, today, recent };
}
