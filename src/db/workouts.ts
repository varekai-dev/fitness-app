import { t } from '@lingui/core/macro';
import { and, asc, desc, eq, isNotNull, isNull, lt, max } from 'drizzle-orm';

import { db } from './client';
import { getProgramDay } from './programs';
import { workoutExercises, workouts, workoutSets, type Targets } from './schema';
import { notStarted, type SetValues } from '@/lib/metrics';

export const getActiveWorkout = () =>
  db.query.workouts.findFirst({
    where: isNull(workouts.finishedAt),
    columns: {
      id: true,
      programDayId: true,
      dayName: true,
      programName: true,
      startedAt: true,
      pausedAt: true,
      pausedMs: true,
    },
  });

export const getWorkout = (id: number) =>
  db.query.workouts.findFirst({
    where: eq(workouts.id, id),
    with: {
      exercises: {
        orderBy: [asc(workoutExercises.position)],
        with: {
          exercise: true,
          sets: { orderBy: [asc(workoutSets.position)] },
        },
      },
    },
  });

export type WorkoutDetail = NonNullable<Awaited<ReturnType<typeof getWorkout>>>;

export const listFinishedWorkouts = () =>
  db.query.workouts.findMany({
    where: isNotNull(workouts.finishedAt),
    orderBy: [desc(workouts.startedAt)],
    with: {
      exercises: {
        orderBy: [asc(workoutExercises.position)],
        columns: { id: true, exerciseId: true, restSec: true },
        with: {
          exercise: { columns: { name: true, trackingType: true } },
          // Values feed the calorie estimate.
          sets: {
            columns: {
              id: true,
              weightKg: true,
              reps: true,
              durationSec: true,
              distanceKm: true,
              completedAt: true,
            },
          },
        },
      },
    },
  });

/**
 * Completed sets of the most recent finished workout that included this exercise
 * and started before `beforeMs`.
 */
export async function getLastSets(exerciseId: number, beforeMs = Number.MAX_SAFE_INTEGER) {
  const [last] = await db
    .select({ id: workoutExercises.id, finishedAt: workouts.finishedAt })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        isNotNull(workouts.finishedAt),
        isNotNull(workoutSets.completedAt),
        lt(workouts.startedAt, beforeMs),
      ),
    )
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  if (!last) return null;
  const sets = await db.query.workoutSets.findMany({
    where: and(eq(workoutSets.workoutExerciseId, last.id), isNotNull(workoutSets.completedAt)),
    orderBy: [asc(workoutSets.position)],
  });
  return { date: last.finishedAt!, sets };
}

/** Finished workouts containing this exercise, oldest first, with completed sets only. */
export async function getExerciseHistory(exerciseId: number) {
  const rows = await db.query.workoutExercises.findMany({
    where: eq(workoutExercises.exerciseId, exerciseId),
    with: {
      workout: {
        columns: { id: true, startedAt: true, finishedAt: true, dayName: true },
      },
      sets: { orderBy: [asc(workoutSets.position)] },
    },
  });
  return rows
    .filter((r) => r.workout.finishedAt !== null)
    .map((r) => ({
      workoutId: r.workout.id,
      date: r.workout.startedAt,
      dayName: r.workout.dayName,
      sets: r.sets.filter((s) => s.completedAt !== null),
    }))
    .filter((r) => r.sets.length > 0)
    .sort((a, b) => a.date - b.date);
}

function prefillSet(targets: Targets, prev: SetValues | undefined): SetValues {
  return {
    weightKg: prev?.weightKg ?? null,
    reps: prev?.reps ?? targets.targetRepsMin ?? null,
    durationSec: prev?.durationSec ?? targets.targetDurationSec ?? null,
    distanceKm: prev?.distanceKm ?? targets.targetDistanceKm ?? null,
  };
}

/**
 * Starts a workout from a program day. Targets are copied so later program edits
 * never rewrite history, and sets are prefilled from the previous session.
 */
export async function startWorkout(programDayId: number) {
  const active = await getActiveWorkout();
  if (active)
    throw new Error(t`Вже є незавершене тренування`);

  const day = await getProgramDay(programDayId);
  if (!day) throw new Error(`Program day ${programDayId} not found`);
  const previous = await Promise.all(day.exercises.map((e) => getLastSets(e.exerciseId)));

  // Opens paused: the clock only starts once play is pressed in the player.
  const now = Date.now();
  return db.transaction((tx) => {
    const workout = tx
      .insert(workouts)
      .values({
        programId: day.program.id,
        programDayId: day.id,
        programName: day.program.name,
        dayName: day.name,
        startedAt: now,
        pausedAt: now,
      })
      .returning({ id: workouts.id })
      .get();

    day.exercises.forEach((e, position) => {
      const targets: Targets = {
        targetSets: e.targetSets,
        targetRepsMin: e.targetRepsMin,
        targetRepsMax: e.targetRepsMax,
        targetDurationSec: e.targetDurationSec,
        targetDistanceKm: e.targetDistanceKm,
        restSec: e.restSec,
      };
      const we = tx
        .insert(workoutExercises)
        .values({
          workoutId: workout.id,
          exerciseId: e.exerciseId,
          position,
          ...targets,
        })
        .returning({ id: workoutExercises.id })
        .get();

      const prevSets = previous[position]?.sets ?? [];
      const sets = Array.from({ length: e.targetSets }, (_, i) => ({
        workoutExerciseId: we.id,
        position: i,
        ...prefillSet(targets, prevSets[i] ?? prevSets.at(-1)),
      }));
      if (sets.length > 0) tx.insert(workoutSets).values(sets).run();
    });

    return workout.id;
  });
}

