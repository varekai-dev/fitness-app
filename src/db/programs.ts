import { and, asc, desc, eq, isNotNull, isNull, max, ne } from 'drizzle-orm';

import { db, type Tx } from './client';
import {
  exercises,
  programDayExercises,
  programDays,
  programs,
  workouts,
  type Targets,
  type TrackingType,
} from './schema';

export const listPrograms = () =>
  db.query.programs.findMany({
    where: isNull(programs.archivedAt),
    orderBy: [desc(programs.isActive), asc(programs.name)],
    with: { days: { columns: { id: true } } },
  });

export const getProgram = (id: number) =>
  db.query.programs.findFirst({
    where: eq(programs.id, id),
    with: {
      days: {
        orderBy: [asc(programDays.position)],
        with: {
          exercises: {
            orderBy: [asc(programDayExercises.position)],
            with: { exercise: { columns: { name: true } } },
          },
        },
      },
    },
  });

export const getActiveProgram = () =>
  db.query.programs.findFirst({
    where: and(eq(programs.isActive, true), isNull(programs.archivedAt)),
    with: {
      days: {
        orderBy: [asc(programDays.position)],
        with: {
          exercises: {
            orderBy: [asc(programDayExercises.position)],
            columns: { id: true, targetSets: true },
            with: { exercise: { columns: { name: true } } },
          },
        },
      },
    },
  });

export const getProgramDay = (id: number) =>
  db.query.programDays.findFirst({
    where: eq(programDays.id, id),
    with: {
      program: { columns: { id: true, name: true } },
      exercises: {
        orderBy: [asc(programDayExercises.position)],
        with: { exercise: true },
      },
    },
  });

export async function createProgram(name: string) {
  const active = await getActiveProgram();
  const [row] = await db
    .insert(programs)
    .values({ name, isActive: !active })
    .returning({ id: programs.id });
  return row.id;
}

export async function renameProgram(id: number, name: string) {
  await db.update(programs).set({ name }).where(eq(programs.id, id));
}

/** Switching programs restarts the rotation, because the next day is derived from this program's own history. */
export async function setActiveProgram(id: number) {
  db.transaction((tx) => {
    tx.update(programs).set({ isActive: false }).where(ne(programs.id, id)).run();
    tx.update(programs).set({ isActive: true }).where(eq(programs.id, id)).run();
  });
}

export type RemoveProgramResult = 'deleted' | 'archived' | 'workout_in_progress';

export async function removeProgram(id: number): Promise<RemoveProgramResult> {
  const inProgress = await db.query.workouts.findFirst({
    where: and(eq(workouts.programId, id), isNull(workouts.finishedAt)),
    columns: { id: true },
  });
  if (inProgress) return 'workout_in_progress';

  const hasHistory = await db.query.workouts.findFirst({
    where: eq(workouts.programId, id),
    columns: { id: true },
  });
  if (hasHistory) {
    await db
      .update(programs)
      .set({ archivedAt: Date.now(), isActive: false })
      .where(eq(programs.id, id));
    return 'archived';
  }
  await db.delete(programs).where(eq(programs.id, id));
  return 'deleted';
}

/**
 * The day after the last finished workout of this program, wrapping around.
 * Falls back to the first day when there is no history or that day was removed.
 */
export async function getNextDayId(programId: number): Promise<number | null> {
  const days = await db.query.programDays.findMany({
    where: eq(programDays.programId, programId),
    orderBy: [asc(programDays.position)],
    columns: { id: true },
  });
  if (days.length === 0) return null;

  const last = await db.query.workouts.findFirst({
    where: and(
      eq(workouts.programId, programId),
      isNotNull(workouts.finishedAt),
      isNotNull(workouts.programDayId),
    ),
    orderBy: [desc(workouts.finishedAt)],
    columns: { programDayId: true },
  });
  const idx = days.findIndex((d) => d.id === last?.programDayId);
  if (idx === -1) return days[0].id;
  return days[(idx + 1) % days.length].id;
}

