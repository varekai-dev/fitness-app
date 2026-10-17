import { tr } from '@/lib/i18n';

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];
export const SEX_LABELS: Record<Sex, string> = {
  male: tr('Чоловік', 'Male'),
  female: tr('Жінка', 'Female'),
};

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'high', 'extreme'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/**
 * Standard TDEE multipliers applied to the resting metabolic rate, and the
 * extra water a day of that activity adds on top of the weight-based base.
 */
export const ACTIVITY: Record<
  ActivityLevel,
  { label: string; hint: string; factor: number; waterMl: number }
> = {
  sedentary: {
    label: tr('Мінімальна', 'Minimal'),
    hint: tr('Сидяча робота, без тренувань', 'Desk job, no workouts'),
    factor: 1.2,
    waterMl: 0,
  },
  light: {
    label: tr('Легка', 'Light'),
    hint: tr('1–3 тренування на тиждень', '1–3 workouts a week'),
    factor: 1.375,
    waterMl: 250,
  },
  moderate: {
    label: tr('Помірна', 'Moderate'),
    hint: tr('3–5 тренувань на тиждень', '3–5 workouts a week'),
    factor: 1.55,
    waterMl: 500,
  },
  high: {
    label: tr('Висока', 'High'),
    hint: tr('6–7 тренувань на тиждень', '6–7 workouts a week'),
    factor: 1.725,
    waterMl: 750,
  },
  extreme: {
    label: tr('Дуже висока', 'Very high'),
    hint: tr('Фізична робота або 2 тренування на день', 'Physical job or 2 workouts a day'),
    factor: 1.9,
    waterMl: 1000,
  },
};

export const WEIGHT_GOALS = ['lose', 'maintain', 'gain'] as const;
export type WeightGoal = (typeof WEIGHT_GOALS)[number];

/** Moderate deficit and surplus, as fractions of maintenance. */
export const WEIGHT_GOAL: Record<WeightGoal, { label: string; factor: number }> = {
  lose: { label: tr('Схуднення', 'Lose weight'), factor: 0.8 },
  maintain: { label: tr('Підтримка', 'Maintain'), factor: 1 },
  gain: { label: tr('Набір маси', 'Gain weight'), factor: 1.1 },
};

export type Profile = {
  heightCm: number | null;
  /** ISO date, "1990-05-31". */
  birthDate: string | null;
  sex: Sex | null;
  activity: ActivityLevel;
  goal: WeightGoal;
};

export const MIN_AGE = 10;
export const MAX_AGE = 110;

/** Full years on `now` for an ISO birth date. */
export function ageOn(birthDate: string, now = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

/** "31.05.1990" → "1990-05-31", or null when it is not a real date in range. */
export function parseBirthDate(input: string, now = new Date()): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const [day, month, year] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const age = ageOn(iso, now);
  return age >= MIN_AGE && age <= MAX_AGE ? iso : null;
}

export const formatBirthDate = (iso: string) => iso.split('-').reverse().join('.');

/** Inserts the dots while typing: "3105199" → "31.05.199". */
export function maskBirthDate(input: string) {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.');
}

export type CalorieRecommendation = {
  age: number;
  /** Resting metabolic rate, Mifflin–St Jeor. */
  bmr: number;
  /** Maintenance: BMR × activity factor. */
  tdee: number;
  /** Maintenance adjusted for the weight goal, rounded to 10 kcal. */
  kcal: number;
};

/** Null while the profile lacks something the formula needs. */
export function recommendCalories(
  profile: Profile,
  weightKg: number | null | undefined,
  now = new Date(),
): CalorieRecommendation | null {
  const { heightCm, birthDate, sex } = profile;
  if (!weightKg || !heightCm || !birthDate || !sex) return null;
  const age = ageOn(birthDate, now);
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * ACTIVITY[profile.activity].factor;
  const kcal = Math.round((tdee * WEIGHT_GOAL[profile.goal].factor) / 10) * 10;
  return { age, bmr, tdee, kcal };
}

/** Energy in a kilogram of body fat. */
const KCAL_PER_KG = 7700;

/**
 * Expected weight change in kg a week when eating `kcal` a day against the
 * maintenance `tdee`: negative for a deficit, positive for a surplus.
 */
export const weeklyWeightChange = (tdee: number, kcal: number) =>
  ((kcal - tdee) * 7) / KCAL_PER_KG;

/** Losing more than 1% of body weight a week costs muscle as well as fat. */
export const FAST_WEEKLY_LOSS = 0.01;

const WATER_ML_PER_KG = 30;

/**
 * Daily water: 30 ml per kg of body weight plus the activity extra, rounded to
 * 50 ml. Only the weight is required; null until it is logged.
 */
export function recommendWater(
  profile: Pick<Profile, 'activity'>,
  weightKg: number | null | undefined,
) {
  if (!weightKg) return null;
  const ml = weightKg * WATER_ML_PER_KG + ACTIVITY[profile.activity].waterMl;
  return Math.round(ml / 50) * 50;
}

/** Which inputs are still missing, in the order the profile screen shows them. */
export function missingForRecommendation(profile: Profile, weightKg: number | null | undefined) {
  const missing: string[] = [];
  if (!weightKg) missing.push(tr('вагу', 'weight'));
  if (!profile.heightCm) missing.push(tr('зріст', 'height'));
  if (!profile.birthDate) missing.push(tr('дату народження', 'date of birth'));
  if (!profile.sex) missing.push(tr('стать', 'sex'));
  return missing;
}
