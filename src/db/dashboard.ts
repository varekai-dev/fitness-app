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

export async function getDashboard(): Promise<Widget[]> {
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
