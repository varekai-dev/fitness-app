/**
 * Form videos for library exercises, picked from YouTube (short how-to tutorials
 * from established fitness channels).
 */

/** Library exercise name -> YouTube video id. */
export const DEFAULT_EXERCISE_VIDEOS: Record<string, string> = {
  'Dumbbell Bench Press': '5Y3VZsLb1Ys',
  'Incline Dumbbell Bench Press': 'IP4oeKh1Sd4',
  'Decline Dumbbell Bench Press': 'Pf1nDoqx_1A',
  'Dumbbell Fly': 'eozdVDA78K0',
  'Incline Dumbbell Fly': '8nrLh4GpS7w',
  'Push-Up': 'IODxDxX7oi4',
  Dip: 'yN6Q1UI_xkE',
  'Dumbbell Floor Press': 'uUGDRwge4F8',
  'One-Arm Dumbbell Row': 'dFzUjzfih7k',
  'Bent-Over Dumbbell Row': '6gvmcqr226U',
  'Dumbbell Pullover': 'tpLnfSQJ0gg',
  'Dumbbell Shrug': 'cJRVVxmytaM',
  'Pull-Up': 'eGo4IYlbE5g',
  'Chin-Up': 'e1YSApl-QcM',
  'Chest Supported Dumbbell Row': 'vmX58YYK3-8',
  'Reverse Grip Dumbbell Row': 'Prdsequ4UnU',
  'Dumbbell Goblet Squat': 'CkFzgR55gho',
  'Dumbbell Squat': 'v_c67Omje48',
  'Dumbbell Lunge': '3TM-vVWuLYE',
  'Dumbbell Bulgarian Split Squat': 'hiLF_pF3EJM',
  'Dumbbell Split Squat': 'm8mQ_92_Ylg',
  'Dumbbell Step-Up': '7AtIjR-QqVA',
  'Dumbbell Romanian Deadlift': 'hQgFixeXdZo',
  'Dumbbell Stiff-Leg Deadlift': 'cYKYGwcg0U8',
  'Dumbbell Deadlift': 'lJ3QwaXNJfw',
  'Dumbbell Calf Raise': 'SRUtMJ0tE2A',
  'Dumbbell Hip Thrust': '29OfN4ztW_g',
  'Seated Dumbbell Press': 'rO_iEImwHyo',
  'Standing Dumbbell Press': 'OOe_HrNnQWw',
  'Arnold Press': '6Z15_WdXmVw',
  'Dumbbell Lateral Raise': 'PzsMitRdI_8',
  'Dumbbell Front Raise': '-t7fuZ0KhDA',
  'Dumbbell Rear Delt Fly': 'buuYPLVXsJg',
  'Dumbbell Upright Row': 'IhZLB48kluc',
  'Dumbbell Curl': 'XE_pHwbst04',
  'Hammer Curl': 'BRVDS6HVR9Q',
  'Incline Dumbbell Curl': 'soxrZlIl35U',
  'Concentration Curl': 'Jvj2wV0vOYU',
  'Zottman Curl': 'ZrpRBgswtHs',
  'Reverse Curl': 'nRgxYX2Ve9w',
  'Seated Dumbbell Triceps Extension': 'YbX7Wd8jQ-Q',
  'Lying Dumbbell Triceps Extension': 'ir5PsbniVSc',
  'Dumbbell Kickback': '6SS6K3lAwZ8',
  'Close-Grip Dumbbell Press': 'eebXpmPGy2Y',
  Plank: 'pSHjTRCQxIw',
  Crunch: 'MKmrqcoCZ-M',
  'Hanging Leg Raise': 'Pr1ieGZ5atk',
  'Dumbbell Side Bend': '_bVcLMlYZM8',
  Running: 'brFHyOtTwH4',
  Cycling: 'hPcR6MQ5dJo',
  'Jump Rope': 'u3zgHI8QnqE',
};

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export const youtubeSearchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' exercise form')}`;

/** Bundled form video for a library exercise, or a YouTube search for anything else. */
export function defaultYoutubeUrl(name: string) {
  const id = DEFAULT_EXERCISE_VIDEOS[name];
  return id ? youtubeWatchUrl(id) : youtubeSearchUrl(name);
}
