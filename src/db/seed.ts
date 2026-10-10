import { and, count, eq, inArray, isNull, or } from 'drizzle-orm';

import { bundledImageUri, DEFAULT_EXERCISE_IMAGES } from '@/lib/exercise-images';
import {
  defaultYoutubeUrl,
  DEFAULT_EXERCISE_VIDEOS,
  youtubeSearchUrl,
  youtubeWatchUrl,
} from '@/lib/exercise-videos';

import { db, sqlite, type Tx } from './client';
import {
  exercises,
  programDayExercises,
  programDays,
  programs,
  type MuscleGroup,
  type NewExercise,
  type TrackingType,
} from './schema';

const SEED: [name: string, muscleGroup: MuscleGroup, trackingType: TrackingType][] = [
  // Chest
  ['Dumbbell Bench Press', 'chest', 'weight_reps'],
  ['Incline Dumbbell Bench Press', 'chest', 'weight_reps'],
  ['Decline Dumbbell Bench Press', 'chest', 'weight_reps'],
  ['Dumbbell Fly', 'chest', 'weight_reps'],
  ['Incline Dumbbell Fly', 'chest', 'weight_reps'],
  ['Push-Up', 'chest', 'reps'],
  ['Dip', 'chest', 'weighted_reps'],
  // Back
  ['One-Arm Dumbbell Row', 'back', 'weight_reps'],
  ['Bent-Over Dumbbell Row', 'back', 'weight_reps'],
  ['Dumbbell Pullover', 'back', 'weight_reps'],
  ['Dumbbell Shrug', 'back', 'weight_reps'],
  ['Pull-Up', 'back', 'weighted_reps'],
  ['Chin-Up', 'back', 'weighted_reps'],
  // Legs
  ['Dumbbell Goblet Squat', 'legs', 'weight_reps'],
  ['Dumbbell Squat', 'legs', 'weight_reps'],
  ['Dumbbell Lunge', 'legs', 'weight_reps'],
  ['Dumbbell Bulgarian Split Squat', 'legs', 'weight_reps'],
  ['Dumbbell Step-Up', 'legs', 'weight_reps'],
  ['Dumbbell Romanian Deadlift', 'legs', 'weight_reps'],
  ['Dumbbell Stiff-Leg Deadlift', 'legs', 'weight_reps'],
  ['Dumbbell Calf Raise', 'legs', 'weight_reps'],
  // Shoulders
  ['Seated Dumbbell Press', 'shoulders', 'weight_reps'],
  ['Standing Dumbbell Press', 'shoulders', 'weight_reps'],
  ['Arnold Press', 'shoulders', 'weight_reps'],
  ['Dumbbell Lateral Raise', 'shoulders', 'weight_reps'],
  ['Dumbbell Front Raise', 'shoulders', 'weight_reps'],
  ['Dumbbell Rear Delt Fly', 'shoulders', 'weight_reps'],
  ['Dumbbell Upright Row', 'shoulders', 'weight_reps'],
  // Biceps
  ['Dumbbell Curl', 'biceps', 'weight_reps'],
  ['Hammer Curl', 'biceps', 'weight_reps'],
  ['Incline Dumbbell Curl', 'biceps', 'weight_reps'],
  ['Concentration Curl', 'biceps', 'weight_reps'],
  // Triceps
  ['Seated Dumbbell Triceps Extension', 'triceps', 'weight_reps'],
  ['Lying Dumbbell Triceps Extension', 'triceps', 'weight_reps'],
  ['Dumbbell Kickback', 'triceps', 'weight_reps'],
  ['Close-Grip Dumbbell Press', 'triceps', 'weight_reps'],
  // Abs
  ['Plank', 'abs', 'duration'],
  ['Crunch', 'abs', 'reps'],
  ['Hanging Leg Raise', 'abs', 'reps'],
  ['Dumbbell Side Bend', 'abs', 'weight_reps'],
  // Cardio
  ['Running', 'cardio', 'distance_duration'],
  ['Cycling', 'cardio', 'distance_duration'],
  ['Jump Rope', 'cardio', 'duration'],
];

/** Fills the exercise library on first launch only. */
export async function seedIfEmpty() {
  const [{ value }] = await db.select({ value: count() }).from(exercises);
  if (value > 0) return;
  const rows: NewExercise[] = SEED.map(([name, muscleGroup, trackingType]) => ({
    name,
    muscleGroup,
    trackingType,
    youtubeUrl: defaultYoutubeUrl(name),
    builtIn: true,
  }));
  await db.insert(exercises).values(rows);
}

