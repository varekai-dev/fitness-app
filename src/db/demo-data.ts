import { and, asc, eq, inArray, isNull, like, notInArray, or } from 'drizzle-orm';

import { tr } from '@/lib/i18n';
import { startOfDay } from '@/lib/water';
import { db } from './client';
import {
  activities,
  bodyWeights,
  dailyHealth,
  foodEntries,
  programDayExercises,
  programDays,
  programs,
  progressPhotos,
  settings,
  waterIntakes,
  workoutExercises,
  workouts,
  workoutSets,
  type Meal,
} from './schema';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const HISTORY_DAYS = 35;

/** Same numbers on every run, so screenshots retaken later look alike. */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Dish = [uk: string, en: string, grams: number, kcal: number, p: number, f: number, c: number];

const DISHES: Record<Meal, Dish[]> = {
  breakfast: [
    ['Вівсянка з бананом і горіхами', 'Oatmeal with banana and nuts', 300, 420, 13, 14, 62],
    ['Омлет з овочами', 'Vegetable omelette', 250, 330, 24, 22, 8],
    ['Сирники зі сметаною', 'Syrniki with sour cream', 220, 450, 28, 20, 38],
    ['Грецький йогурт з ягодами', 'Greek yogurt with berries', 250, 260, 22, 6, 28],
  ],
  lunch: [
    ['Гречка з курячим філе', 'Buckwheat with chicken breast', 350, 520, 45, 10, 62],
    ['Борщ зі сметаною', 'Borscht with sour cream', 400, 290, 12, 14, 30],
    ['Рис з лососем і броколі', 'Rice with salmon and broccoli', 380, 610, 38, 20, 66],
    ['Паста з індичкою', 'Pasta with turkey', 350, 560, 40, 12, 70],
  ],
  dinner: [
    ['Салат з тунцем', 'Tuna salad', 300, 340, 32, 16, 14],
    ['Запечена риба з картоплею', 'Baked fish with potatoes', 380, 480, 36, 14, 50],
    ['Курячі котлети з овочами', 'Chicken patties with vegetables', 350, 450, 40, 18, 28],
  ],
  snack: [
    ['Протеїновий коктейль', 'Protein shake', 350, 210, 30, 4, 14],
    ['Яблуко', 'Apple', 180, 95, 0.5, 0.3, 25],
    ['Сир кисломолочний 5%', 'Cottage cheese 5%', 200, 240, 34, 10, 6],
  ],
};

/** Hour and minute each meal is eaten at. */
const MEAL_TIMES: [Meal, number, number][] = [
  ['breakfast', 8, 10],
  ['lunch', 13, 20],
  ['snack', 16, 30],
  ['dinner', 19, 0],
];

/** Starting weight in kg by the exercise's position in its day, for believable numbers. */
const BASE_WEIGHT = [22, 16, 12, 10, 8, 6];

/**
 * Replaces the logs with five weeks of believable data for store screenshots:
 * workouts on the active program, weigh-ins trending down, meals and water.
 * Development only: it deletes every workout, weigh-in, meal and drink, the
 * AI comments on them, progress photo records and programs with no days.
 */
