import { t } from '@lingui/core/macro';
import type { BodyWeight, TrackingType, WorkoutSet } from '@/db/schema';

/**
 * Rough energy estimates: kcal = MET × body weight (kg) × hours.
 * MET values follow the Compendium of Physical Activities; they are averages,
 * so treat the result as a ballpark figure, not a measurement.
 */

// Between "moderate" (3.5) and "vigorous" (6.0) resistance training, rests included.
const STRENGTH_MET = 5;
// Calisthenics, moderate effort: bodyweight reps and holds like planks.
const BODYWEIGHT_MET = 3.8;
// Time under tension per rep when a set only records reps.
const SEC_PER_REP = 4;

/** ACSM walking (below ~8 km/h) and running equations, from average speed. */
function cardioMet(distanceKm: number, durationSec: number) {
  if (distanceKm <= 0 || durationSec <= 0) return 0;
  const metersPerMin = (distanceKm * 1000) / (durationSec / 60);
  const vo2 = metersPerMin < 134 ? 0.1 * metersPerMin + 3.5 : 0.2 * metersPerMin + 3.5;
  return vo2 / 3.5;
}

type CalorieSet = Pick<
  WorkoutSet,
  'weightKg' | 'reps' | 'durationSec' | 'distanceKm' | 'completedAt'
>;

/** Completed sets only. Rest after every set but the last counts towards strength work. */
export function exerciseKcal(
  type: TrackingType,
  sets: CalorieSet[],
  restSec: number,
  bodyKg: number,
) {
  const done = sets.filter((s) => s.completedAt !== null);
  let kcal = 0;
  done.forEach((s, i) => {
    if (type === 'distance_duration') {
      const sec = s.durationSec ?? 0;
      kcal += (cardioMet(s.distanceKm ?? 0, sec) * bodyKg * sec) / 3600;
      return;
    }
    const work = s.durationSec ?? (s.reps ?? 0) * SEC_PER_REP;
    const sec = work + (i < done.length - 1 ? restSec : 0);
    const met = type === 'weight_reps' || type === 'weighted_reps' ? STRENGTH_MET : BODYWEIGHT_MET;
    kcal += (met * bodyKg * sec) / 3600;
  });
  return kcal;
}

type CalorieExercise = {
  restSec: number;
  exercise: { trackingType: TrackingType };
  sets: CalorieSet[];
};

export const workoutKcal = (exercises: CalorieExercise[], bodyKg: number) =>
  exercises.reduce(
    (sum, e) => sum + exerciseKcal(e.exercise.trackingType, e.sets, e.restSec, bodyKg),
    0,
  );

/**
 * Body weight to use for a workout on `at`: the latest entry up to the end of that
 * day, else the earliest one. Null when nothing has been logged yet.
 */
export function bodyWeightAt(weights: BodyWeight[], at: number) {
  const end = new Date(at);
  end.setHours(23, 59, 59, 999);
  let pick: BodyWeight | undefined;
  for (const w of weights) if (w.measuredAt <= end.getTime()) pick = w;
  return (pick ?? weights[0])?.weightKg ?? null;
}

/** A finished workout's estimate with the body weight of that day; null without one. */
export function estimateKcal(
  workout: { startedAt: number; exercises: CalorieExercise[] },
  weights: BodyWeight[],
) {
  const kg = bodyWeightAt(weights, workout.startedAt);
  return kg === null ? null : workoutKcal(workout.exercises, kg);
}

export const formatKcal = (kcal: number) => `~${Math.round(kcal)} ${t`ккал`}`;
