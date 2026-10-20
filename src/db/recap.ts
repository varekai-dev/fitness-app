import { db } from './client';
import { getKcalGoal } from './food';
import { foodEntries, waterIntakes } from './schema';
import { getWaterGoal } from './water';
import { listFinishedWorkouts } from './workouts';

/**
 * Everything the recap needs, for any period: all finished workouts (records
 * compare against the whole history), every food and water entry, and the goals.
 */
export async function loadRecapData() {
  const [workouts, food, water, kcalGoal, waterGoal] = await Promise.all([
    listFinishedWorkouts(),
    db
      .select({
        eatenAt: foodEntries.eatenAt,
        name: foodEntries.name,
        kcal: foodEntries.kcal,
        proteinG: foodEntries.proteinG,
      })
      .from(foodEntries),
    db
      .select({ drankAt: waterIntakes.drankAt, amountMl: waterIntakes.amountMl })
      .from(waterIntakes),
    getKcalGoal(),
    getWaterGoal(),
  ]);
  return { workouts, food, water, kcalGoal, waterGoal };
}

export type RecapData = Awaited<ReturnType<typeof loadRecapData>>;
