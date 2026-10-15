import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { importBodyWeights, type WeightReading } from '@/db/body-weight';

/** Health Connect is an Android-only native module that Expo Go doesn't bundle. */
export const healthConnectSupported = Platform.OS === 'android' && !isRunningInExpoGo();

export type WeightSyncResult =
  | { status: 'ok'; imported: number }
  | { status: 'unavailable' | 'update-required' | 'denied' };

let queue: Promise<unknown> = Promise.resolve();

/**
 * Pulls every weighing from Health Connect (e.g. a smart scale's app writing
 * through Google Fit) into the body weight log. With `prompt`, asks for read
 * access when it's missing; without it, quietly skips until access is granted.
 */
export function syncWeightFromHealthConnect(options: { prompt: boolean }) {
  // Runs one at a time, so overlapping syncs can't import the same day twice.
  const run = queue.then(() => sync(options));
  queue = run.catch(() => {});
  return run;
}

async function sync({ prompt }: { prompt: boolean }): Promise<WeightSyncResult> {
  // Loaded lazily: the module throws on import wherever its native side is missing.
  const {
    getGrantedPermissions,
    getSdkStatus,
    initialize,
    readRecords,
    requestPermission,
    SdkAvailabilityStatus,
  } = await import('react-native-health-connect');
  const hasWeightAccess = async () =>
    (await getGrantedPermissions()).some(
      (p) => p.accessType === 'read' && p.recordType === 'Weight',
    );

  const sdk = await getSdkStatus();
  if (sdk === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    return { status: 'update-required' };
  }
  if (sdk !== SdkAvailabilityStatus.SDK_AVAILABLE || !(await initialize())) {
    return { status: 'unavailable' };
  }

  if (!(await hasWeightAccess())) {
    if (!prompt) return { status: 'denied' };
    // History access lifts the default limit of 30 days before the first grant.
    await requestPermission([
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'read', recordType: 'ReadHealthDataHistory' },
    ]);
    if (!(await hasWeightAccess())) return { status: 'denied' };
  }

  const readings: WeightReading[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords('Weight', {
      timeRangeFilter: { operator: 'after', startTime: new Date(0).toISOString() },
      pageSize: 1000,
      pageToken,
    });
    for (const r of page.records) {
      readings.push({
        measuredAt: Date.parse(r.time),
        weightKg: Math.round(r.weight.inKilograms * 100) / 100,
      });
    }
    pageToken = page.pageToken || undefined;
  } while (pageToken);

  return { status: 'ok', imported: await importBodyWeights(readings) };
}