/** For exercises that aren't weight × reps, e.g. timed holds. */
type SeedTracking = { type: TrackingType; durationSec?: number };

type ProgramSeed = {
  name: string;
  restSec: number;
  days: {
    name: string;
    // [exercise name, sets, reps min, reps max, muscle group if it has to be created, tracking]
    exercises: [string, number, number | null, number | null, MuscleGroup?, SeedTracking?][];
  }[];
};

/**
 * "Dumbbell Only Workout: 6 Day Dumbbell Workout Split" by Muscle & Strength.
 * Names match the library where the exercise is the same movement.
 */
const DUMBBELL_6_DAY: ProgramSeed = {
  name: '6 Day Dumbbell Split',
  // The program asks for 45–60 s between sets.
  restSec: 60,
  days: [
    {
      name: 'Push A',
      exercises: [
        ['Dumbbell Bench Press', 5, 8, 12],
        ['Decline Dumbbell Bench Press', 3, 8, 12],
        ['Dumbbell Floor Press', 3, 8, 12, 'chest'],
        ['Seated Dumbbell Press', 4, 8, 12],
        ['Dumbbell Lateral Raise', 3, 8, 12],
        ['Seated Dumbbell Triceps Extension', 3, 8, 12],
      ],
    },
    {
      name: 'Pull A',
      exercises: [
        ['Bent-Over Dumbbell Row', 4, 8, 12],
        ['Chest Supported Dumbbell Row', 4, 8, 12, 'back'],
        ['Dumbbell Pullover', 3, 10, 15],
        ['Dumbbell Rear Delt Fly', 3, 10, 15],
        ['Dumbbell Curl', 3, 12, 15],
        ['Zottman Curl', 3, 12, 15, 'biceps'],
      ],
    },
    {
      name: 'Legs A',
      exercises: [
        ['Dumbbell Squat', 4, 8, 12],
        ['Dumbbell Stiff-Leg Deadlift', 4, 8, 12],
        ['Dumbbell Goblet Squat', 4, 8, 12],
        ['Dumbbell Hip Thrust', 4, 8, 12, 'legs'],
        ['Dumbbell Calf Raise', 4, 15, 20],
      ],
    },
    {
      name: 'Push B',
      exercises: [
        ['Incline Dumbbell Bench Press', 5, 8, 12],
        ['Dumbbell Fly', 3, 8, 12],
        ['Standing Dumbbell Press', 4, 8, 12],
        ['Arnold Press', 3, 8, 12],
        ['Dumbbell Lateral Raise', 3, 8, 12],
        ['Lying Dumbbell Triceps Extension', 3, 8, 12],
      ],
    },
    {
      name: 'Pull B',
      exercises: [
        ['One-Arm Dumbbell Row', 5, 8, 12],
        ['Reverse Grip Dumbbell Row', 4, 8, 12, 'back'],
        ['Dumbbell Pullover', 4, 8, 12],
        ['Hammer Curl', 3, 10, 15],
        ['Reverse Curl', 3, 10, 15, 'biceps'],
      ],
    },
    {
      name: 'Legs B',
      exercises: [
        ['Dumbbell Deadlift', 4, 8, 12, 'legs'],
        ['Dumbbell Split Squat', 4, 8, 12, 'legs'],
        ['Dumbbell Goblet Squat', 3, 8, 12],
        ['Dumbbell Hip Thrust', 3, 10, 15, 'legs'],
        ['Dumbbell Calf Raise', 4, 20, 20],
      ],
    },
  ],
};

/**
 * "Dumbbell Only Workout: 5 Day Dumbbell Workout Split" by Muscle & Strength,
 * from the page the user saved. Names match the library where the exercise is
 * the same movement. Unilateral sets ("8-10 each") keep the per-side target.
 */
