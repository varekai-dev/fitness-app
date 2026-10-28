import type { WeightReading } from '@/db/body-weight';
import type { HealthProvider } from './types';

// Loaded lazily: the module throws on import wherever its native side is missing.
const load = () => import('react-native-health-connect');

/** Every weighing from `since` on, page by page. */
async function readWeights(since: Date) {
  const { readRecords } = await load();
  const records = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords('Weight', {
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
 * Health Connect on Android: a smart scale's app (Google Fit, Samsung Health,
 * Fitbit…) writes weighings there. Only weight is read.
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
      (p) => p.accessType === 'read' && p.recordType === 'Weight',
    );
  },

  async requestAccess() {
    const { requestPermission } = await load();
    await requestPermission([{ accessType: 'read', recordType: 'Weight' }]);
    return this.hasAccess();
  },

  async read(since): Promise<WeightReading[]> {
    return (await readWeights(since)).map((r) => ({
      measuredAt: Date.parse(r.time),
      weightKg: Math.round(r.weight.inKilograms * 100) / 100,
    }));
  },

  async revokeAccess() {
    const { revokeAllPermissions } = await load();
    await revokeAllPermissions();
  },
};
