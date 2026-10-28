import type { HealthProvider } from './types';

// Loaded lazily: the Nitro module throws on import wherever its native side is missing.
const load = () => import('@kingstinct/react-native-healthkit');

const READ_TYPES = ['HKQuantityTypeIdentifierBodyMass'] as const;

/**
 * Apple Health on iOS. HealthKit never reveals whether read access was
 * granted, only whether the sheet was already shown: a denied type simply
 * reads as empty. Only weight is read.
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
    const { queryQuantitySamples } = await load();
    const samples = await queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
      limit: 0,
      unit: 'kg',
      filter: { date: { startDate: since } },
    });
    return samples.map((s) => ({
      measuredAt: s.startDate.getTime(),
      weightKg: Math.round(s.quantity * 100) / 100,
    }));
  },

  // Access can only be withdrawn in the Health app itself.
  async revokeAccess() {},
};
