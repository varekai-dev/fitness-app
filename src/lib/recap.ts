import type { TrackingType } from '@/db/schema';
import type { listFinishedWorkouts } from '@/db/workouts';
import { locale } from '@/lib/i18n';
import { workoutDurationMs, type SetValues } from '@/lib/metrics';
import { computeProgress } from '@/lib/progress';
import { startOfDay } from '@/lib/water';

export const RECAP_PERIODS = ['month', 'year'] as const;
export type RecapPeriod = (typeof RECAP_PERIODS)[number];

type FinishedWorkout = Awaited<ReturnType<typeof listFinishedWorkouts>>[number];

export type PeriodRange = { from: number; to: number; label: string };

// The month alone: with the year, Ukrainian adds "р." ("жовтень 2026 р.").
const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long' });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The month or year `offset` periods before the current one, as [from, to). */
export function periodRange(period: RecapPeriod, offset: number, now = Date.now()): PeriodRange {
  const d = new Date(now);
  if (period === 'month') {
    const from = new Date(d.getFullYear(), d.getMonth() - offset, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    return {
      from: from.getTime(),
      to: to.getTime(),
      label: `${capitalize(monthFormatter.format(from))} ${from.getFullYear()}`,
    };
  }
  const year = d.getFullYear() - offset;
  return {
    from: new Date(year, 0, 1).getTime(),
    to: new Date(year + 1, 0, 1).getTime(),
    label: String(year),
  };
}

export type RecapRecord = {
  exerciseId: number;
  name: string;
  type: TrackingType;
  /** The best metric reached in the period (see `setMetric`). */
  value: number;
  date: number;
};

export type Recap = {
  workouts: number;
  activeDays: number;
  durationMs: number;
  /** Weight × reps of completed weighted sets, in kg. */
  tonnageKg: number;
  sets: number;
  /** The exercise done in the most workouts, more sets breaking a tie. */
  favorite: { name: string; workouts: number; sets: number } | null;
  /** Exercises whose all-time best was beaten in the period, newest first. */
  records: RecapRecord[];
};

const isWeighted = (t: TrackingType) => t === 'weight_reps' || t === 'weighted_reps';

/**
 * Totals of the workouts that started in the range. Records compare against the
 * whole history, and an exercise's very first session doesn't count as one.
 */
export function computeRecap(all: FinishedWorkout[], range: Pick<PeriodRange, 'from' | 'to'>) {
  const inRange = all.filter((w) => w.startedAt >= range.from && w.startedAt < range.to);

  let durationMs = 0;
  let tonnageKg = 0;
  let sets = 0;
  const days = new Set<number>();
  const usage = new Map<number, { name: string; workouts: number; sets: number }>();
  for (const w of inRange) {
    durationMs += workoutDurationMs(w, w.finishedAt ?? w.startedAt);
    days.add(startOfDay(w.startedAt));
    for (const e of w.exercises) {
      const done = e.sets.filter((s) => s.completedAt !== null);
      if (done.length === 0) continue;
      sets += done.length;
      if (isWeighted(e.exercise.trackingType)) {
        for (const s of done) tonnageKg += (s.weightKg ?? 0) * (s.reps ?? 0);
      }
      const u = usage.get(e.exerciseId) ?? { name: e.exercise.name, workouts: 0, sets: 0 };
      u.workouts++;
      u.sets += done.length;
      usage.set(e.exerciseId, u);
    }
  }
  const favorite =
    [...usage.values()].sort((a, b) => b.workouts - a.workouts || b.sets - a.sets)[0] ?? null;

  // Every session of each exercise trained in the period, over the whole history.
  const sessions = new Map<
    number,
    {
      name: string;
      type: TrackingType;
      list: { workoutId: number; date: number; sets: SetValues[] }[];
    }
  >();
  for (const w of all) {
    for (const e of w.exercises) {
      if (!usage.has(e.exerciseId)) continue;
      const done = e.sets.filter((s) => s.completedAt !== null);
      if (done.length === 0) continue;
      const entry = sessions.get(e.exerciseId) ?? {
        name: e.exercise.name,
        type: e.exercise.trackingType,
        list: [],
      };
      entry.list.push({ workoutId: w.id, date: w.startedAt, sets: done });
      sessions.set(e.exerciseId, entry);
    }
  }
  const records: RecapRecord[] = [];
  for (const [exerciseId, { name, type, list }] of sessions) {
    const progress = computeProgress(type, list);
    // The latest PR in the period is the best one there; the first session is no record.
    const pr = progress
      .slice(1)
      .findLast((p) => p.isPR && p.date >= range.from && p.date < range.to);
    if (pr) records.push({ exerciseId, name, type, value: pr.best, date: pr.date });
  }
  records.sort((a, b) => b.date - a.date);

  return {
    workouts: inRange.length,
    activeDays: days.size,
    durationMs,
    tonnageKg,
    sets,
    favorite,
    records,
  } satisfies Recap;
}

/** Per-day totals of rows that fall in the range. */
function byDay<T>(rows: T[], at: (r: T) => number, range: Pick<PeriodRange, 'from' | 'to'>) {
  const days = new Map<number, T[]>();
  for (const r of rows) {
    const t = at(r);
    if (t < range.from || t >= range.to) continue;
    const day = startOfDay(t);
    days.set(day, [...(days.get(day) ?? []), r]);
  }
  return days;
}

const sum = <T>(rows: T[], value: (r: T) => number) => rows.reduce((s, r) => s + value(r), 0);

export type FoodRecap = {
  /** Days with anything logged; the averages are over these. */
  loggedDays: number;
  avgKcal: number;
  avgProteinG: number;
  /** Logged days that stayed at or under the kcal goal. */
  daysWithinGoal: number;
  /** The dish logged most often. */
  favorite: { name: string; times: number } | null;
};

export function computeFoodRecap(
  entries: { eatenAt: number; name: string; kcal: number; proteinG: number }[],
  kcalGoal: number,
  range: Pick<PeriodRange, 'from' | 'to'>,
): FoodRecap {
  const days = [...byDay(entries, (e) => e.eatenAt, range).values()];
  const kcal = days.map((d) => sum(d, (e) => e.kcal));
  const dishes = new Map<string, { name: string; times: number }>();
  for (const e of days.flat()) {
    const key = e.name.trim().toLowerCase();
    const d = dishes.get(key) ?? { name: e.name.trim(), times: 0 };
    d.times++;
    dishes.set(key, d);
  }
  const n = days.length;
  return {
    loggedDays: n,
    avgKcal: n ? sum(kcal, (k) => k) / n : 0,
    avgProteinG: n ? sum(days.flat(), (e) => e.proteinG) / n : 0,
    daysWithinGoal: kcal.filter((k) => k > 0 && k <= kcalGoal).length,
    favorite: [...dishes.values()].sort((a, b) => b.times - a.times)[0] ?? null,
  };
}

export type WaterRecap = {
  totalMl: number;
  /** Days with any water logged; the average is over these. */
  loggedDays: number;
  avgMl: number;
  daysAtGoal: number;
  bestDayMl: number;
};

export function computeWaterRecap(
  intakes: { drankAt: number; amountMl: number }[],
  goalMl: number,
  range: Pick<PeriodRange, 'from' | 'to'>,
): WaterRecap {
  const totals = [...byDay(intakes, (i) => i.drankAt, range).values()].map((d) =>
    sum(d, (i) => i.amountMl),
  );
  const totalMl = sum(totals, (t) => t);
  return {
    totalMl,
    loggedDays: totals.length,
    avgMl: totals.length ? totalMl / totals.length : 0,
    daysAtGoal: totals.filter((t) => t >= goalMl).length,
    bestDayMl: totals.length ? Math.max(...totals) : 0,
  };
}
