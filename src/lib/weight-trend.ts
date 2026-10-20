const DAY_MS = 24 * 60 * 60 * 1000;

/** Share of the gap to a new weigh-in the trend closes per day (Hacker's Diet uses 10%). */
const SMOOTHING = 0.1;
/** The pace is the slope over this many days back from the latest weigh-in. */
const RATE_WINDOW_DAYS = 28;
/** Below this span the slope is mostly noise from water and food. */
const MIN_RATE_SPAN_DAYS = 7;
/** Slower than this, in kg a week, the weight counts as standing still. */
const FLAT_WEEKLY_KG = 0.05;
/** The trend this close to the target counts as there. */
const REACHED_KG = 0.3;
const MAX_FORECAST_DAYS = 2 * 365;

export type Weighing = { measuredAt: number; weightKg: number };

/**
 * Exponentially smoothed weight, one value per weigh-in. Each reading pulls the
 * trend by `SMOOTHING` per day since the previous one, so a gap of a week
 * counts more than a day and the daily swings of water and salt fade out.
 */
export function weightTrend(entries: Weighing[]) {
  const trend: number[] = [];
  entries.forEach((e, i) => {
    if (i === 0) {
      trend.push(e.weightKg);
      return;
    }
    const days = Math.max((e.measuredAt - entries[i - 1].measuredAt) / DAY_MS, 0);
    const pull = 1 - (1 - SMOOTHING) ** Math.max(days, 1);
    const prev = trend[i - 1];
    trend.push(prev + pull * (e.weightKg - prev));
  });
  return trend;
}

/**
 * Change in kg a week: least-squares slope of the weigh-ins over the last four
 * weeks. Null until they span a week.
 */
export function weeklyRate(entries: Weighing[]) {
  const latest = entries.at(-1);
  if (!latest) return null;
  const recent = entries.filter((e) => e.measuredAt >= latest.measuredAt - RATE_WINDOW_DAYS * DAY_MS);
  if ((latest.measuredAt - recent[0].measuredAt) / DAY_MS < MIN_RATE_SPAN_DAYS) return null;

  const xs = recent.map((e) => (e.measuredAt - recent[0].measuredAt) / DAY_MS);
  const ys = recent.map((e) => e.weightKg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  return den === 0 ? null : (num / den) * 7;
}

export type GoalForecast =
  | { kind: 'reached' }
  /** Not enough weigh-ins for a pace yet. */
  | { kind: 'unknown' }
  /** Standing still or heading away from the target. */
  | { kind: 'stalled' }
  /** Further off than `MAX_FORECAST_DAYS` at this pace. */
  | { kind: 'far' }
  | { kind: 'date'; at: number };

/** When the trend reaches `targetKg` if the weight keeps changing at `rate` kg a week. */
export function forecastGoal(
  trendKg: number,
  targetKg: number,
  rate: number | null,
  from: number,
): GoalForecast {
  const gap = targetKg - trendKg;
  if (Math.abs(gap) <= REACHED_KG) return { kind: 'reached' };
  if (rate === null) return { kind: 'unknown' };
  if (rate * Math.sign(gap) < FLAT_WEEKLY_KG) return { kind: 'stalled' };
  const days = (gap / rate) * 7;
  if (days > MAX_FORECAST_DAYS) return { kind: 'far' };
  return { kind: 'date', at: from + days * DAY_MS };
}
