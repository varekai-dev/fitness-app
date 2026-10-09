import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from './client';
import {
  exercises,
  programDayExercises,
  programDays,
  programs,
  workoutExercises,
  type NewExercise,
} from './schema';

export type ExerciseInput = Pick<
  NewExercise,
  'name' | 'trackingType' | 'muscleGroup' | 'notes' | 'imageUri' | 'youtubeUrl'
>;

export const listExercises = () =>
  db.query.exercises.findMany({
    where: isNull(exercises.archivedAt),
    orderBy: [asc(exercises.muscleGroup), asc(exercises.name)],
  });

export const getExercise = (id: number) =>
  db.query.exercises.findFirst({ where: eq(exercises.id, id) });

export async function createExercise(input: ExerciseInput) {
  const [row] = await db.insert(exercises).values(input).returning({ id: exercises.id });
  return row.id;
}

export async function updateExercise(id: number, input: ExerciseInput) {
  await db.update(exercises).set(input).where(eq(exercises.id, id));
}

/** Names of active programs that still use this exercise. */
export async function programsUsingExercise(id: number) {
  const rows = await db
    .selectDistinct({ name: programs.name })
    .from(programDayExercises)
    .innerJoin(programDays, eq(programDays.id, programDayExercises.programDayId))
    .innerJoin(programs, eq(programs.id, programDays.programId))
    .where(and(eq(programDayExercises.exerciseId, id), isNull(programs.archivedAt)));
  return rows.map((r) => r.name);
}

export type RemoveResult = 'deleted' | 'archived' | { blockedBy: string[] };

/**
 * Exercises with history are archived so charts and past workouts stay intact.
 * Exercises still in an active program must be removed from it first.
 */
export async function removeExercise(id: number): Promise<RemoveResult> {
  const blockedBy = await programsUsingExercise(id);
  if (blockedBy.length > 0) return { blockedBy };

  const used =
    (await db.query.workoutExercises.findFirst({
      where: eq(workoutExercises.exerciseId, id),
      columns: { id: true },
    })) ??
    // Archived programs may still reference it through the restrict FK.
    (await db.query.programDayExercises.findFirst({
      where: eq(programDayExercises.exerciseId, id),
      columns: { id: true },
    }));

  if (used) {
    await db.update(exercises).set({ archivedAt: Date.now() }).where(eq(exercises.id, id));
    return 'archived';
  }
  await db.delete(exercises).where(eq(exercises.id, id));
  return 'deleted';
}

/** Tracking type is locked once logged, otherwise old sets would be read with the wrong fields. */
export async function exerciseHasHistory(id: number) {
  const row = await db.query.workoutExercises.findFirst({
    where: eq(workoutExercises.exerciseId, id),
    columns: { id: true },
  });
  return !!row;
}
