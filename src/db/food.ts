import { and, asc, desc, eq, gte, inArray, like, lt } from 'drizzle-orm';

import {
  amountUnit,
  DEFAULT_KCAL_GOAL,
  describeDishes,
  formatGrams,
  normalizeDish,
  scaleNutrition,
  sumMacros,
} from '@/lib/food';
import { askGroqHealth, askGroqNutrition } from '@/lib/groq';
import { MEALS, mealOf } from '@/lib/meals';
import { addDays, startOfDay } from '@/lib/water';
import { db } from './client';
import {
  foodEntries,
  foods,
  mealTemplates,
  settings,
  type Food,
  type FoodEntry,
  type Meal,
  type MealTemplate,
  type MealTemplateItem,
} from './schema';

const GOAL_KEY = 'kcal_goal';
export const FOOD_HISTORY_DAYS = 7;
/** How far back a meal is looked for to offer repeating it. */
const REPEAT_LOOKBACK_DAYS = 14;

/**
 * The time of day of `timeOf` (now by default) on `day`, a local midnight, but
 * never in the future: logging into a past day or today keeps a sensible time.
 */
export function timeOnDay(day: number, timeOf = Date.now()) {
  const now = Date.now();
  return Math.min(day + (timeOf - startOfDay(timeOf)), addDays(day, 1) - 1, now);
}

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

const toItem = (e: FoodEntry): MealTemplateItem => ({
  foodId: e.foodId,
  name: e.name,
  portion: e.portion,
  grams: e.grams,
  kcal: e.kcal,
  proteinG: e.proteinG,
  fatG: e.fatG,
  carbsG: e.carbsG,
  fiberG: e.fiberG,
  sugarG: e.sugarG,
});

/** Logs copies of `items` into `meal`, at `at(item index)`. Links to dishes since removed are dropped. */
async function logItems(items: MealTemplateItem[], meal: Meal, at: (i: number) => number) {
  if (items.length === 0) return;
  const ids = items.map((i) => i.foodId).filter((id) => id !== null);
  const known = new Set(
    ids.length
      ? (await db.select({ id: foods.id }).from(foods).where(inArray(foods.id, ids))).map(
          (f) => f.id,
        )
      : [],
  );
  await db.insert(foodEntries).values(
    items.map((item, i) => ({
      ...item,
      foodId: item.foodId !== null && known.has(item.foodId) ? item.foodId : null,
      meal,
      eatenAt: at(i),
    })),
  );
}

/** Copies a meal from another day into `day`, each dish at the time of day it was eaten then. */
export async function repeatMeal(entries: FoodEntry[], meal: Meal, day: number) {
  await logItems(entries.map(toItem), meal, (i) => timeOnDay(day, entries[i].eatenAt));
}

export const listMealTemplates = () =>
  db.query.mealTemplates.findMany({ orderBy: [desc(mealTemplates.lastUsedAt)] });

/** Saves a logged meal as a template named after its dishes. Resolves to that name. */
export async function saveMealTemplate(entries: FoodEntry[]) {
  const name = describeDishes(entries.map((e) => e.name));
  const items = entries.map(toItem);
  await db
    .insert(mealTemplates)
    .values({ name, items })
    .onConflictDoUpdate({ target: mealTemplates.name, set: { items, lastUsedAt: Date.now() } });
  return name;
}

/** Logs a template's dishes into `meal` at `at`. */
export async function applyMealTemplate(template: MealTemplate, meal: Meal, at = Date.now()) {
  await logItems(template.items, meal, () => at);
  await db
    .update(mealTemplates)
    .set({ lastUsedAt: Date.now() })
    .where(eq(mealTemplates.id, template.id));
}

export async function deleteMealTemplate(id: number) {
  await db.delete(mealTemplates).where(eq(mealTemplates.id, id));
}

/**
 * For each meal, the latest earlier day it was logged on (within two weeks of
 * `day`) and its dishes, to offer repeating it.
 */
async function previousMeals(day: number) {
  const rows = await db.query.foodEntries.findMany({
    where: and(
      gte(foodEntries.eatenAt, addDays(day, -REPEAT_LOOKBACK_DAYS)),
      lt(foodEntries.eatenAt, day),
    ),
    orderBy: [asc(foodEntries.eatenAt)],
  });
  const previous = {} as Record<Meal, { day: number; entries: FoodEntry[] } | null>;
  for (const meal of MEALS) {
    const ofMeal = rows.filter((e) => mealOf(e) === meal);
    const last = ofMeal.at(-1);
    const lastDay = last ? startOfDay(last.eatenAt) : null;
    previous[meal] =
      lastDay === null
        ? null
        : { day: lastDay, entries: ofMeal.filter((e) => startOfDay(e.eatenAt) === lastDay) };
  }
  return previous;
}

/**
 * Meals of `day` (oldest first, today by default), their totals, the goal,
 * per-day kcal for the week up to today, and what can be logged again: each
 * meal's last earlier occurrence and the saved templates.
 */
export async function loadFood(now = Date.now(), day = startOfDay(now)) {
  const today = startOfDay(now);
  const from = addDays(today, -(FOOD_HISTORY_DAYS - 1));
  const dayEnd = addDays(day, 1);
  const [goal, rows, recent, previous, templates] = await Promise.all([
    getKcalGoal(),
    db.query.foodEntries.findMany({
      where: gte(foodEntries.eatenAt, Math.min(from, day)),
      orderBy: [asc(foodEntries.eatenAt)],
    }),
    db.query.foods.findMany({ orderBy: [desc(foods.lastUsedAt)], limit: 12 }),
    previousMeals(day),
    listMealTemplates(),
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
  return {
    goal,
    dayEntries,
    totals: sumMacros(dayEntries),
    days,
    today,
    recent,
    previous,
    templates,
  };
}