export async function loadDemoData(now = Date.now()) {
  if (!__DEV__) throw new Error('Demo data is for development builds only');
  const rnd = random(42);
  const today = startOfDay(now);
  const dayAt = (daysAgo: number, h: number, m: number) =>
    today - daysAgo * DAY + (h * 60 + m) * MIN;

  const program = await db.query.programs.findFirst({
    where: and(eq(programs.isActive, true), isNull(programs.archivedAt)),
  });
  const days = program
    ? await db.query.programDays.findMany({
        where: eq(programDays.programId, program.id),
        orderBy: [asc(programDays.position)],
      })
    : [];
  const dayExercises = await Promise.all(
    days.map((d) =>
      db.query.programDayExercises.findMany({
        where: eq(programDayExercises.programDayId, d.id),
        orderBy: [asc(programDayExercises.position)],
        with: { exercise: true },
      }),
    ),
  );

  db.transaction((tx) => {
    for (const table of [
      workouts,
      bodyWeights,
      foodEntries,
      waterIntakes,
      activities,
      dailyHealth,
    ]) {
      tx.delete(table).run();
    }
    // AI comments were written for the old logs; the photo files stay on disk.
    tx.delete(settings)
      .where(
        or(
          like(settings.key, 'food_review_%'),
          like(settings.key, 'meal_advice_%'),
          like(settings.key, 'macro_tips_%'),
        ),
      )
      .run();
    tx.delete(progressPhotos).run();
    const withDays = tx.select({ id: programDays.programId }).from(programDays).all();
    const empty = tx
      .select({ id: programs.id })
      .from(programs)
      .where(
        and(
          eq(programs.isActive, false),
          notInArray(
            programs.id,
            withDays.map((d) => d.id),
          ),
        ),
      )
      .all();
    // Never referenced by a workout: those were just deleted.
    if (empty.length) {
      tx.delete(programs)
        .where(
          inArray(
            programs.id,
            empty.map((p) => p.id),
          ),
        )
        .run();
    }

    const set = (key: string, value: string) =>
      tx
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run();
    set('profile_heightCm', '180');
    set('profile_birthDate', '1994-04-12');
    set('profile_sex', 'male');
    set('profile_activity', 'moderate');
    set('profile_goal', 'lose');
    set('profile_targetWeightKg', '78');
    set('kcal_goal', '2300');
    set('water_goal_ml', '2500');

    // Weigh-ins most mornings, from 85.4 kg down about half a kilo a week.
    for (let d = HISTORY_DAYS; d >= 0; d--) {
      if (d > 0 && rnd() < 0.2) continue;
      const trend = 85.4 - ((HISTORY_DAYS - d) / 7) * 0.5;
      const weightKg = Math.round((trend + (rnd() - 0.5) * 0.8) * 10) / 10;
      tx.insert(bodyWeights)
        .values({ measuredAt: dayAt(d, 7, 30), weightKg })
        .run();
    }

    // Four workouts a week, going round the program's days; weights creep up.
    if (program && days.length) {
      let next = 0;
      for (let d = HISTORY_DAYS; d >= 1; d--) {
        const weekday = new Date(today - d * DAY).getDay();
        if (![1, 2, 4, 6].includes(weekday)) continue;
        const day = days[next % days.length];
        const exercises = dayExercises[next % days.length];
        next++;
        const progress = Math.floor((HISTORY_DAYS - d) / 7);
        let at = dayAt(d, 18, 0);
        const startedAt = at;
        const workout = tx
          .insert(workouts)
          .values({
            programId: program.id,
            programDayId: day.id,
            programName: program.name,
            dayName: day.name,
            startedAt,
            finishedAt: startedAt,
          })
          .returning({ id: workouts.id })
          .get();

        exercises.forEach((e, position) => {
          const we = tx
            .insert(workoutExercises)
            .values({
              workoutId: workout.id,
              exerciseId: e.exerciseId,
              position,
              targetSets: e.targetSets,
              targetRepsMin: e.targetRepsMin,
              targetRepsMax: e.targetRepsMax,
              targetDurationSec: e.targetDurationSec,
              targetDistanceKm: e.targetDistanceKm,
              restSec: e.restSec,
            })
            .returning({ id: workoutExercises.id })
            .get();
          const type = e.exercise.trackingType;
          const base = BASE_WEIGHT[Math.min(position, BASE_WEIGHT.length - 1)];
          for (let i = 0; i < e.targetSets; i++) {
            at += (e.restSec + 40) * 1000;
            const reps = (e.targetRepsMax ?? 10) - (i > 1 ? 1 : 0) - (rnd() < 0.3 ? 1 : 0);
            tx.insert(workoutSets)
              .values({
                workoutExerciseId: we.id,
                position: i,
                weightKg:
                  type === 'weight_reps' || type === 'weighted_reps'
                    ? base + progress * 2 + (type === 'weighted_reps' ? -base + 5 : 0)
                    : null,
                reps: type.includes('reps') ? Math.max(reps, 5) : null,
                durationSec: type.includes('duration')
                  ? (e.targetDurationSec ?? 60) + progress * 5
                  : null,
                distanceKm: type.includes('distance') ? (e.targetDistanceKm ?? 2) : null,
                completedAt: at,
              })
              .run();
          }
        });
        tx.update(workouts).set({ finishedAt: at }).where(eq(workouts.id, workout.id)).run();
      }
    }

    // Three or four meals a day; today only what's been eaten by now.
    for (let d = HISTORY_DAYS; d >= 0; d--) {
      for (const [meal, h, m] of MEAL_TIMES) {
        const eatenAt = dayAt(d, h, m);
        if (eatenAt > now) continue;
        if (meal === 'snack' && rnd() < 0.4) continue;
        const options = DISHES[meal];
        const [uk, en, grams, kcal, proteinG, fatG, carbsG] =
          options[Math.floor(rnd() * options.length)];
        tx.insert(foodEntries)
          .values({ eatenAt, meal, name: tr(uk, en), grams, kcal, proteinG, fatG, carbsG })
          .run();
      }
    }

    // Water from 8:00 to about 21:00: mostly glasses of 250 ml, now and then a bottle.
    for (let d = HISTORY_DAYS; d >= 0; d--) {
      const glasses = 7 + Math.floor(rnd() * 3);
      for (let i = 0; i < glasses; i++) {
        const drankAt = dayAt(d, 8 + Math.floor((i * 13) / glasses), Math.floor(rnd() * 60));
        if (drankAt > now) continue;
        tx.insert(waterIntakes)
          .values({ drankAt, amountMl: rnd() < 0.8 ? 250 : 500 })
          .run();
      }
    }
  });
}
