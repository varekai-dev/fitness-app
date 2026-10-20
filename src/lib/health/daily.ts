import { addDays, startOfDay } from '@/lib/water';

/** Steps and sleep are read back this far at most, also on the first connect. */
export const DAILY_HISTORY_DAYS = 30;

/** Pauses shorter than this (waking at night) keep two stretches of sleep one night. */
const NIGHT_GAP_MS = 2 * 60 * 60 * 1000;

/** Local midnights from the day of `since` (but no more than the history window) to today. */
export function dailyRange(since: Date, now = Date.now()) {
  const today = startOfDay(now);
  let day = Math.max(startOfDay(since.getTime()), addDays(today, -(DAILY_HISTORY_DAYS - 1)));
  const days: number[] = [];
  while (day <= today) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

export type Interval = { start: number; end: number };

/**
 * Minutes asleep per day from stretches of sleep. Overlaps (a phone and a watch
 * both tracking the night) count once, and a night counts on the day it ends.
 */
export function sleepByDay(intervals: Interval[]) {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const byDay = new Map<number, number>();
  let night: { end: number; ms: number } | null = null;
  let covered = -Infinity; // end of the merged stretch so far, so overlaps add nothing
  const close = () => {
    if (!night) return;
    const day = startOfDay(night.end);
    byDay.set(day, (byDay.get(day) ?? 0) + Math.round(night.ms / 60_000));
  };
  for (const i of sorted) {
    if (!night || i.start - night.end > NIGHT_GAP_MS) {
      close();
      night = { end: i.end, ms: 0 };
      covered = i.start;
    }
    const from = Math.max(i.start, covered);
    if (i.end > from) night.ms += i.end - from;
    covered = Math.max(covered, i.end);
    night.end = Math.max(night.end, i.end);
  }
  close();
  return byDay;
}
