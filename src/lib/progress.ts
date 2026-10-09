import type { TrackingType } from '@/db/schema';

import { bestMetric, isBetter, type SetValues } from './metrics';

export type SessionProgress = {
  workoutId: number;
  date: number;
  best: number;
  /** True when this session beat every earlier one. The first session counts as a PR. */
  isPR: boolean;
};

/** Best metric per session, oldest first, with PR flags. Sessions without usable sets are skipped. */
export function computeProgress(
  type: TrackingType,
  sessions: { workoutId: number; date: number; sets: SetValues[] }[],
): SessionProgress[] {
  const result: SessionProgress[] = [];
  let record: number | null = null;
  for (const s of [...sessions].sort((a, b) => a.date - b.date)) {
    const best = bestMetric(type, s.sets);
    if (best === null) continue;
    const isPR = isBetter(type, best, record);
    if (isPR) record = best;
    result.push({ workoutId: s.workoutId, date: s.date, best, isPR });
  }
  return result;
}

/** All-time record before `beforeMs`, used to flag a PR live during a workout. */
export function recordBefore(progress: SessionProgress[], type: TrackingType, beforeMs: number) {
  let record: number | null = null;
  for (const p of progress) {
    if (p.date < beforeMs && isBetter(type, p.best, record)) record = p.best;
  }
  return record;
}
