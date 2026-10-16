import { desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from './client';
import { activities, workouts, type Activity } from './schema';

export type ActivityReading = Omit<Activity, 'id' | 'hiddenAt'>;

/** Imported activities still shown in the history, newest first. */
export const listActivities = () =>
  db.query.activities.findMany({
    where: isNull(activities.hiddenAt),
    orderBy: [desc(activities.startedAt)],
  });

/**
 * Upserts sessions read from a health app by their external id, so syncing
 * again only refreshes them. Sessions overlapping a workout recorded here are
 * skipped: a watch logging the same gym session would show it twice. Returns
 * the number of new activities.
 */
export async function importActivities(readings: ActivityReading[]) {
  const recorded = await db
    .select({ startedAt: workouts.startedAt, finishedAt: workouts.finishedAt })
    .from(workouts)
    .where(isNotNull(workouts.finishedAt));
  const overlapsWorkout = (r: ActivityReading) =>
    recorded.some((w) => r.startedAt < w.finishedAt! && r.finishedAt > w.startedAt);
  const known = new Set(
    (await db.select({ externalId: activities.externalId }).from(activities)).map(
      (a) => a.externalId,
    ),
  );

  let added = 0;
  db.transaction((tx) => {
    for (const r of readings) {
      if (r.finishedAt <= r.startedAt || overlapsWorkout(r)) continue;
      if (!known.has(r.externalId)) added++;
      tx.insert(activities)
        .values(r)
        .onConflictDoUpdate({ target: activities.externalId, set: r })
        .run();
    }
  });
  return added;
}

/** Hides the activity instead of deleting it, so the next sync doesn't restore it. */
export async function hideActivity(id: number) {
  await db.update(activities).set({ hiddenAt: Date.now() }).where(eq(activities.id, id));
}
