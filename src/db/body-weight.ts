import { and, asc, eq, gte, lt } from 'drizzle-orm';

import { db } from './client';
import { bodyWeights } from './schema';

export type WeightReading = { measuredAt: number; weightKg: number };

const startOfDay = (at: number) => new Date(at).setHours(0, 0, 0, 0);

/** Oldest first, ready for the chart. */
export const listBodyWeights = () =>
  db.query.bodyWeights.findMany({ orderBy: [asc(bodyWeights.measuredAt)] });

/** Logs today's weight; weighing again the same day replaces the earlier entry. */
export function saveBodyWeight(weightKg: number, at = Date.now()) {
  const dayStart = new Date(startOfDay(at));
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  db.transaction((tx) => {
    tx.delete(bodyWeights)
      .where(
        and(
          gte(bodyWeights.measuredAt, dayStart.getTime()),
          lt(bodyWeights.measuredAt, nextDay.getTime()),
        ),
      )
      .run();
    tx.insert(bodyWeights).values({ measuredAt: at, weightKg }).run();
  });
}

/**
 * Merges weighings from another app, keeping the one-entry-per-day rule: a day's
 * latest reading is saved unless the log already holds a newer entry for that
 * day. Importing the same readings again changes nothing. Returns the number of
 * days written.
 */
export async function importBodyWeights(readings: WeightReading[]) {
  const latestByDay = new Map<number, WeightReading>();
  for (const r of readings) {
    const day = startOfDay(r.measuredAt);
    const current = latestByDay.get(day);
    if (!current || r.measuredAt > current.measuredAt) latestByDay.set(day, r);
  }

  const loggedByDay = new Map<number, number>();
  for (const w of await listBodyWeights()) {
    const day = startOfDay(w.measuredAt);
    loggedByDay.set(day, Math.max(loggedByDay.get(day) ?? 0, w.measuredAt));
  }

  let imported = 0;
  for (const [day, r] of latestByDay) {
    if ((loggedByDay.get(day) ?? -Infinity) >= r.measuredAt) continue;
    saveBodyWeight(r.weightKg, r.measuredAt);
    imported++;
  }
  return imported;
}

export async function deleteBodyWeight(id: number) {
  await db.delete(bodyWeights).where(eq(bodyWeights.id, id));
}
