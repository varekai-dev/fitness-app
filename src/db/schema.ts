import { relations } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const TRACKING_TYPES = [
  'weight_reps',
  'reps',
  'weighted_reps',
  'duration',
  'distance_duration',
] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'biceps',
  'triceps',
  'abs',
  'cardio',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

const now = () => Date.now();

export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  trackingType: text('tracking_type', { enum: TRACKING_TYPES }).notNull(),
  muscleGroup: text('muscle_group', { enum: MUSCLE_GROUPS }).notNull(),
  notes: text('notes'),
  imageUri: text('image_uri'),
  youtubeUrl: text('youtube_url'),
  // Shipped with the app rather than created by the user.
  builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

export const programs = sqliteTable('programs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

export const programDays = sqliteTable(
  'program_days',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    programId: integer('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [index('program_days_program_idx').on(t.programId)],
);

/** Target columns shared by a program day exercise and its snapshot in a workout. */
const targetColumns = () => ({
  targetSets: integer('target_sets').notNull(),
  targetRepsMin: integer('target_reps_min'),
  targetRepsMax: integer('target_reps_max'),
  targetDurationSec: integer('target_duration_sec'),
  targetDistanceKm: real('target_distance_km'),
  restSec: integer('rest_sec').notNull().default(90),
});

export const programDayExercises = sqliteTable(
  'program_day_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    programDayId: integer('program_day_id')
      .notNull()
      .references(() => programDays.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    ...targetColumns(),
  },
  (t) => [index('pde_day_idx').on(t.programDayId)],
);

export const workouts = sqliteTable(
  'workouts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    programId: integer('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'restrict' }),
    // Nullable: a day can be removed from the program while its history stays.
    programDayId: integer('program_day_id').references(() => programDays.id, {
      onDelete: 'set null',
    }),
    programName: text('program_name').notNull(),
    dayName: text('day_name').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    // Set while paused; paused time is excluded from the workout duration.
    pausedAt: integer('paused_at'),
    pausedMs: integer('paused_ms').notNull().default(0),
  },
  (t) => [index('workouts_program_idx').on(t.programId, t.finishedAt)],
);

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutId: integer('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    ...targetColumns(),
  },
  (t) => [index('we_workout_idx').on(t.workoutId), index('we_exercise_idx').on(t.exerciseId)],
);

export const workoutSets = sqliteTable(
  'workout_sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutExerciseId: integer('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    durationSec: integer('duration_sec'),
    distanceKm: real('distance_km'),
    completedAt: integer('completed_at'),
  },
  (t) => [index('ws_we_idx').on(t.workoutExerciseId)],
);

/** Body weight log: at most one entry per local day, see saveBodyWeight. */
export const bodyWeights = sqliteTable(
  'body_weights',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    measuredAt: integer('measured_at').notNull(),
    weightKg: real('weight_kg').notNull(),
  },
  (t) => [index('body_weights_measured_idx').on(t.measuredAt)],
);

export const programsRelations = relations(programs, ({ many }) => ({
  days: many(programDays),
}));

export const programDaysRelations = relations(programDays, ({ one, many }) => ({
  program: one(programs, {
    fields: [programDays.programId],
    references: [programs.id],
  }),
  exercises: many(programDayExercises),
}));

export const programDayExercisesRelations = relations(programDayExercises, ({ one }) => ({
  day: one(programDays, {
    fields: [programDayExercises.programDayId],
    references: [programDays.id],
  }),
  exercise: one(exercises, {
    fields: [programDayExercises.exerciseId],
    references: [exercises.id],
  }),
}));

export const workoutsRelations = relations(workouts, ({ many }) => ({
  exercises: many(workoutExercises),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
  workout: one(workouts, {
    fields: [workoutExercises.workoutId],
    references: [workouts.id],
  }),
  exercise: one(exercises, {
    fields: [workoutExercises.exerciseId],
    references: [exercises.id],
  }),
  sets: many(workoutSets),
}));

export const workoutSetsRelations = relations(workoutSets, ({ one }) => ({
  workoutExercise: one(workoutExercises, {
    fields: [workoutSets.workoutExerciseId],
    references: [workoutExercises.id],
  }),
}));

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type Program = typeof programs.$inferSelect;
export type ProgramDay = typeof programDays.$inferSelect;
export type ProgramDayExercise = typeof programDayExercises.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type WorkoutSet = typeof workoutSets.$inferSelect;
export type BodyWeight = typeof bodyWeights.$inferSelect;
export type Targets = Pick<
  ProgramDayExercise,
  | 'targetSets'
  | 'targetRepsMin'
  | 'targetRepsMax'
  | 'targetDurationSec'
  | 'targetDistanceKm'
  | 'restSec'
>;
