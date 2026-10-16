import type { ActivityKind, MuscleGroup, Targets, TrackingType } from '@/db/schema';

import { locale, tr } from '@/lib/i18n';
import { DISTANCE_UNIT, kgToDisplay } from '@/lib/units';
import { formatDistance, formatDuration, formatNumber } from './metrics';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: tr('Груди', 'Chest'),
  back: tr('Спина', 'Back'),
  legs: tr('Ноги', 'Legs'),
  shoulders: tr('Плечі', 'Shoulders'),
  biceps: tr('Біцепс', 'Biceps'),
  triceps: tr('Трицепс', 'Triceps'),
  abs: tr('Прес', 'Abs'),
  cardio: tr('Кардіо', 'Cardio'),
};

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  weight_reps: tr('Вага × повторення', 'Weight × reps'),
  reps: tr('Тільки повторення', 'Reps only'),
  weighted_reps: tr('Повторення + додаткова вага', 'Reps + added weight'),
  duration: tr('Час', 'Time'),
  distance_duration: tr('Дистанція + час', 'Distance + time'),
};

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  walking: tr('Прогулянка', 'Walk'),
  running: tr('Біг', 'Run'),
  cycling: tr('Велосипед', 'Cycling'),
  hiking: tr('Похід', 'Hike'),
  swimming: tr('Плавання', 'Swimming'),
  strength: tr('Силове тренування', 'Strength training'),
  hiit: tr('Інтервальне тренування', 'Interval training'),
  yoga: tr('Йога та розтяжка', 'Yoga and stretching'),
  other: tr('Тренування', 'Workout'),
};

const dateFormatter = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const shortDateFormatter = new Intl.DateTimeFormat(locale, {
  day: 'numeric',
  month: 'short',
});

export const formatDate = (ms: number) => dateFormatter.format(new Date(ms));
export const formatShortDate = (ms: number) => shortDateFormatter.format(new Date(ms));

const longDateFormatter = new Intl.DateTimeFormat(locale, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
export const formatLongDate = (ms: number) => {
  const s = longDateFormatter.format(new Date(ms));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const WEEKDAY_SHORT = tr(
  ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
  ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
);

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

/** e.g. "3 × 8–12 · rest 1:30". */
function targetValue(t: Targets) {
  if (t.targetRepsMin !== null || t.targetRepsMax !== null) {
    return t.targetRepsMin !== null &&
      t.targetRepsMax !== null &&
      t.targetRepsMin !== t.targetRepsMax
      ? `${t.targetRepsMin}–${t.targetRepsMax}`
      : String(t.targetRepsMin ?? t.targetRepsMax);
  }
  if (t.targetDurationSec !== null) return formatDuration(t.targetDurationSec);
  if (t.targetDistanceKm !== null) return `${formatDistance(t.targetDistanceKm)} ${DISTANCE_UNIT}`;
  return '';
}

/** Per-set target: "8–12 reps", a duration or a distance; empty when none is set. */
export function formatSetTarget(t: Targets) {
  const what = targetValue(t);
  return what && (t.targetRepsMin !== null || t.targetRepsMax !== null)
    ? `${what} ${tr('повт.', 'reps')}`
    : what;
}

export function formatTargets(t: Targets) {
  const what = targetValue(t);
  const sets = what ? `${t.targetSets} × ${what}` : `${t.targetSets} ${tr('підх.', 'sets')}`;
  return t.restSec > 0
    ? `${sets} · ${tr('відпочинок', 'rest')} ${formatDuration(t.restSec)}`
    : sets;
}

/** Signed change of a weight in kg, shown in the chosen unit with one decimal: "+0.4", "−1.2" or "0". */
export function formatWeightDelta(kg: number) {
  const rounded = Math.round(kgToDisplay(kg) * 10) / 10;
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${formatNumber(Math.abs(rounded), 1)}`;
}
