import { and, asc, desc, eq, gte, inArray, like, lt } from 'drizzle-orm';

import {
  amountUnit,
  DEFAULT_KCAL_GOAL,
  describeDishes,
  dishKey,
  formatGrams,
  macroTargets,
  mergeDishes,
  normalizeDish,
  scaleNutrition,
  splitAmount,
  sumMacros,
  type Macros,
} from '@/lib/food';
import {
  askGroqDayReview,
  askGroqHealth,
  askGroqMacroTips,
  askGroqMealAdvice,
  askGroqNutrition,
  askGroqNutritionList,
  type DayReview,
  type MacroKey,
  type MacroTips,
  type MealAdvice,
  type Nutrition,
  type SuggestedFood,
} from '@/lib/groq';
import { lang, locale } from '@/lib/i18n';
import { MAIN_MEALS, MEALS, mealOf } from '@/lib/meals';
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

/** A dish to open on its card; `amount` is the weight or volume the text asked for, if any. */
export type FoundFood = { food: Food; cached: boolean; amount: number | null };

/**
 * Nutrition for `text`: from the local cache when this dish was looked up
 * before, in any amount ("куряче філе 400 г" reuses "куряче філе 200 г"),
 * otherwise from Groq, storing the answer for next time. Dishes cached before
 * portions had a weight are asked again, since logging is by grams.
 */
export async function lookupFood(text: string): Promise<FoundFood> {
  const { query, amount, cached } = await findCached(text);
  if (cached) return cached;
  return storeNutrition(query, amount, await askGroqNutrition(text.trim()));
}

/** A dish of a list that couldn't be counted, with AI's reason. */
export type FailedFood = { text: string; error: Error };

/**
 * `lookupFood` for each dish of a list, in its order, asking AI once for all
 * the dishes not cached yet. A dish AI couldn't count comes back as
 * `FailedFood`; a failed request throws.
 */
export async function lookupFoods(texts: string[]): Promise<(FoundFood | FailedFood)[]> {
  const found = await Promise.all(texts.map(findCached));
  const asked = texts.filter((_, i) => !found[i].cached);
  const answers = asked.length ? await askGroqNutritionList(asked.map((t) => t.trim())) : [];
  const results: (FoundFood | FailedFood)[] = [];
  let next = 0;
  for (const [i, { query, amount, cached }] of found.entries()) {
    if (cached) {
      results.push(cached);
      continue;
    }
    const answer = answers[next++];
    results.push(
      answer instanceof Error
        ? { text: texts[i], error: answer }
        : await storeNutrition(query, amount, answer),
    );
  }
  return results;
}

/** The cache key and amount of `text`, and its cached dish if there is one with a portion weight. */
async function findCached(text: string) {
  const split = splitAmount(text);
  const query = split?.dish ?? normalizeDish(text);
  const amount = split?.grams ?? null;
  // Dishes cached before amounts were split off are keyed by the whole text.
  const keys = [...new Set([query, normalizeDish(text)])];
  const existing = (await db.query.foods.findMany({ where: inArray(foods.query, keys) })).find(
    (f) => f.portionG,
  );
  const cached: FoundFood | null = existing ? { food: existing, cached: true, amount } : null;
  return { query, amount, cached };
}

/** Stores AI's answer for a dish for next time. */
async function storeNutrition(
  query: string,
  amount: number | null,
  nutrition: Nutrition,
): Promise<FoundFood> {
  const [food] = await db
    .insert(foods)
    .values({ query, ...nutrition })
    .onConflictDoUpdate({ target: foods.query, set: nutrition })
    .returning();
  return { food, cached: false, amount };
}

/**
 * A food AI suggested, cached from the numbers it came with, so opening it asks
 * AI nothing. Null when those aren't enough (no weight in the text, or a
 * suggestion stored before it had all macros): then it's looked up as typed.
 */
