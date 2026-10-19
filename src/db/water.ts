import { asc, eq, gte } from 'drizzle-orm';

import { addDays, DEFAULT_WATER_GOAL_ML, startOfDay } from '@/lib/water';
import { db } from './client';
import { getDayWindow } from './reminders';
import { settings, waterIntakes } from './schema';

const GOAL_KEY = 'water_goal_ml';
export const HISTORY_DAYS = 7;

export async function getWaterGoal() {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, GOAL_KEY) });
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WATER_GOAL_ML;
}

export async function setWaterGoal(ml: number) {
  await db
    .insert(settings)
    .values({ key: GOAL_KEY, value: String(ml) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(ml) } });
}

export async function addWater(amountMl: number, at = Date.now()) {
  await db.insert(waterIntakes).values({ drankAt: at, amountMl });
}

export async function updateWater(id: number, amountMl: number) {
  await db.update(waterIntakes).set({ amountMl }).where(eq(waterIntakes.id, id));
}

export async function deleteWater(id: number) {
  await db.delete(waterIntakes).where(eq(waterIntakes.id, id));
}

/**
 * Today's glasses (oldest first), the goal, the waking hours it is spread
 * over, and per-day totals for the last `HISTORY_DAYS` days ending today.
 */
export async function loadWater(now = Date.now()) {
  const today = startOfDay(now);
  const from = addDays(today, -(HISTORY_DAYS - 1));
  const [goal, dayWindow, rows] = await Promise.all([
    getWaterGoal(),
    getDayWindow(),
    db.query.waterIntakes.findMany({
      where: gte(waterIntakes.drankAt, from),
      orderBy: [asc(waterIntakes.drankAt)],
    }),
  ]);
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => ({
    dayStart: addDays(from, i),
    totalMl: 0,
  }));
  for (const r of rows) {
    const day = days.findLast((d) => r.drankAt >= d.dayStart);
    if (day) day.totalMl += r.amountMl;
  }
  const todayEntries = rows.filter((r) => r.drankAt >= today);
  return {
    goal,
    todayEntries,
    todayMl: todayEntries.reduce((sum, r) => sum + r.amountMl, 0),
    days,
    today,
    dayWindow,
  };
}
