import type { ActivityReading } from '@/db/activities';
import type { WeightReading } from '@/db/body-weight';
import type { ActivityKind } from '@/db/schema';
import type { HealthProvider } from './types';

// Loaded lazily: the module throws on import wherever its native side is missing.
const load = () => import('react-native-health-connect');

const READ_TYPES = ['Weight', 'ExerciseSession', 'Distance', 'ActiveCaloriesBurned'] as const;

/** Health Connect exercise types (ExerciseType constants) grouped into the app's kinds. */
const KINDS: Record<number, ActivityKind> = {
  79: 'walking',
  56: 'running',
  57: 'running',
  8: 'cycling',
  9: 'cycling',
  37: 'hiking',
  73: 'swimming',
  74: 'swimming',
  13: 'strength',
  70: 'strength',
  81: 'strength',
  10: 'hiit',
  36: 'hiit',
  48: 'yoga',
  71: 'yoga',
  83: 'yoga',
};

/** Every page of a record type from `since` on. */
async function readAll<T extends 'Weight' | 'ExerciseSession'>(recordType: T, since: Date) {
  const { readRecords } = await load();
  const records = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(recordType, {
      timeRangeFilter: { operator: 'after', startTime: since.toISOString() },
      pageSize: 1000,
      pageToken,
    });
    records.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return records;
}

/**
 * Health Connect on Android: a scale's or watch's app (Google Fit, Samsung
 * Health, Fitbit…) writes weighings and exercise sessions there.
 */
export const healthConnect: HealthProvider = {
  async availability() {
    const { getSdkStatus, initialize, SdkAvailabilityStatus } = await load();
    const sdk = await getSdkStatus();
    if (sdk === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return 'update-required';
    }
    if (sdk !== SdkAvailabilityStatus.SDK_AVAILABLE || !(await initialize())) {
      return 'unavailable';
    }
    return 'ok';
  },

  async hasAccess() {
    const { getGrantedPermissions } = await load();
    return (await getGrantedPermissions()).some(
      (p) =>
        p.accessType === 'read' && (p.recordType === 'Weight' || p.recordType === 'ExerciseSession'),
    );
  },

  async requestAccess() {
    const { requestPermission } = await load();
    await requestPermission([
      ...READ_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType })),
      // History access lifts the default limit of 30 days before the first grant.
      { accessType: 'read', recordType: 'ReadHealthDataHistory' },
    ]);
    return this.hasAccess();
  },

  async read(since) {
    const { aggregateRecord, getGrantedPermissions } = await load();
    const granted = new Set(
      (await getGrantedPermissions()).filter((p) => p.accessType === 'read').map((p) => p.recordType),
    );

    const weights: WeightReading[] = granted.has('Weight')
      ? (await readAll('Weight', since)).map((r) => ({
          measuredAt: Date.parse(r.time),
          weightKg: Math.round(r.weight.inKilograms * 100) / 100,
        }))
      : [];

    const activities: ActivityReading[] = [];
    if (granted.has('ExerciseSession')) {
      for (const s of await readAll('ExerciseSession', since)) {
        if (!s.metadata?.id) continue;
        const timeRangeFilter = {
          operator: 'between' as const,
          startTime: s.startTime,
          endTime: s.endTime,
        };
        // Totals live in separate records; the session only carries its time span.
        const distance = granted.has('Distance')
          ? (await aggregateRecord({ recordType: 'Distance', timeRangeFilter })).DISTANCE
          : null;
        const energy = granted.has('ActiveCaloriesBurned')
          ? (await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter }))
              .ACTIVE_CALORIES_TOTAL
          : null;
        activities.push({
          source: 'health_connect',
          externalId: s.metadata.id,
          kind: KINDS[s.exerciseType] ?? 'other',
          title: s.title?.trim() || null,
          startedAt: Date.parse(s.startTime),
          finishedAt: Date.parse(s.endTime),
          distanceKm: distance?.inKilometers ? distance.inKilometers : null,
          kcal: energy?.inKilocalories ? energy.inKilocalories : null,
        });
      }
    }
    return { weights, activities };
  },

  async revokeAccess() {
    const { revokeAllPermissions } = await load();
    await revokeAllPermissions();
  },
};
