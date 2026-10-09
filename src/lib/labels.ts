import type { MuscleGroup, TrackingType } from '@/db/schema';

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
