import { asc, gte, sql } from 'drizzle-orm';

import { db } from './client';
import { dailyHealth } from './schema';

/** One day's totals from a health app; a field left out keeps what the log holds. */
export type DailyHealthReading = { day: number; steps?: number; sleepMin?: number };

/** Upserts the days read from a health app; reading a day again replaces its totals. */
export function importDailyHealth(readings: DailyHealthReading[]) {
  db.transaction((tx) => {
    for (const r of readings) {
      const set = {
        ...(r.steps !== undefined && { steps: r.steps }),
        ...(r.sleepMin !== undefined && { sleepMin: r.sleepMin }),
      };
      if (Object.keys(set).length === 0) continue;
      tx.insert(dailyHealth)
        .values({ day: r.day, ...set })
        .onConflictDoUpdate({ target: dailyHealth.day, set })
        .run();
    }
  });
}

/** Days from `fromDay` on, oldest first. */
export const listDailyHealth = (fromDay: number) =>
  db.query.dailyHealth.findMany({
    where: gte(dailyHealth.day, fromDay),
    orderBy: [asc(dailyHealth.day)],
  });

/** Whether anything was ever imported, to tell "not connected" from "no steps today". */
export async function hasDailyHealth() {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(dailyHealth);
  return (row?.n ?? 0) > 0;
}
