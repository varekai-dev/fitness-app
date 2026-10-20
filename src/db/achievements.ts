import { readSettingSync, writeSettingSync } from '@/lib/app-settings';
import { listBodyWeights } from './body-weight';
import { listProgressPhotos } from './progress-photos';
import { loadRecapData } from './recap';

/** The whole history: achievements unlock from everything ever logged. */
export async function loadAchievementData() {
  const [recap, weights, photos] = await Promise.all([
    loadRecapData(),
    listBodyWeights(),
    listProgressPhotos(),
  ]);
  return {
    ...recap,
    weighIns: weights.map((w) => w.measuredAt),
    photos: photos.map((p) => p.takenAt),
  };
}

export type AchievementData = Awaited<ReturnType<typeof loadAchievementData>>;

const SEEN_KEY = 'achievements_seen';

/** Levels per achievement the user has already seen on the achievements screen. */
export function readSeenLevels(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(readSettingSync(SEEN_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function writeSeenLevels(levels: Record<string, number>) {
  writeSettingSync(SEEN_KEY, JSON.stringify(levels));
}
