import { and, asc, eq, gte, lt } from 'drizzle-orm';

import { db } from './client';
import { bodyWeights } from './schema';

/** Oldest first, ready for the chart. */
export const listBodyWeights = () =>
  db.query.bodyWeights.findMany({ orderBy: [asc(bodyWeights.measuredAt)] });

/** Logs today's weight; weighing again the same day replaces the earlier entry. */
export function saveBodyWeight(weightKg: number, at = Date.now()) {
  const dayStart = new Date(at);
  dayStart.setHours(0, 0, 0, 0);
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

export async function deleteBodyWeight(id: number) {
  await db.delete(bodyWeights).where(eq(bodyWeights.id, id));
}
