import { eq } from 'drizzle-orm';

import {
  newWidgetId,
  parseDashboard,
  type Widget,
  type WidgetSize,
  type WidgetType,
} from '@/lib/dashboard';
import { listBodyWeights } from './body-weight';
import { db } from './client';
import { loadFood } from './food';
import { getActiveProgram, getNextDayId } from './programs';
import { settings } from './schema';
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

/** Everything any widget may show, loaded once for the whole dashboard. */
export async function loadDashboardData() {
  const [activeWorkout, program, finished, bodyWeights, water, food] = await Promise.all([
    getActiveWorkout(),
    getActiveProgram(),
    listFinishedWorkouts(),
    listBodyWeights(),
    loadWater(),
    loadFood(),
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
    loadedAt: Date.now(),
  };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;