// --- Days ---

export async function addDay(programId: number, name: string) {
  const [{ value }] = await db
    .select({ value: max(programDays.position) })
    .from(programDays)
    .where(eq(programDays.programId, programId));
  const [row] = await db
    .insert(programDays)
    .values({ programId, name, position: (value ?? -1) + 1 })
    .returning({ id: programDays.id });
  return row.id;
}

export async function renameDay(id: number, name: string) {
  await db.update(programDays).set({ name }).where(eq(programDays.id, id));
}

/** Past workouts keep their snapshot; their day link becomes null. */
export async function deleteDay(id: number) {
  await db.delete(programDays).where(eq(programDays.id, id));
}

export async function moveDay(programId: number, id: number, direction: -1 | 1) {
  const days = await db.query.programDays.findMany({
    where: eq(programDays.programId, programId),
    orderBy: [asc(programDays.position)],
    columns: { id: true },
  });
  reorder(days, id, direction, (tx, rowId, position) =>
    tx.update(programDays).set({ position }).where(eq(programDays.id, rowId)).run(),
  );
}

// --- Day exercises ---

export function defaultTargets(type: TrackingType): Targets {
  switch (type) {
    case 'weight_reps':
    case 'weighted_reps':
    case 'reps':
      return {
        targetSets: 3,
        targetRepsMin: 8,
        targetRepsMax: 12,
        targetDurationSec: null,
        targetDistanceKm: null,
        restSec: 90,
      };
    case 'duration':
      return {
        targetSets: 3,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDurationSec: 60,
        targetDistanceKm: null,
        restSec: 60,
      };
    case 'distance_duration':
      return {
        targetSets: 1,
        targetRepsMin: null,
        targetRepsMax: null,
        targetDurationSec: null,
        targetDistanceKm: null,
        restSec: 90,
      };
  }
}

export async function addDayExercise(programDayId: number, exerciseId: number) {
  const exercise = await db.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
    columns: { trackingType: true },
  });
  if (!exercise) throw new Error(`Exercise ${exerciseId} not found`);
  const [{ value }] = await db
    .select({ value: max(programDayExercises.position) })
    .from(programDayExercises)
    .where(eq(programDayExercises.programDayId, programDayId));
  await db.insert(programDayExercises).values({
    programDayId,
    exerciseId,
    position: (value ?? -1) + 1,
    ...defaultTargets(exercise.trackingType),
  });
}

export async function updateDayExercise(id: number, targets: Targets) {
  await db.update(programDayExercises).set(targets).where(eq(programDayExercises.id, id));
}

export async function removeDayExercise(id: number) {
  await db.delete(programDayExercises).where(eq(programDayExercises.id, id));
}

export async function moveDayExercise(programDayId: number, id: number, direction: -1 | 1) {
  const rows = await db.query.programDayExercises.findMany({
    where: eq(programDayExercises.programDayId, programDayId),
    orderBy: [asc(programDayExercises.position)],
    columns: { id: true },
  });
  reorder(rows, id, direction, (tx, rowId, position) =>
    tx.update(programDayExercises).set({ position }).where(eq(programDayExercises.id, rowId)).run(),
  );
}

/** Swaps an item with its neighbour and rewrites positions as 0..n-1. */
function reorder(
  rows: { id: number }[],
  id: number,
  direction: -1 | 1,
  setPosition: (tx: Tx, id: number, position: number) => void,
) {
  const idx = rows.findIndex((r) => r.id === id);
  const target = idx + direction;
  if (idx === -1 || target < 0 || target >= rows.length) return;
  const ids = rows.map((r) => r.id);
  [ids[idx], ids[target]] = [ids[target], ids[idx]];
  db.transaction((tx) => {
    for (const [position, rowId] of ids.entries()) setPosition(tx, rowId, position);
  });
}
