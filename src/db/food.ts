import { and, asc, desc, eq, gte, inArray, like, lt } from 'drizzle-orm';

import {
  amountUnit,
  DEFAULT_KCAL_GOAL,
  describeDishes,
  formatGrams,
  macroTargets,
  normalizeDish,
  scaleNutrition,
  sumMacros,
  type Macros,
} from '@/lib/food';
import {
  askGroqDayReview,
  askGroqHealth,
  askGroqMacroTips,
  askGroqNutrition,
  type DayReview,
  type MacroKey,
  type MacroTips,
} from '@/lib/groq';
import { lang } from '@/lib/i18n';
import { MEALS, mealOf } from '@/lib/meals';
import { addDays, startOfDay } from '@/lib/water';
import { db } from './client';
import { loadProfile } from './profile';
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

/** Daily protein, fat and carbs for the kcal goal, from the profile's weight goal and latest weight. */
async function nutritionTargets(kcalGoal: number) {
  const { profile, latestWeight } = await loadProfile();
  return {
    weightGoal: profile.goal,
    targets: macroTargets(kcalGoal, latestWeight?.weightKg ?? null, profile.goal),
  };
}

const REVIEW_PREFIX = 'food_review_';
/** Comments on days further back are dropped when a new one is saved. */
const REVIEW_KEEP_DAYS = 30;

/** An AI comment on a day and the state of the day it was written for. */
export type StoredReview = { signature: string; review: DayReview };

/**
 * What a day's comment depends on: a dish logged or removed, a new goal, or the
 * day being over (no more "still to eat") makes the stored comment stale.
 */
const reviewSignature = (entries: FoodEntry[], targets: Macros, isToday: boolean) =>
  [
    lang,
    isToday ? 'today' : 'past',
    targets.kcal,
    targets.proteinG,
    targets.fatG,
    targets.carbsG,
    ...entries.map((e) => `${e.id}:${Math.round(e.kcal)}`),
  ].join('|');

async function getDayReview(day: number): Promise<StoredReview | null> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.key, REVIEW_PREFIX + day),
  });
  if (!row) return null;
  try {
    const stored = JSON.parse(row.value) as StoredReview;
    return typeof stored.signature === 'string' && stored.review?.headline ? stored : null;
  } catch {
    return null;
  }
}

/** Asks AI to comment on the food of `day` and stores the answer for that day. */
export async function reviewDay(day: number, now = Date.now()) {
  const today = startOfDay(now);
  const [kcalGoal, entries] = await Promise.all([
    getKcalGoal(),
    db.query.foodEntries.findMany({
      where: and(gte(foodEntries.eatenAt, day), lt(foodEntries.eatenAt, addDays(day, 1))),
      orderBy: [asc(foodEntries.eatenAt)],
    }),
  ]);
  const { weightGoal, targets } = await nutritionTargets(kcalGoal);
  const isToday = day === today;
  const review = await askGroqDayReview({
    isToday,
    now,
    goal: weightGoal,
    targets,
    entries: entries.map((e) => ({ ...e, meal: mealOf(e) })),
  });
  const stored: StoredReview = { signature: reviewSignature(entries, targets, isToday), review };
  const value = JSON.stringify(stored);
  await db
    .insert(settings)
    .values({ key: REVIEW_PREFIX + day, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });

  const old = await db.query.settings.findMany({ where: like(settings.key, `${REVIEW_PREFIX}%`) });
  const cutoff = addDays(today, -REVIEW_KEEP_DAYS);
  const expired = old
    .map((r) => r.key)
    .filter((key) => Number(key.slice(REVIEW_PREFIX.length)) < cutoff);
  if (expired.length) await db.delete(settings).where(inArray(settings.key, expired));
}

const MACRO_TIPS_PREFIX = 'macro_tips_';

/** AI's foods rich in a macro and the state of the day they were picked for. */
export type StoredMacroTips = { signature: string; tips: MacroTips };

const dayEntries = (day: number) =>
  db.query.foodEntries.findMany({
    where: and(gte(foodEntries.eatenAt, day), lt(foodEntries.eatenAt, addDays(day, 1))),
    orderBy: [asc(foodEntries.eatenAt)],
  });

/** What the tips depend on: the day's dishes of this macro and the goal. */
const macroSignature = (macro: MacroKey, day: number, entries: FoodEntry[], target: number) =>
  [lang, day, Math.round(target), ...entries.map((e) => `${e.id}:${Math.round(e[macro])}`)].join(
    '|',
  );

/**
 * The dishes of `day` with some of `macro`, richest first, the day's total and
 * goal of it, and AI's stored tips with the signature they must match.
 */
export async function loadMacro(macro: MacroKey, day: number) {
  const [kcalGoal, entries, row] = await Promise.all([
    getKcalGoal(),
    dayEntries(day),
    db.query.settings.findFirst({ where: eq(settings.key, MACRO_TIPS_PREFIX + macro) }),
  ]);
  const { targets } = await nutritionTargets(kcalGoal);
  let tips: StoredMacroTips | null = null;
  try {
    const parsed = row ? (JSON.parse(row.value) as StoredMacroTips) : null;
    if (typeof parsed?.signature === 'string' && parsed.tips?.foods?.length) tips = parsed;
  } catch {}
  return {
    entries: entries.filter((e) => e[macro] > 0).sort((a, b) => b[macro] - a[macro]),
    total: entries.reduce((s, e) => s + e[macro], 0),
    target: targets[macro],
    tips,
    signature: macroSignature(macro, day, entries, targets[macro]),
  };
}

/** Asks AI for foods rich in `macro`, given the day so far, and stores the answer. */
export async function adviseMacro(macro: MacroKey, day: number) {
  const [kcalGoal, entries] = await Promise.all([getKcalGoal(), dayEntries(day)]);
  const { targets } = await nutritionTargets(kcalGoal);
  const tips = await askGroqMacroTips({
    macro,
    target: targets[macro],
    entries: entries
      .filter((e) => e[macro] > 0)
      .map((e) => ({ name: e.name, portion: e.portion, grams: e[macro] })),
  });
  const stored: StoredMacroTips = {
    signature: macroSignature(macro, day, entries, targets[macro]),
    tips,
  };
  const value = JSON.stringify(stored);
  await db
    .insert(settings)
    .values({ key: MACRO_TIPS_PREFIX + macro, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

/**
 * Meals of `day` (oldest first, today by default), their totals, the goals,
 * per-day kcal for the week up to today, what can be logged again (each meal's
 * last earlier occurrence and the saved templates), and the day's AI comment
 * with the signature it must match to be current.
 */
export async function loadFood(now = Date.now(), day = startOfDay(now)) {
  const today = startOfDay(now);
  const from = addDays(today, -(FOOD_HISTORY_DAYS - 1));
  const dayEnd = addDays(day, 1);
  const [goal, rows, recent, previous, templates, review] = await Promise.all([
    getKcalGoal(),
    db.query.foodEntries.findMany({
      where: gte(foodEntries.eatenAt, Math.min(from, day)),
      orderBy: [asc(foodEntries.eatenAt)],
    }),
    db.query.foods.findMany({ orderBy: [desc(foods.lastUsedAt)], limit: 12 }),
    previousMeals(day),
    listMealTemplates(),
    getDayReview(day),
  ]);
  const { targets } = await nutritionTargets(goal);
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
    targets,
    dayEntries,
    totals: sumMacros(dayEntries),
    review,
    reviewSignature: reviewSignature(dayEntries, targets, day === today),
    days,
    today,
    recent,
    previous,
    templates,
  };
}
