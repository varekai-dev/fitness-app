import { count } from 'drizzle-orm';

import { db } from './client';
import { exercises, type MuscleGroup, type NewExercise, type TrackingType } from './schema';

export const youtubeSearchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' exercise form')}`;

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
    youtubeUrl: youtubeSearchUrl(name),
  }));
  await db.insert(exercises).values(rows);
}
