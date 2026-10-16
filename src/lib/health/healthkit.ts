import type { ActivityKind } from '@/db/schema';
import type { HealthProvider } from './types';

// Loaded lazily: the Nitro module throws on import wherever its native side is missing.
const load = () => import('@kingstinct/react-native-healthkit');

const READ_TYPES = ['HKQuantityTypeIdentifierBodyMass', 'HKWorkoutTypeIdentifier'] as const;

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
    const status = await getRequestStatusForAuthorization({ toRead: READ_TYPES });
    return status === AuthorizationRequestStatus.unnecessary;
  },

  async requestAccess() {
    const { requestAuthorization } = await load();
    return requestAuthorization({ toRead: READ_TYPES });
  },

  async read(since) {
    const { queryQuantitySamples, queryWorkoutSamples } = await load();
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
    return { weights, activities };
  },

  // Access can only be withdrawn in the Health app itself.
  async revokeAccess() {},
};
