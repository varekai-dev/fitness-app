import { desc, eq, isNull } from 'drizzle-orm';

import { db } from './client';
import { activities } from './schema';

/** Activities imported from a health app earlier, still shown in the history, newest first. */
export const listActivities = () =>
  db.query.activities.findMany({
    where: isNull(activities.hiddenAt),
    orderBy: [desc(activities.startedAt)],
  });

/** Hides the activity from the history. */
export async function hideActivity(id: number) {
  await db.update(activities).set({ hiddenAt: Date.now() }).where(eq(activities.id, id));
}
