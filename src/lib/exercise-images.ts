import type { ImageSource } from 'expo-image';

/**
 * Exercise photos bundled with the app, from the public-domain (Unlicense)
 * free-exercise-db: https://github.com/yuhonas/free-exercise-db
 *
 * Stored in `exercises.image_uri` as `asset:<key>` so user photos (file URIs)
 * and bundled ones share one column.
 */
const BUNDLED: Record<string, number> = {
  'arnold-dumbbell-press': require('@/assets/exercises/arnold-dumbbell-press.jpg'),
  'barbell-deadlift': require('@/assets/exercises/barbell-deadlift.jpg'),
  'barbell-hip-thrust': require('@/assets/exercises/barbell-hip-thrust.jpg'),
  'bent-over-two-dumbbell-row': require('@/assets/exercises/bent-over-two-dumbbell-row.jpg'),
  bicycling: require('@/assets/exercises/bicycling.jpg'),
  'chin-up': require('@/assets/exercises/chin-up.jpg'),
  'close-grip-dumbbell-press': require('@/assets/exercises/close-grip-dumbbell-press.jpg'),
  'concentration-curls': require('@/assets/exercises/concentration-curls.jpg'),
  crunches: require('@/assets/exercises/crunches.jpg'),
  'decline-dumbbell-bench-press': require('@/assets/exercises/decline-dumbbell-bench-press.jpg'),
  'dips---chest-version': require('@/assets/exercises/dips---chest-version.jpg'),
  'dumbbell-bench-press': require('@/assets/exercises/dumbbell-bench-press.jpg'),
  'dumbbell-bicep-curl': require('@/assets/exercises/dumbbell-bicep-curl.jpg'),
  'dumbbell-floor-press': require('@/assets/exercises/dumbbell-floor-press.jpg'),
  'dumbbell-flyes': require('@/assets/exercises/dumbbell-flyes.jpg'),
  'dumbbell-incline-row': require('@/assets/exercises/dumbbell-incline-row.jpg'),
  'dumbbell-lunges': require('@/assets/exercises/dumbbell-lunges.jpg'),
  'dumbbell-shrug': require('@/assets/exercises/dumbbell-shrug.jpg'),
  'dumbbell-side-bend': require('@/assets/exercises/dumbbell-side-bend.jpg'),
  'dumbbell-squat': require('@/assets/exercises/dumbbell-squat.jpg'),
  'dumbbell-step-ups': require('@/assets/exercises/dumbbell-step-ups.jpg'),
  'front-dumbbell-raise': require('@/assets/exercises/front-dumbbell-raise.jpg'),
  'goblet-squat': require('@/assets/exercises/goblet-squat.jpg'),
  'hammer-curls': require('@/assets/exercises/hammer-curls.jpg'),
  'hanging-leg-raise': require('@/assets/exercises/hanging-leg-raise.jpg'),
  'incline-dumbbell-curl': require('@/assets/exercises/incline-dumbbell-curl.jpg'),
  'incline-dumbbell-flyes': require('@/assets/exercises/incline-dumbbell-flyes.jpg'),
  'incline-dumbbell-press': require('@/assets/exercises/incline-dumbbell-press.jpg'),
  'lying-dumbbell-tricep-extension': require('@/assets/exercises/lying-dumbbell-tricep-extension.jpg'),
  'one-arm-dumbbell-row': require('@/assets/exercises/one-arm-dumbbell-row.jpg'),
  plank: require('@/assets/exercises/plank.jpg'),
  pullups: require('@/assets/exercises/pullups.jpg'),
  pushups: require('@/assets/exercises/pushups.jpg'),
  'reverse-flyes': require('@/assets/exercises/reverse-flyes.jpg'),
  'reverse-grip-bent-over-rows': require('@/assets/exercises/reverse-grip-bent-over-rows.jpg'),
  'romanian-deadlift': require('@/assets/exercises/romanian-deadlift.jpg'),
  'rope-jumping': require('@/assets/exercises/rope-jumping.jpg'),
  'running-treadmill': require('@/assets/exercises/running-treadmill.jpg'),
  'seated-dumbbell-press': require('@/assets/exercises/seated-dumbbell-press.jpg'),
  'seated-triceps-press': require('@/assets/exercises/seated-triceps-press.jpg'),
  'side-lateral-raise': require('@/assets/exercises/side-lateral-raise.jpg'),
  'split-squat-with-dumbbells': require('@/assets/exercises/split-squat-with-dumbbells.jpg'),
  'split-squats': require('@/assets/exercises/split-squats.jpg'),
  'standing-dumbbell-calf-raise': require('@/assets/exercises/standing-dumbbell-calf-raise.jpg'),
  'standing-dumbbell-press': require('@/assets/exercises/standing-dumbbell-press.jpg'),
  'standing-dumbbell-reverse-curl': require('@/assets/exercises/standing-dumbbell-reverse-curl.jpg'),
  'standing-dumbbell-upright-row': require('@/assets/exercises/standing-dumbbell-upright-row.jpg'),
  'stiff-legged-dumbbell-deadlift': require('@/assets/exercises/stiff-legged-dumbbell-deadlift.jpg'),
  'straight-arm-dumbbell-pullover': require('@/assets/exercises/straight-arm-dumbbell-pullover.jpg'),
  'tricep-dumbbell-kickback': require('@/assets/exercises/tricep-dumbbell-kickback.jpg'),
  'zottman-curl': require('@/assets/exercises/zottman-curl.jpg'),
};

