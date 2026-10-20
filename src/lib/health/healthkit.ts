import type { DailyHealthReading } from '@/db/daily-health';
import type { ActivityKind } from '@/db/schema';
import { addDays } from '@/lib/water';
import { dailyRange, sleepByDay } from './daily';
import type { HealthProvider } from './types';

// Loaded lazily: the Nitro module throws on import wherever its native side is missing.
const load = () => import('@kingstinct/react-native-healthkit');

/**
 * What `hasAccess` checks: the types of the first version. Types added since are
 * requested on the next connect, but a store connected before keeps syncing.
 */
const CORE_TYPES = ['HKQuantityTypeIdentifierBodyMass', 'HKWorkoutTypeIdentifier'] as const;
const READ_TYPES = [
  ...CORE_TYPES,
  'HKQuantityTypeIdentifierStepCount',
  'HKCategoryTypeIdentifierSleepAnalysis',
] as const;

/** Sleep analysis values (CategoryValueSleepAnalysis) that count as asleep, not in bed or awake. */
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);

/** HealthKit workout activity types (WorkoutActivityType) grouped into the app's kinds. */
const KINDS: Record<number, ActivityKind> = {
  52: 'walking',
  37: 'running',
  13: 'cycling',
  74: 'cycling',
  24: 'hiking',
  46: 'swimming',
  20: 'strength',
  50: 'strength',
  59: 'strength',
  11: 'hiit',
  63: 'hiit',
  73: 'hiit',
  57: 'yoga',
  62: 'yoga',
  66: 'yoga',
};

/**
 * Apple Health on iOS. HealthKit never reveals whether read access was
 * granted, only whether the sheet was already shown: a denied type simply
 * reads as empty.
 */
export const healthKit: HealthProvider = {
  async availability() {
    const { isHealthDataAvailableAsync } = await load();
    return (await isHealthDataAvailableAsync()) ? 'ok' : 'unavailable';
  },

  async hasAccess() {
    const { getRequestStatusForAuthorization, AuthorizationRequestStatus } = await load();
    const status = await getRequestStatusForAuthorization({ toRead: CORE_TYPES });
    return status === AuthorizationRequestStatus.unnecessary;
  },

  async requestAccess() {
    const { requestAuthorization } = await load();
    return requestAuthorization({ toRead: READ_TYPES });
  },

  async read(since) {
    const {
      queryCategorySamples,
      queryQuantitySamples,
      queryStatisticsCollectionForQuantity,
      queryWorkoutSamples,
    } = await load();
    const filter = { date: { startDate: since } };

    const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
      limit: 0,
      unit: 'kg',
      filter,
    });
    const weights = samples.map((s) => ({
      measuredAt: s.startDate.getTime(),
      weightKg: Math.round(s.quantity * 100) / 100,
    }));

    const workouts = await queryWorkoutSamples({ limit: 0, filter });
    const activities = workouts.map((proxy) => {
      // Plain values first: the proxy keeps the native HKWorkout alive until disposed.
      const w = proxy.toJSON();
      proxy.dispose();
      const meters = w.totalDistance?.quantity;
      const kcal = w.totalEnergyBurned?.quantity;
      return {
        source: 'apple_health' as const,
        externalId: w.uuid,
        kind: KINDS[w.workoutActivityType] ?? 'other',
        title: null,
        startedAt: w.startDate.getTime(),
        finishedAt: w.endDate.getTime(),
        distanceKm: meters ? meters / 1000 : null,
        kcal: kcal || null,
      };
    });
    // A type the user didn't allow reads as empty, so missing days stay as logged.
    const range = dailyRange(since);
    const days: DailyHealthReading[] = range.map((day) => ({ day }));
    const first = new Date(range[0]);
    const steps = await queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      first,
      { day: 1 },
      { filter: { date: { startDate: first } }, unit: 'count' },
    );
    for (const s of steps) {
      const d = s.startDate && days.find((x) => x.day === s.startDate!.getTime());
      if (d && s.sumQuantity) d.steps = Math.round(s.sumQuantity.quantity);
    }

    // From the evening before the first day, so its night is read whole.
    const sleep = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      limit: 0,
      filter: { date: { startDate: new Date(addDays(range[0], -1)) } },
    });
    const minutes = sleepByDay(
      sleep
        .filter((s) => ASLEEP_VALUES.has(s.value))
        .map((s) => ({ start: s.startDate.getTime(), end: s.endDate.getTime() })),
    );
    for (const d of days) {
      const m = minutes.get(d.day);
      if (m !== undefined) d.sleepMin = m;
    }

    return { weights, activities, days };
  },

  // Access can only be withdrawn in the Health app itself.
  async revokeAccess() {},
};
