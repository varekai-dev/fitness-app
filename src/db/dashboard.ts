import { eq, gte } from 'drizzle-orm';

import {
  newWidgetId,
  parseDashboard,
  type Widget,
  type WidgetSize,
  type WidgetType,
} from '@/lib/dashboard';
import { STREAK_DAYS, totalsByDay } from '@/lib/stats';
import { addDays } from '@/lib/water';
import { listBodyWeights } from './body-weight';
import { db } from './client';
import { loadFood } from './food';
import { getActiveProgram, getNextDayId } from './programs';
import { foodEntries, settings, waterIntakes } from './schema';
import { loadWater } from './water';
import { getActiveWorkout, listFinishedWorkouts } from './workouts';

const LAYOUT_KEY = 'dashboard_layout';
// Set once the daily phrase, which used to be the Home headline, became a widget.
const QUOTE_MIGRATED_KEY = 'dashboard_quote_added';

/**
 * A layout saved before the quote widget existed gets the phrase on top, once.
 * Synchronous, so screens loading the dashboard at the same time can't both add it.
 */
function addQuoteToOldLayout() {
  db.transaction((tx) => {
    const done = tx.select().from(settings).where(eq(settings.key, QUOTE_MIGRATED_KEY)).get();
    if (done) return;
    const row = tx.select().from(settings).where(eq(settings.key, LAYOUT_KEY)).get();
    if (row) {
      const quote: Widget = { id: newWidgetId(), type: 'quote', size: 'medium' };
      const value = JSON.stringify([quote, ...parseDashboard(row.value)]);
      tx.update(settings).set({ value }).where(eq(settings.key, LAYOUT_KEY)).run();
    }
    tx.insert(settings).values({ key: QUOTE_MIGRATED_KEY, value: '1' }).run();
  });
}

export async function getDashboard(): Promise<Widget[]> {
  addQuoteToOldLayout();
  const row = await db.query.settings.findFirst({ where: eq(settings.key, LAYOUT_KEY) });
  return parseDashboard(row?.value);
}

export async function saveDashboard(widgets: Widget[]) {
  const value = JSON.stringify(widgets);
  await db
    .insert(settings)
    .values({ key: LAYOUT_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function addWidget(type: WidgetType, size: WidgetSize) {
  const widgets = await getDashboard();
  await saveDashboard([...widgets, { id: newWidgetId(), type, size }]);
}

/** Water and kcal per day over the streak window, for the streak tiles. */
async function loadDailyTotals(now: number) {
  const from = addDays(now, -STREAK_DAYS);
  const [water, food] = await Promise.all([
    db
      .select({ at: waterIntakes.drankAt, amount: waterIntakes.amountMl })
      .from(waterIntakes)
      .where(gte(waterIntakes.drankAt, from)),
    db
      .select({ at: foodEntries.eatenAt, amount: foodEntries.kcal })
      .from(foodEntries)
      .where(gte(foodEntries.eatenAt, from)),
  ]);
  const byDay = (rows: { at: number; amount: number }[]) =>
    totalsByDay(
      rows,
      (r) => r.at,
      (r) => r.amount,
    );
  return { waterMl: byDay(water), foodKcal: byDay(food) };
}

/** Everything any widget may show, loaded once for the whole dashboard. */
export async function loadDashboardData() {
  const now = Date.now();
  const [activeWorkout, program, finished, bodyWeights, water, food, daily] =
    await Promise.all([
      getActiveWorkout(),
      getActiveProgram(),
      listFinishedWorkouts(),
      listBodyWeights(),
      loadWater(now),
      loadFood(now),
      loadDailyTotals(now),
    ]);
  const nextDayId = program ? await getNextDayId(program.id) : null;
  const nextDay = program?.days.find((d) => d.id === nextDayId) ?? null;
  return {
    activeWorkout,
    program,
    nextDay,
    finished,
    bodyWeights,
    water,
    food,
    daily,
    loadedAt: now,
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;