export async function cacheSuggestion(suggestion: SuggestedFood): Promise<FoundFood | null> {
  const split = splitAmount(suggestion.text);
  const { kcal, proteinG, fatG, carbsG } = suggestion;
  if (!split || !(kcal > 0) || fatG == null || carbsG == null) return null;
  const existing = await db.query.foods.findFirst({ where: eq(foods.query, split.dish) });
  if (existing?.portionG) return { food: existing, cached: true, amount: split.grams };

  const values = {
    name: split.dish.charAt(0).toLocaleUpperCase(locale) + split.dish.slice(1),
    portion: null,
    portionG: split.grams,
    isDrink: suggestion.isDrink ?? false,
    kcal,
    proteinG,
    fatG,
    carbsG,
    fiberG: null,
    sugarG: null,
    health: suggestion.health ?? null,
    healthNote: null,
  };
  const [food] = await db
    .insert(foods)
    // Not used yet: it shouldn't top the recent dishes until it's logged.
    .values({ query: split.dish, ...values, lastUsedAt: 0 })
    .onConflictDoUpdate({ target: foods.query, set: values })
    .returning();
  return { food, cached: true, amount: split.grams };
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

/**
 * The state of a day a comment is written for. `signature` changes with any
 * dish logged, edited or removed; `basis` is what a comment must be rewritten
 * for by itself: another language or goal, or `kcal` eaten moving by a third
 * of the day's goal.
 */
export type ReviewState = { signature: string; basis: { key: string; kcal: number } };

/** An AI comment on a day and the state of the day it was written for. */
export type StoredReview = {
  signature: string;
  review: DayReview;
  /** The newest entry when it was written; missing on older comments. */
  lastEntryId?: number;
  /** Missing on comments written before small changes stopped rewriting them. */
  basis?: ReviewState['basis'];
};

/** How a stored comment relates to the day now: written for it, a little behind, or worth rewriting. */
export type ReviewChange = 'fresh' | 'minor' | 'major';

function reviewState(entries: FoodEntry[], targets: Macros): ReviewState {
  // Bumped when the comment gains a field, so old ones are written again.
  const key = ['v6', lang, targets.kcal, targets.proteinG, targets.fatG, targets.carbsG].join('|');
  return {
    signature: [key, ...entries.map((e) => `${e.id}:${Math.round(e.kcal)}`)].join('|'),
    basis: { key, kcal: Math.round(entries.reduce((s, e) => s + e.kcal, 0)) },
  };
}

export function reviewChange(
  stored: StoredReview | null,
  state: ReviewState,
  kcalGoal: number,
): ReviewChange {
  if (stored?.signature === state.signature) return 'fresh';
  if (!stored?.basis || stored.basis.key !== state.basis.key) return 'major';
  return Math.abs(state.basis.kcal - stored.basis.kcal) >= kcalGoal / 3 ? 'major' : 'minor';
}

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
  const stored: StoredReview = {
    ...reviewState(entries, targets),
    review,
    lastEntryId: lastEntryId(entries),
  };
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

const dayEntries = (day: number) =>
  db.query.foodEntries.findMany({
    where: and(gte(foodEntries.eatenAt, day), lt(foodEntries.eatenAt, addDays(day, 1))),
    orderBy: [asc(foodEntries.eatenAt)],
  });

/** The newest of `entries`: suggestions made then are hidden only by dishes logged after it. */
const lastEntryId = (entries: FoodEntry[]) => Math.max(0, ...entries.map((e) => e.id));

/**
 * Each entry with the keys of its dish, by name and by the cached dish it came
 * from, so AI suggestions eaten since can be hidden.
 */
async function loggedDishes(entries: FoodEntry[]) {
  const ids = [...new Set(entries.map((e) => e.foodId).filter((id) => id !== null))];
  const cached = ids.length
    ? await db
        .select({ id: foods.id, query: foods.query })
        .from(foods)
        .where(inArray(foods.id, ids))
    : [];
  const queries = new Map(cached.map((f) => [f.id, f.query]));
  return entries.map((e) => {
    const query = e.foodId === null ? undefined : queries.get(e.foodId);
    return { id: e.id, keys: [dishKey(e.name), ...(query ? [dishKey(query)] : [])] };
  });
}

/**
 * Leaves out the suggested foods logged after entry `sinceId` (the newest when
 * they were suggested): a dish eaten before can still be suggested for later.
 */
function uneaten(logged: Awaited<ReturnType<typeof loggedDishes>>, sinceId = 0) {
  const eaten = new Set(logged.filter((l) => l.id > sinceId).flatMap((l) => l.keys));
  return <T extends { text: string }>(foods: T[]) =>
    foods.filter((f) => !eaten.has(dishKey(f.text)));
}

const MEAL_ADVICE_PREFIX = 'meal_advice_';

/** AI's advice on what to eat for a meal and the state of the day it was given for. */
export type StoredMealAdvice = { signature: string; advice: MealAdvice; lastEntryId?: number };

/** Today's stored advice for each meal it was asked for. */
async function getMealAdvice(day: number) {
  const rows = await db.query.settings.findMany({
    where: like(settings.key, `${MEAL_ADVICE_PREFIX}${day}_%`),
  });
  const advice: Partial<Record<Meal, StoredMealAdvice>> = {};
  for (const row of rows) {
    const meal = MEALS.find((m) => row.key === `${MEAL_ADVICE_PREFIX}${day}_${m}`);
    try {
      const stored = JSON.parse(row.value) as StoredMealAdvice;
      if (meal && typeof stored.signature === 'string' && stored.advice?.dishes?.length)
        advice[meal] = stored;
    } catch {}
  }
  return advice;
}

/**
 * Asks AI what to eat for `meal` today to cover its share of what's left (split
 * with the main meals still empty after it) and stores the answer. Advice for
 * other days is dropped: it's only useful while the day is going.
 */
export async function adviseMeal(meal: Meal, now = Date.now()) {
  const day = startOfDay(now);
  const [kcalGoal, entries] = await Promise.all([getKcalGoal(), dayEntries(day)]);
  const { weightGoal, targets } = await nutritionTargets(kcalGoal);
  const logged = entries.map((e) => ({ ...e, meal: mealOf(e) }));
  const advice = await askGroqMealAdvice({
    now,
    goal: weightGoal,
    targets,
    entries: logged,
    meal,
    later: MAIN_MEALS.slice(MAIN_MEALS.indexOf(meal) + 1).filter(
      (m) => !logged.some((e) => e.meal === m),
    ),
  });
  const stored: StoredMealAdvice = {
    signature: reviewState(entries, targets).signature,
    advice,
    lastEntryId: lastEntryId(entries),
  };
  const key = `${MEAL_ADVICE_PREFIX}${day}_${meal}`;
  const value = JSON.stringify(stored);
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });

  const old = await db.query.settings.findMany({
    where: like(settings.key, `${MEAL_ADVICE_PREFIX}%`),
  });
  const expired = old
    .map((r) => r.key)
    .filter((k) => !k.startsWith(`${MEAL_ADVICE_PREFIX}${day}_`));
  if (expired.length) await db.delete(settings).where(inArray(settings.key, expired));
}

