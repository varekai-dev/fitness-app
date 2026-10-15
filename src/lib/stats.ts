import { startOfWeek } from './labels';
import { addDays, startOfDay } from './water';

/** How far back daily streaks look. */
export const STREAK_DAYS = 365;

/** Totals per local day, keyed by the day's local midnight. */
export function totalsByDay<T>(rows: T[], at: (row: T) => number, amount: (row: T) => number) {
  const byDay = new Map<number, number>();
  for (const r of rows) {
    const day = startOfDay(at(r));
    byDay.set(day, (byDay.get(day) ?? 0) + amount(r));
  }
  return byDay;
}

/**
 * Days in a row ending today that meet `hit`. Today still in progress doesn't
 * break the run: when it misses, counting starts from yesterday.
 */
export function dayStreak(now: number, hit: (dayStart: number) => boolean) {
  let day = startOfDay(now);
  if (!hit(day)) day = addDays(day, -1);
  let n = 0;
  while (n < STREAK_DAYS && hit(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Weeks in a row with at least one workout, not broken by a current week without one yet. */
export function weekStreak(now: number, startedAts: number[]) {
  const weeks = new Set(startedAts.map(startOfWeek));
  let week = startOfWeek(now);
  if (!weeks.has(week)) week = startOfWeek(week - 1);
  let n = 0;
  while (weeks.has(week)) {
    n++;
    week = startOfWeek(week - 1);
  }
  return n;
}

/** Whole calendar days between two moments. */
export const daysBetween = (from: number, to: number) =>
  Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);

/** Average over the days that have anything logged; null when none do. */
export function averageOfLogged(values: number[]) {
  const logged = values.filter((v) => v > 0);
  return logged.length > 0 ? logged.reduce((s, v) => s + v, 0) / logged.length : null;
}