export async function updateSet(id: number, values: Partial<SetValues>) {
  await db.update(workoutSets).set(values).where(eq(workoutSets.id, id));
}

export async function setCompleted(id: number, completed: boolean) {
  await db
    .update(workoutSets)
    .set({ completedAt: completed ? Date.now() : null })
    .where(eq(workoutSets.id, id));
}

/** Adds a set copying the last one. Sets added to a finished workout count as done. */
export async function addSet(workoutExerciseId: number, finished: boolean) {
  const last = await db.query.workoutSets.findFirst({
    where: eq(workoutSets.workoutExerciseId, workoutExerciseId),
    orderBy: [desc(workoutSets.position)],
  });
  const [{ value }] = await db
    .select({ value: max(workoutSets.position) })
    .from(workoutSets)
    .where(eq(workoutSets.workoutExerciseId, workoutExerciseId));
  await db.insert(workoutSets).values({
    workoutExerciseId,
    position: (value ?? -1) + 1,
    weightKg: last?.weightKg ?? null,
    reps: last?.reps ?? null,
    durationSec: last?.durationSec ?? null,
    distanceKm: last?.distanceKm ?? null,
    completedAt: finished ? Date.now() : null,
  });
}

export async function deleteSet(id: number) {
  await db.delete(workoutSets).where(eq(workoutSets.id, id));
}

/** Skips the rest of an exercise: its sets not yet done are dropped, done ones stay. */
export async function dropPendingSets(workoutExerciseId: number) {
  await db
    .delete(workoutSets)
    .where(
      and(eq(workoutSets.workoutExerciseId, workoutExerciseId), isNull(workoutSets.completedAt)),
    );
}

/** Shorter workouts are discarded on finish instead of landing in history. */
export const MIN_WORKOUT_MS = 30_000;

/** Sets that were never ticked off are dropped; an exercise may end up with zero sets. */
export function finishWorkout(id: number) {
  db.transaction((tx) => {
    const weIds = tx
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, id))
      .all()
      .map((r) => r.id);
    for (const weId of weIds) {
      tx.delete(workoutSets)
        .where(and(eq(workoutSets.workoutExerciseId, weId), isNull(workoutSets.completedAt)))
        .run();
    }
    const now = Date.now();
    const w = tx
      .select({
        startedAt: workouts.startedAt,
        pausedAt: workouts.pausedAt,
        pausedMs: workouts.pausedMs,
      })
      .from(workouts)
      .where(eq(workouts.id, id))
      .get();
    if (!w) return;
    // Finishing while paused closes the pause first.
    const pausedMs = w.pausedMs + (w.pausedAt ? now - w.pausedAt : 0);
    if (now - w.startedAt - pausedMs < MIN_WORKOUT_MS) {
      tx.delete(workouts).where(eq(workouts.id, id)).run();
      return;
    }
    tx.update(workouts)
      .set({ finishedAt: now, pausedAt: null, pausedMs })
      .where(eq(workouts.id, id))
      .run();
  });
}

export async function pauseWorkout(id: number) {
  await db
    .update(workouts)
    .set({ pausedAt: Date.now() })
    .where(and(eq(workouts.id, id), isNull(workouts.pausedAt), isNull(workouts.finishedAt)));
}

export function resumeWorkout(id: number) {
  db.transaction((tx) => {
    const w = tx
      .select({
        startedAt: workouts.startedAt,
        pausedAt: workouts.pausedAt,
        pausedMs: workouts.pausedMs,
      })
      .from(workouts)
      .where(eq(workouts.id, id))
      .get();
    if (!w?.pausedAt) return;
    const now = Date.now();
    // The first play is the real start: a workout opened yesterday and begun today is today's.
    if (notStarted(w)) {
      tx.update(workouts).set({ startedAt: now, pausedAt: null }).where(eq(workouts.id, id)).run();
      return;
    }
    tx.update(workouts)
      .set({ pausedAt: null, pausedMs: w.pausedMs + (now - w.pausedAt) })
      .where(eq(workouts.id, id))
      .run();
  });
}

/** Whether any set of the workout has been marked done. */
export async function hasCompletedSets(workoutId: number) {
  const row = await db
    .select({ id: workoutSets.id })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workoutExercises.workoutId, workoutId), isNotNull(workoutSets.completedAt)))
    .limit(1);
  return row.length > 0;
}

export async function deleteWorkout(id: number) {
  await db.delete(workouts).where(eq(workouts.id, id));
}
