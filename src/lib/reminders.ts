import { t } from '@lingui/core/macro';
import { locale } from '@/lib/i18n';
import { PHOTO_EVERY_DAYS } from '@/lib/progress-photos';
import { formatVolume, VOLUME_UNIT } from '@/lib/units';
import { addDays, startOfDay } from '@/lib/water';

/** The waking part of the day, in minutes after midnight. Reminders only fire inside it. */
export type DayWindow = { startMin: number; endMin: number };

export type WaterReminderSettings = {
  enabled: boolean;
  /** How often the intake is checked against the pace, in minutes. */
  intervalMin: number;
};

export const DEFAULT_DAY_WINDOW: DayWindow = { startMin: 8 * 60, endMin: 22 * 60 };
export const DAY_WINDOW_STEP_MIN = 30;
/** Shortest waking day that still leaves room for a few checks. */
export const MIN_DAY_LENGTH_MIN = 4 * 60;

export const REMINDER_INTERVALS_MIN = [60, 90, 120, 180, 240] as const;
export const DEFAULT_WATER_REMINDERS: WaterReminderSettings = { enabled: false, intervalMin: 120 };

/** iOS keeps at most 64 pending local notifications per app; leave a few spare. */
const MAX_SCHEDULED = 60;
const MAX_DAYS_AHEAD = 7;
/** Deficits are rounded up to this, and smaller ones are not worth a nudge. */
const DEFICIT_STEP_ML = 50;

/** "08:30" for minutes after midnight. */
export const formatClock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "2 год", "1,5 год". */
export const formatInterval = (min: number) =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(min / 60)} ${t`год`}`;

/** Time of day `min` minutes after the local midnight `dayStart` (DST-safe). */
const at = (dayStart: number, min: number) => {
  const d = new Date(dayStart);
  d.setHours(0, min, 0, 0);
  return d.getTime();
};

/**
 * Check times of one day: every `intervalMin` after the day starts, plus the
 * end of the day itself, by when the whole goal should be drunk.
 */
export function checkpointMinutes(window: DayWindow, intervalMin: number) {
  const mins: number[] = [];
  for (let m = window.startMin + intervalMin; m < window.endMin; m += intervalMin) mins.push(m);
  mins.push(window.endMin);
  return mins;
}

/** How much of `goal` should be drunk by `min`: an even pace from the start to the end of the day. */
export function expectedByMinute(window: DayWindow, goal: number, min: number) {
  const span = window.endMin - window.startMin;
  const share = Math.min(Math.max((min - window.startMin) / span, 0), 1);
  return goal * share;
}

/** Share of the day's goal (0–1) that should be drunk by `now` at an even pace. */
export function paceShare(window: DayWindow, now: number) {
  const d = new Date(now);
  return expectedByMinute(window, 1, d.getHours() * 60 + d.getMinutes());
}

const roundUp =(ml: number) => Math.ceil(ml / DEFICIT_STEP_ML) * DEFICIT_STEP_ML;

export type WaterReminder = { at: number; title: string; body: string };

/**
 * Reminders to schedule from `now`: one for every coming check at which the
 * intake would be behind the pace. Today's checks are measured against what is
 * already drunk; later days start from zero. Water is only logged in the app,
 * which reschedules on every change, so a reminder that is still pending when
 * it fires is always a real shortfall.
 */
export function planWaterReminders({
  now,
  today,
  todayMl,
  goal,
  window,
  intervalMin,
}: {
  now: number;
  /** Local midnight of the current day. */
  today: number;
  todayMl: number;
  goal: number;
  window: DayWindow;
  intervalMin: number;
}): WaterReminder[] {
  const reminders: WaterReminder[] = [];
  const mins = checkpointMinutes(window, intervalMin);
  for (let day = 0; day < MAX_DAYS_AHEAD; day++) {
    const dayStart = addDays(today, day);
    const drunk = day === 0 ? todayMl : 0;
    for (const min of mins) {
      const time = at(dayStart, min);
      if (time <= now) continue;
      const expected = expectedByMinute(window, goal, min);
      const deficit = roundUp(expected - drunk);
      if (expected - drunk < DEFICIT_STEP_ML) continue;
      const isEnd = min === window.endMin;
      reminders.push({
        at: time,
        title: isEnd
          ? t`Денна норма води ще не випита`
          : t`Час випити води`,
        body: isEnd
          ? t`Бракує ${formatVolume(deficit)} ${VOLUME_UNIT} до цілі ${formatVolume(goal)} ${VOLUME_UNIT}.`
          : t`До ${formatClock(min)} варто випити ${formatVolume(roundUp(expected))} ${VOLUME_UNIT} — бракує ${formatVolume(deficit)} ${VOLUME_UNIT}.`,
      });
      if (reminders.length >= MAX_SCHEDULED) return reminders;
    }
  }
  return reminders;
}

/** Photo reminders come this long after the day starts: morning, before breakfast. */
const PHOTO_REMINDER_OFFSET_MIN = 60;

/**
 * When to remind about the next progress photo: a week after the day of the
 * last one, in the morning. With no photo yet, or once it is overdue, the next
 * morning still ahead. The app reschedules on every launch, so an overdue
 * photo is nudged at most once a day, and only while the app is used.
 */
export function planPhotoReminder({
  now,
  lastPhotoAt,
  window,
}: {
  now: number;
  lastPhotoAt: number | null;
  window: DayWindow;
}) {
  const min = Math.min(window.startMin + PHOTO_REMINDER_OFFSET_MIN, window.endMin);
  let day =
    lastPhotoAt === null ? startOfDay(now) : addDays(startOfDay(lastPhotoAt), PHOTO_EVERY_DAYS);
  while (at(day, min) <= now) day = addDays(day, 1);
  return {
    at: at(day, min),
    title: t`Час для фото прогресу`,
    body:
      lastPhotoAt === null
        ? t`Зроби перше фото, щоб потім бачити, як змінюється тіло.`
        : t`Минув тиждень від останнього фото. Зроби нове в тій самій позі й при тому ж світлі.`,
  };
}
