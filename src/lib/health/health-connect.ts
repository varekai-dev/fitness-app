import type { ActivityReading } from '@/db/activities';
import type { WeightReading } from '@/db/body-weight';
import type { DailyHealthReading } from '@/db/daily-health';
import type { ActivityKind } from '@/db/schema';
import { addDays } from '@/lib/water';
import { dailyRange, sleepByDay, type Interval } from './daily';
import type { HealthProvider } from './types';

// Loaded lazily: the module throws on import wherever its native side is missing.
const load = () => import('react-native-health-connect');

const READ_TYPES = [
  'Weight',
  'ExerciseSession',
  'Distance',
  'ActiveCaloriesBurned',
  'Steps',
  'SleepSession',
] as const;

/** Any of these granted is worth syncing for. */
const SYNCED_TYPES: string[] = ['Weight', 'ExerciseSession', 'Steps', 'SleepSession'];

/** Sleep stages (SleepStageType) that count as asleep, not awake or out of bed. */
const ASLEEP_STAGES = new Set([2, 4, 5, 6]);

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
async function readAll<T extends 'Weight' | 'ExerciseSession' | 'SleepSession'>(
  recordType: T,
  since: Date,
) {
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
      (p) => p.accessType === 'read' && SYNCED_TYPES.includes(p.recordType),
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
      (await getGrantedPermissions())
        .filter((p) => p.accessType === 'read')
        .map((p) => p.recordType),
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
    const range = dailyRange(since);
    const days: DailyHealthReading[] = range.map((day) => ({ day }));

    if (granted.has('Steps')) {
      const now = Date.now();
      for (const d of days) {
        const { COUNT_TOTAL } = await aggregateRecord({
          recordType: 'Steps',
          timeRangeFilter: {
            operator: 'between',
            startTime: new Date(d.day).toISOString(),
            endTime: new Date(Math.min(addDays(d.day, 1), now)).toISOString(),
          },
        });
        d.steps = Math.round(COUNT_TOTAL ?? 0);
      }
    }

    if (granted.has('SleepSession')) {
      // From the evening before the first day, so its night is read whole.
      const sessions = await readAll('SleepSession', new Date(addDays(range[0], -1)));
      const intervals: Interval[] = sessions.flatMap((s) => {
        const asleep = (s.stages ?? []).filter((st) => ASLEEP_STAGES.has(st.stage));
        // Without stages the whole session is the sleep.
        const spans = asleep.length ? asleep : [s];
        return spans.map((sp) => ({
          start: Date.parse(sp.startTime),
          end: Date.parse(sp.endTime),
        }));
      });
      const minutes = sleepByDay(intervals);
      for (const d of days) {
        const m = minutes.get(d.day);
        if (m !== undefined) d.sleepMin = m;
      }
    }

    return { weights, activities, days };
  },

  async revokeAccess() {
    const { revokeAllPermissions } = await load();
    await revokeAllPermissions();
  },
};