const DUMBBELL_5_DAY: ProgramSeed = {
  name: '5 Day Dumbbell Split',
  // The program asks for rest periods "right around the 45 second mark".
  restSec: 45,
  days: [
    {
      name: 'Chest, Shoulders & Triceps',
      exercises: [
        ['Dumbbell Bench Press', 5, 8, 10],
        ['Incline Dumbbell Bench Press', 4, 8, 10],
        ['Dumbbell Floor Press', 3, 8, 12, 'chest'],
        ['Standing Dumbbell Press', 4, 8, 10],
        ['Dumbbell Lateral Raise', 3, 8, 12],
        ['Dumbbell Kickback', 3, 8, 12],
      ],
    },
    {
      name: 'Legs & Core A',
      exercises: [
        ['Dumbbell Goblet Squat', 4, 8, 10],
        ['Dumbbell Stiff-Leg Deadlift', 4, 8, 10],
        ['Dumbbell Rear Lunge', 4, 8, 10, 'legs'],
        ['Dumbbell Frog Squat', 3, 8, 12, 'legs'],
        ['Dumbbell Calf Raise', 4, 20, 20],
        ['Weighted Crunch', 3, 20, 20, 'abs', { type: 'weighted_reps' }],
        ['Side Plank', 3, null, null, 'abs', { type: 'duration', durationSec: 20 }],
      ],
    },
    {
      name: 'Back & Biceps',
      exercises: [
        ['Bent-Over Dumbbell Row', 4, 8, 12],
        ['Tripod Dumbbell Row', 4, 8, 12, 'back'],
        ['Dumbbell Pullover', 3, 8, 12],
        ['Reverse Grip Dumbbell Row', 4, 8, 12, 'back'],
        ['Dumbbell Curl', 3, 10, 15],
        ['Hammer Curl', 3, 10, 15],
      ],
    },
    {
      name: 'Legs & Core B',
      exercises: [
        ['Dumbbell Squat', 4, 8, 10],
        ['Dumbbell Deadlift', 4, 8, 10, 'legs'],
        ['Dumbbell Split Squat', 3, 8, 12, 'legs'],
        ['Dumbbell Hip Thrust', 4, 10, 15, 'legs'],
        ['Dumbbell Calf Raise', 4, 20, 20],
        ['Dumbbell Side Bend', 3, 15, 15],
        ['Plank', 3, null, null, 'abs', { type: 'duration', durationSec: 20 }],
      ],
    },
    {
      name: 'Upper Body',
      exercises: [
        ['One-Arm Dumbbell Row', 4, 8, 10],
        ['Arnold Press', 4, 8, 10],
        ['Incline Dumbbell Bench Press', 4, 8, 12],
        ['Chest Supported Dumbbell Row', 3, 8, 12, 'back'],
        ['Dumbbell Pinwheel Curl', 2, 8, 12, 'biceps'],
        ['Seated Dumbbell Triceps Extension', 3, 8, 12],
        ['Dumbbell Shrug', 3, 12, 15],
      ],
    },
  ],
};

/**
 * "Dumbbell Only Workout: 3 Day Full Body Dumbbell Workout" by Muscle & Strength,
 * from the page the user saved. Names match the library where the exercise is
 * the same movement.
 */
const DUMBBELL_3_DAY: ProgramSeed = {
  name: '3 Day Full Body Dumbbell',
  // The program asks for 60 seconds between sets.
  restSec: 60,
  days: [
    {
      name: 'Full Body A',
      exercises: [
        ['Dumbbell Squat', 3, 10, 10],
        ['Dumbbell Stiff-Leg Deadlift', 3, 10, 10],
        ['Bent-Over Dumbbell Row', 3, 10, 10],
        ['Dumbbell Bench Press', 3, 10, 10],
        ['Dumbbell Lateral Raise', 2, 8, 8],
        ['Dumbbell Curl', 2, 8, 8],
        ['Lying Dumbbell Triceps Extension', 2, 8, 8],
      ],
    },
    {
      name: 'Full Body B',
      exercises: [
        ['Dumbbell Lunge', 3, 10, 10],
        ['Dumbbell Hamstring Curl', 3, 10, 10, 'legs'],
        ['Dumbbell Deadlift', 3, 10, 10, 'legs'],
        // "Dumbbell Military Press": the standing overhead press.
        ['Standing Dumbbell Press', 3, 10, 10],
        ['Dumbbell Fly', 2, 8, 8],
        ['Hammer Curl', 2, 8, 8],
        ['Seated Dumbbell Triceps Extension', 2, 8, 8],
      ],
    },
    {
      name: 'Full Body C',
      exercises: [
        ['Dumbbell Step-Up', 3, 10, 10],
        ['Dumbbell Stiff-Leg Deadlift', 3, 10, 10],
        ['One-Arm Dumbbell Row', 3, 10, 10],
        ['Reverse Grip Dumbbell Press', 3, 10, 10, 'chest'],
        ['Dumbbell Rear Delt Fly', 2, 8, 8],
        ['Zottman Curl', 2, 8, 8, 'biceps'],
        ['Close-Grip Dumbbell Press', 2, 8, 8],
      ],
    },
  ],
};

