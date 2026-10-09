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
const shortDateFormatter = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' });

export const formatDate = (ms: number) => dateFormatter.format(new Date(ms));
export const formatShortDate = (ms: number) => shortDateFormatter.format(new Date(ms));
