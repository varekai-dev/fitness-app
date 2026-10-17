import { relations } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Meals the food log is grouped by, in order through the day. */
export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

/** How good a dish is for you, as AI rates it. */
export const HEALTH_RATINGS = ['healthy', 'moderate', 'unhealthy'] as const;
export type HealthRating = (typeof HEALTH_RATINGS)[number];

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

/** Angles a progress photo is taken from; photos are compared only within one pose. */
export const PHOTO_POSES = ['front', 'side', 'back'] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

/** Body progress photos, stored as files in the app's own storage. */
export const progressPhotos = sqliteTable(
  'progress_photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    takenAt: integer('taken_at').notNull(),
    pose: text('pose', { enum: PHOTO_POSES }).notNull(),
    // Only the file name: the app's storage path can change between installs on iOS.
    fileName: text('file_name').notNull(),
  },
  (t) => [index('progress_photos_taken_idx').on(t.takenAt)],
);

export const ACTIVITY_SOURCES = ['apple_health', 'health_connect'] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const ACTIVITY_KINDS = [
  'walking',
  'running',
  'cycling',
  'hiking',
  'swimming',
  'strength',
  'hiit',
  'yoga',
  'other',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * Walks, runs and other sessions imported from Apple Health or Health Connect.
 * Shown in the workout history next to workouts recorded in the app.
 */
export const activities = sqliteTable(
  'activities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source', { enum: ACTIVITY_SOURCES }).notNull(),
    // The record's id in the source app, so syncing again updates instead of duplicating.
    externalId: text('external_id').notNull().unique(),
    kind: text('kind', { enum: ACTIVITY_KINDS }).notNull(),
    title: text('title'),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at').notNull(),
    distanceKm: real('distance_km'),
    kcal: real('kcal'),
    // Removed from the history by the user; kept so the next sync doesn't bring it back.
    hiddenAt: integer('hidden_at'),
  },
  (t) => [index('activities_started_idx').on(t.startedAt)],
);

/** Water log: one row per glass, summed per local day. */
export const waterIntakes = sqliteTable(
  'water_intakes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    drankAt: integer('drank_at').notNull(),
    amountMl: integer('amount_ml').notNull(),
  },
  (t) => [index('water_intakes_drank_idx').on(t.drankAt)],
);

/**
 * Nutrition looked up by Groq, keyed by the normalized dish text, so typing the
 * same dish again reuses the stored values instead of calling the API.
 */
export const foods = sqliteTable('foods', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  query: text('query').notNull().unique(),
  name: text('name').notNull(),
  portion: text('portion'),
  // Weight of that portion (millilitres for drinks); nutrition scales linearly to the amount logged.
  portionG: real('portion_g'),
  isDrink: integer('is_drink', { mode: 'boolean' }).notNull().default(false),
  kcal: real('kcal').notNull(),
  proteinG: real('protein_g').notNull(),
  fatG: real('fat_g').notNull(),
  carbsG: real('carbs_g').notNull(),
  fiberG: real('fiber_g'),
  sugarG: real('sugar_g'),
  // Null for dishes cached before ratings existed: rated when next picked.
  health: text('health', { enum: HEALTH_RATINGS }),
  healthNote: text('health_note'),
  lastUsedAt: integer('last_used_at').notNull().$defaultFn(now),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

/** Meal log: values are copied from `foods` so editing the cache never rewrites history. */
export const foodEntries = sqliteTable(
  'food_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    eatenAt: integer('eaten_at').notNull(),
    // Null for entries logged before meals existed: those go by time of day.
    meal: text('meal', { enum: MEALS }),
    foodId: integer('food_id').references(() => foods.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    portion: text('portion'),
    grams: real('grams'),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    fatG: real('fat_g').notNull(),
    carbsG: real('carbs_g').notNull(),
    fiberG: real('fiber_g'),
    sugarG: real('sugar_g'),
  },
  (t) => [index('food_entries_eaten_idx').on(t.eatenAt)],
);

/** Small key/value store for user preferences such as the daily water goal. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

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
export type Activity = typeof activities.$inferSelect;
export type WaterIntake = typeof waterIntakes.$inferSelect;
export type Food = typeof foods.$inferSelect;
export type FoodEntry = typeof foodEntries.$inferSelect;
export type Targets = Pick<
  ProgramDayExercise,
  | 'targetSets'
  | 'targetRepsMin'
  | 'targetRepsMax'
  | 'targetDurationSec'
  | 'targetDistanceKm'
  | 'restSec'
>;