function findOrCreateExercise(
  tx: Tx,
  name: string,
  group?: MuscleGroup,
  trackingType: TrackingType = 'weight_reps',
) {
  const existing = tx
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.name, name), isNull(exercises.archivedAt)))
    .get();
  if (existing) return existing.id;
  // The user may have deleted a library exercise; recreate it in its usual group.
  const muscleGroup = group ?? SEED.find(([n]) => n === name)?.[1] ?? 'chest';
  return tx
    .insert(exercises)
    .values({
      name,
      muscleGroup,
      trackingType,
      youtubeUrl: defaultYoutubeUrl(name),
      builtIn: true,
    })
    .returning({ id: exercises.id })
    .get().id;
}

function insertProgram(seed: ProgramSeed) {
  db.transaction((tx) => {
    const hasActive = tx
      .select({ id: programs.id })
      .from(programs)
      .where(and(eq(programs.isActive, true), isNull(programs.archivedAt)))
      .get();
    const program = tx
      .insert(programs)
      .values({ name: seed.name, isActive: !hasActive, builtIn: true })
      .returning({ id: programs.id })
      .get();
    seed.days.forEach((day, dayPos) => {
      const d = tx
        .insert(programDays)
        .values({ programId: program.id, name: day.name, position: dayPos })
        .returning({ id: programDays.id })
        .get();
      day.exercises.forEach(([name, sets, min, max, group, tracking], pos) => {
        tx.insert(programDayExercises)
          .values({
            programDayId: d.id,
            exerciseId: findOrCreateExercise(tx, name, group, tracking?.type),
            position: pos,
            targetSets: sets,
            targetRepsMin: min,
            targetRepsMax: max,
            targetDurationSec: tracking?.durationSec ?? null,
            restSec: seed.restSec,
          })
          .run();
      });
    });
  });
}

/** Bundled photos for library exercises that don't have one yet; user photos are kept. */
function addDefaultImages() {
  db.transaction((tx) => {
    for (const [name, key] of Object.entries(DEFAULT_EXERCISE_IMAGES)) {
      tx.update(exercises)
        .set({ imageUri: bundledImageUri(key) })
        .where(and(eq(exercises.name, name), isNull(exercises.imageUri)))
        .run();
    }
  });
}

/**
 * Form videos for library exercises. Replaces only the old YouTube search links
 * (or an empty field), so links the user set themselves are kept.
 */
function addDefaultVideos() {
  db.transaction((tx) => {
    for (const [name, id] of Object.entries(DEFAULT_EXERCISE_VIDEOS)) {
      tx.update(exercises)
        .set({ youtubeUrl: youtubeWatchUrl(id) })
        .where(
          and(
            eq(exercises.name, name),
            or(isNull(exercises.youtubeUrl), eq(exercises.youtubeUrl, youtubeSearchUrl(name))),
          ),
        )
        .run();
    }
  });
}

/**
 * Flags library exercises and programs seeded before `built_in` existed, matched
 * by name, so only what the user created can be swiped away from the lists.
 */
function markBuiltIn() {
  const seeds = [DUMBBELL_6_DAY, DUMBBELL_5_DAY, DUMBBELL_3_DAY];
  const exerciseNames = [
    ...SEED.map(([name]) => name),
    ...seeds.flatMap((p) => p.days.flatMap((d) => d.exercises.map(([name]) => name))),
  ];
  db.transaction((tx) => {
    tx.update(exercises).set({ builtIn: true }).where(inArray(exercises.name, exerciseNames)).run();
    tx.update(programs)
      .set({ builtIn: true })
      .where(
        inArray(
          programs.name,
          seeds.map((p) => p.name),
        ),
      )
      .run();
  });
}

/**
 * One-off content seeds tracked with SQLite's user_version, so each runs once per
 * install and a program the user deleted is not recreated.
 */
export function runContentSeeds() {
  const { user_version: version } = sqlite.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version',
  )!;
  if (version < 1) {
    insertProgram(DUMBBELL_6_DAY);
    sqlite.execSync('PRAGMA user_version = 1');
  }
  if (version < 2) {
    addDefaultImages();
    sqlite.execSync('PRAGMA user_version = 2');
  }
  if (version < 3) {
    addDefaultVideos();
    sqlite.execSync('PRAGMA user_version = 3');
  }
  if (version < 4) {
    insertProgram(DUMBBELL_5_DAY);
    sqlite.execSync('PRAGMA user_version = 4');
  }
  if (version < 5) {
    insertProgram(DUMBBELL_3_DAY);
    sqlite.execSync('PRAGMA user_version = 5');
  }
  if (version < 6) {
    markBuiltIn();
    sqlite.execSync('PRAGMA user_version = 6');
  }
}
