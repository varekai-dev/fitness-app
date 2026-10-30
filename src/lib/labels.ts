import { t } from '@lingui/core/macro';
import type { ActivityKind, MuscleGroup, Targets, TrackingType } from '@/db/schema';

import { locale } from '@/lib/i18n';
import { DISTANCE_UNIT, kgToDisplay } from '@/lib/units';
import { formatDistance, formatDuration, formatNumber } from './metrics';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: t`Груди`,
  back: t`Спина`,
  legs: t`Ноги`,
  shoulders: t`Плечі`,
  biceps: t`Біцепс`,
  triceps: t`Трицепс`,
  abs: t`Прес`,
  cardio: t`Кардіо`,
};

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  weight_reps: t`Вага × повторення`,
  reps: t`Тільки повторення`,
  weighted_reps: t`Повторення + додаткова вага`,
  duration: t({ message: 'Час', context: 'Time' }),
  distance_duration: t`Дистанція + час`,
};

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  walking: t`Прогулянка`,
  running: t`Біг`,
  cycling: t`Велосипед`,
  hiking: t`Похід`,
  swimming: t`Плавання`,
  strength: t`Силове тренування`,
  hiit: t`Інтервальне тренування`,
  yoga: t`Йога та розтяжка`,
  other: t({ message: 'Тренування', context: 'Workout' }),
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

export const WEEKDAY_SHORT = [t`Пн`, t`Вт`, t`Ср`, t`Чт`, t`Пт`, t`Сб`, t`Нд`];

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
export function formatSetTarget(targets: Targets) {
  const what = targetValue(targets);
  return what && (targets.targetRepsMin !== null || targets.targetRepsMax !== null)
    ? `${what} ${t`повт.`}`
    : what;
}

export function formatTargets(targets: Targets) {
  const what = targetValue(targets);
  const sets = what
    ? `${targets.targetSets} × ${what}`
    : `${targets.targetSets} ${t`підх.`}`;
  return targets.restSec > 0
    ? `${sets} · ${t`відпочинок`} ${formatDuration(targets.restSec)}`
    : sets;
}

/** Signed change of a weight in kg, shown in the chosen unit with one decimal: "+0.4", "−1.2" or "0". */
export function formatWeightDelta(kg: number) {
  const rounded = Math.round(kgToDisplay(kg) * 10) / 10;
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${formatNumber(Math.abs(rounded), 1)}`;
}
