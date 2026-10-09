import type { MuscleGroup, Targets, TrackingType } from '@/db/schema';

import { formatDuration } from './metrics';

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

const dateFormatter = new Intl.DateTimeFormat('uk-UA', {
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
export function formatTargets(t: Targets) {
  let what = '';
  if (t.targetRepsMin !== null || t.targetRepsMax !== null) {
    what =
      t.targetRepsMin !== null && t.targetRepsMax !== null && t.targetRepsMin !== t.targetRepsMax
        ? `${t.targetRepsMin}–${t.targetRepsMax}`
        : String(t.targetRepsMin ?? t.targetRepsMax);
  } else if (t.targetDurationSec !== null) what = formatDuration(t.targetDurationSec);
  else if (t.targetDistanceKm !== null) what = `${t.targetDistanceKm} км`;
  const sets = what ? `${t.targetSets} × ${what}` : `${t.targetSets} підх.`;
  return t.restSec > 0 ? `${sets} · відпочинок ${formatDuration(t.restSec)}` : sets;
}