/** Library exercise name -> bundled image key. */
export const DEFAULT_EXERCISE_IMAGES: Record<string, string> = {
  'Dumbbell Bench Press': 'dumbbell-bench-press',
  'Incline Dumbbell Bench Press': 'incline-dumbbell-press',
  'Decline Dumbbell Bench Press': 'decline-dumbbell-bench-press',
  'Dumbbell Fly': 'dumbbell-flyes',
  'Incline Dumbbell Fly': 'incline-dumbbell-flyes',
  'Push-Up': 'pushups',
  Dip: 'dips---chest-version',
  'Dumbbell Floor Press': 'dumbbell-floor-press',
  'One-Arm Dumbbell Row': 'one-arm-dumbbell-row',
  'Bent-Over Dumbbell Row': 'bent-over-two-dumbbell-row',
  'Dumbbell Pullover': 'straight-arm-dumbbell-pullover',
  'Dumbbell Shrug': 'dumbbell-shrug',
  'Pull-Up': 'pullups',
  'Chin-Up': 'chin-up',
  'Chest Supported Dumbbell Row': 'dumbbell-incline-row',
  'Reverse Grip Dumbbell Row': 'reverse-grip-bent-over-rows',
  'Dumbbell Goblet Squat': 'goblet-squat',
  'Dumbbell Squat': 'dumbbell-squat',
  'Dumbbell Lunge': 'dumbbell-lunges',
  'Dumbbell Bulgarian Split Squat': 'split-squat-with-dumbbells',
  'Dumbbell Split Squat': 'split-squats',
  'Dumbbell Step-Up': 'dumbbell-step-ups',
  'Dumbbell Romanian Deadlift': 'romanian-deadlift',
  'Dumbbell Stiff-Leg Deadlift': 'stiff-legged-dumbbell-deadlift',
  'Dumbbell Deadlift': 'barbell-deadlift',
  'Dumbbell Calf Raise': 'standing-dumbbell-calf-raise',
  'Dumbbell Hip Thrust': 'barbell-hip-thrust',
  'Seated Dumbbell Press': 'seated-dumbbell-press',
  'Standing Dumbbell Press': 'standing-dumbbell-press',
  'Arnold Press': 'arnold-dumbbell-press',
  'Dumbbell Lateral Raise': 'side-lateral-raise',
  'Dumbbell Front Raise': 'front-dumbbell-raise',
  'Dumbbell Rear Delt Fly': 'reverse-flyes',
  'Dumbbell Upright Row': 'standing-dumbbell-upright-row',
  'Dumbbell Curl': 'dumbbell-bicep-curl',
  'Hammer Curl': 'hammer-curls',
  'Incline Dumbbell Curl': 'incline-dumbbell-curl',
  'Concentration Curl': 'concentration-curls',
  'Zottman Curl': 'zottman-curl',
  'Reverse Curl': 'standing-dumbbell-reverse-curl',
  'Seated Dumbbell Triceps Extension': 'seated-triceps-press',
  'Lying Dumbbell Triceps Extension': 'lying-dumbbell-tricep-extension',
  'Dumbbell Kickback': 'tricep-dumbbell-kickback',
  'Close-Grip Dumbbell Press': 'close-grip-dumbbell-press',
  Plank: 'plank',
  Crunch: 'crunches',
  'Hanging Leg Raise': 'hanging-leg-raise',
  'Dumbbell Side Bend': 'dumbbell-side-bend',
  Running: 'running-treadmill',
  Cycling: 'bicycling',
  'Jump Rope': 'rope-jumping',
};

const ASSET_PREFIX = 'asset:';

export const bundledImageUri = (key: string) => `${ASSET_PREFIX}${key}`;

export const isBundledImage = (uri: string | null | undefined) =>
  !!uri && uri.startsWith(ASSET_PREFIX);

/** Resolves a stored image URI to something `expo-image` can render. */
export function exerciseImageSource(uri: string | null | undefined): ImageSource | number | null {
  if (!uri) return null;
  if (isBundledImage(uri)) return BUNDLED[uri.slice(ASSET_PREFIX.length)] ?? null;
  return { uri };
}