const MACRO_TIPS_PREFIX = 'macro_tips_';

/** AI's foods rich in a macro and the state of the day they were picked for. */
export type StoredMacroTips = { signature: string; tips: MacroTips; lastEntryId?: number };

/** What the tips depend on: the day's dishes of this macro and the goal. */
const macroSignature = (macro: MacroKey, day: number, entries: FoodEntry[], target: number) =>
  // v2: dishes of the same name merged.
  [
    'v2',
    lang,
    day,
    Math.round(target),
    ...entries.map((e) => `${e.id}:${Math.round(e[macro])}`),
  ].join('|');

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
  const logged = await loggedDishes(entries);
  let tips: StoredMacroTips | null = null;
  try {
    const parsed = row ? (JSON.parse(row.value) as StoredMacroTips) : null;
    if (typeof parsed?.signature === 'string' && parsed.tips?.foods?.length) {
      const foods = uneaten(logged, parsed.lastEntryId)(parsed.tips.foods);
      tips = { ...parsed, tips: { ...parsed.tips, foods } };
    }
  } catch {}
  return {
    entries: mergeDishes(entries)
      .filter((e) => e[macro] > 0)
      .sort((a, b) => b[macro] - a[macro]),
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
    entries: mergeDishes(entries)
      .filter((e) => e[macro] > 0)
      .map((e) => ({ name: e.name, portion: e.portion, grams: e[macro] })),
  });
  const stored: StoredMacroTips = {
    signature: macroSignature(macro, day, entries, targets[macro]),
    tips,
    lastEntryId: lastEntryId(entries),
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
  const [goal, rows, recent, previous, templates, review, mealAdvice] = await Promise.all([
    getKcalGoal(),
    db.query.foodEntries.findMany({
      where: gte(foodEntries.eatenAt, Math.min(from, day)),
      orderBy: [asc(foodEntries.eatenAt)],
    }),
    db.query.foods.findMany({ orderBy: [desc(foods.lastUsedAt)], limit: 12 }),
    previousMeals(day),
    listMealTemplates(),
    getDayReview(day),
    getMealAdvice(day),
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
  // Suggestions logged since they were made disappear; advice with nothing left goes too.
  const logged = await loggedDishes(dayEntries);
  const shownAdvice: typeof mealAdvice = {};
  for (const meal of MEALS) {
    const stored = mealAdvice[meal];
    const dishes = stored ? uneaten(logged, stored.lastEntryId)(stored.advice.dishes) : [];
    if (stored && dishes.length)
      shownAdvice[meal] = { ...stored, advice: { ...stored.advice, dishes } };
  }
  const keep = uneaten(logged, review?.lastEntryId);
  return {
    goal,
    targets,
    dayEntries,
    totals: sumMacros(dayEntries),
    review: review && {
      ...review,
      review: {
        ...review.review,
        snacks: keep(review.review.snacks),
        fill: review.review.fill && keep(review.review.fill),
      },
    },
    reviewState: reviewState(dayEntries, targets),
    mealAdvice: shownAdvice,
    days,
    today,
    recent,
    previous,
    templates,
  };
}
