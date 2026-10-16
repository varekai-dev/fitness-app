import type { ActivityKind, MuscleGroup, Targets, TrackingType } from '@/db/schema';

import { formatDuration, formatNumber } from './metrics';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Груди',
  back: 'Спина',
  legs: 'Ноги',
  shoulders: 'Плечі',
  biceps: 'Біцепс',
  triceps: 'Трицепс',
  abs: 'Прес',
  cardio: 'Кардіо',
};

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Вага × повторення',
  reps: 'Тільки повторення',
  weighted_reps: 'Повторення + додаткова вага',
  duration: 'Час',
  distance_duration: 'Дистанція + час',
};

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  walking: 'Прогулянка',
  running: 'Біг',
  cycling: 'Велосипед',
  hiking: 'Похід',
  swimming: 'Плавання',
  strength: 'Силове тренування',
  hiit: 'Інтервальне тренування',
  yoga: 'Йога та розтяжка',
  other: 'Тренування',
};

const dateFormatter =new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const shortDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'short',
});

export const formatDate = (ms: number) => dateFormatter.format(new Date(ms));
export const formatShortDate = (ms: number) => shortDateFormatter.format(new Date(ms));

const longDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
export const formatLongDate = (ms: number) => {
  const s = longDateFormatter.format(new Date(ms));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const;

/** Local midnight of the Monday that starts the week containing `ms`. */
export function startOfWeek(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d.getTime();
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (ms: number) => (new Date(ms).getDay() + 6) % 7;

/** e.g. "3 × 8–12 · відпочинок 1:30". */
function targetValue(t: Targets) {
  if (t.targetRepsMin !== null || t.targetRepsMax !== null) {
    return t.targetRepsMin !== null &&
      t.targetRepsMax !== null &&
      t.targetRepsMin !== t.targetRepsMax
      ? `${t.targetRepsMin}–${t.targetRepsMax}`
      : String(t.targetRepsMin ?? t.targetRepsMax);
  }
  if (t.targetDurationSec !== null) return formatDuration(t.targetDurationSec);
  if (t.targetDistanceKm !== null) return `${t.targetDistanceKm} км`;
  return '';
}

/** Per-set target: "8–12 повт.", a duration or a distance; empty when none is set. */
export function formatSetTarget(t: Targets) {
  const what = targetValue(t);
  return what && (t.targetRepsMin !== null || t.targetRepsMax !== null) ? `${what} повт.` : what;
}

export function formatTargets(t: Targets) {
  const what = targetValue(t);
  const sets = what ? `${t.targetSets} × ${what}` : `${t.targetSets} підх.`;
  return t.restSec > 0 ? `${sets} · відпочинок ${formatDuration(t.restSec)}` : sets;
}

/** Signed change in kilograms with one decimal: "+0.4", "−1.2" or "0". */
export function formatWeightDelta(kg: number) {
  const rounded = Math.round(kg * 10) / 10;
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${formatNumber(Math.abs(rounded), 1)}`;
}
