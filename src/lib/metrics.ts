import type { TrackingType, WorkoutSet } from '@/db/schema';

export type SetValues = Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceKm'>;

/** Epley estimated one-rep max. A single rep is the weight itself. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export type MetricInfo = {
  label: string;
  unit: string;
  /** Pace is better when lower; everything else when higher. */
  higherIsBetter: boolean;
};

export const METRIC_INFO: Record<TrackingType, MetricInfo> = {
  weight_reps: { label: 'Розрахунковий 1ПМ', unit: 'кг', higherIsBetter: true },
  // Body weight is not tracked, so the estimate covers only the added weight.
  weighted_reps: {
    label: '1ПМ додаткової ваги',
    unit: 'кг',
    higherIsBetter: true,
  },
  reps: { label: 'Макс. повторень', unit: 'повт', higherIsBetter: true },
  duration: { label: 'Макс. час', unit: 'с', higherIsBetter: true },
  distance_duration: {
    label: 'Найкращий темп',
    unit: 'хв/км',
    higherIsBetter: false,
  },
};

/** The single number a set is judged by for charts and PRs, or null if the set has no usable data. */
export function setMetric(type: TrackingType, s: SetValues): number | null {
  switch (type) {
    case 'weight_reps':
    case 'weighted_reps': {
      const v = epley1RM(s.weightKg ?? 0, s.reps ?? 0);
      return v > 0 ? v : null;
    }
    case 'reps':
      return s.reps && s.reps > 0 ? s.reps : null;
    case 'duration':
      return s.durationSec && s.durationSec > 0 ? s.durationSec : null;
    case 'distance_duration':
      // Seconds per km.
      return s.distanceKm && s.distanceKm > 0 && s.durationSec && s.durationSec > 0
        ? s.durationSec / s.distanceKm
        : null;
  }
}

export function isBetter(type: TrackingType, a: number, b: number | null): boolean {
  if (b === null) return true;
  return METRIC_INFO[type].higherIsBetter ? a > b : a < b;
}

export function bestMetric(type: TrackingType, sets: SetValues[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const m = setMetric(type, s);
    if (m !== null && isBetter(type, m, best)) best = m;
  }
  return best;
}

export function formatMetric(type: TrackingType, value: number): string {
  switch (type) {
    case 'weight_reps':
    case 'weighted_reps':
      return `${formatNumber(value, 1)} кг`;
    case 'reps':
      return `${Math.round(value)} повт`;
    case 'duration':
      return formatDuration(value);
    case 'distance_duration':
      return `${formatDuration(value)} /км`;
  }
}

export function formatNumber(value: number, maxFractionDigits = 2): string {
  const factor = 10 ** maxFractionDigits;
  return String(Math.round(value * factor) / factor);
}

export function formatDuration(totalSec: number): string {
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Human-readable set, e.g. "20 кг × 10" or "5 км за 25:00". */
export function formatSet(type: TrackingType, s: SetValues): string {
  switch (type) {
    case 'weight_reps':
      return `${formatNumber(s.weightKg ?? 0)} кг × ${s.reps ?? 0}`;
    case 'weighted_reps':
      return s.weightKg ? `+${formatNumber(s.weightKg)} кг × ${s.reps ?? 0}` : `${s.reps ?? 0}`;
    case 'reps':
      return `${s.reps ?? 0}`;
    case 'duration':
      return formatDuration(s.durationSec ?? 0);
    case 'distance_duration':
      return `${formatNumber(s.distanceKm ?? 0)} км за ${formatDuration(s.durationSec ?? 0)}`;
  }
}

/** Accepts both "2.5" and "2,5". Returns null for empty or invalid input. */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Parses "90", "1:30" or "1:02:03" into seconds. */
export function parseDuration(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** A workout that was opened but whose play button hasn't been pressed yet. */
export function notStarted(w: { startedAt: number; pausedAt: number | null; pausedMs: number }) {
  return w.pausedAt === w.startedAt && w.pausedMs === 0;
}

/** Active workout time in ms, excluding pauses. `now` is ignored once finished or paused. */
export function workoutDurationMs(
  w: { startedAt: number; finishedAt?: number | null; pausedAt: number | null; pausedMs: number },
  now: number,
) {
  const end = w.finishedAt ?? w.pausedAt ?? now;
  return Math.max(0, end - w.startedAt - w.pausedMs);
}
