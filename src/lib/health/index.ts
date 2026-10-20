import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { importActivities } from '@/db/activities';
import { importBodyWeights } from '@/db/body-weight';
import { importDailyHealth } from '@/db/daily-health';
import { getHealthSettings, setHealthEnabled, setHealthSyncedAt } from '@/db/health';
import { healthConnect } from './health-connect';
import { healthKit } from './healthkit';
import type { HealthProvider, HealthStatus } from './types';

const provider: HealthProvider | null =
  Platform.OS === 'ios' ? healthKit : Platform.OS === 'android' ? healthConnect : null;

/** The platform's health store; Expo Go bundles neither native module. */
export const healthSupported = provider !== null && !isRunningInExpoGo();

/** Shown on the web and in Expo Go too, to say what a development build would connect to. */
export const healthName = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

export type HealthSyncResult =
  { status: 'ok'; weights: number; activities: number } | { status: Exclude<HealthStatus, 'ok'> };

// Sessions edited after an earlier sync (a watch finishing its upload late) are
// read again within this window.
const RESYNC_MS = 7 * 24 * 60 * 60 * 1000;

let queue: Promise<unknown> = Promise.resolve();

/** Runs one at a time, so overlapping syncs can't import the same day twice. */
function serial<T>(task: () => Promise<T>) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

/** Whether the store is connected: access granted and not switched off here. */
export async function isHealthConnected() {
  if (!healthSupported || !provider) return false;
  const { enabled } = await getHealthSettings();
  return enabled && (await provider.availability()) === 'ok' && (await provider.hasAccess());
}

/**
 * Pulls weighings into the body weight log, walks, runs and other sessions
 * into the workout history, and daily steps and sleep for the dashboard. With `prompt`, asks for access when it's missing
 * and turns syncing back on; without it, quietly skips until connected.
 */
export function syncHealth({ prompt }: { prompt: boolean }) {
  return serial(async (): Promise<HealthSyncResult> => {
    if (!healthSupported || !provider) return { status: 'unavailable' };
    const settings = await getHealthSettings();
    if (!prompt && !settings.enabled) return { status: 'denied' };

    const availability = await provider.availability();
    if (availability !== 'ok') return { status: availability };
    // Asking again is quiet when access is already there, and also picks up data
    // types added to the request since the first grant.
    const access = prompt ? await provider.requestAccess() : await provider.hasAccess();
    if (!access) return { status: 'denied' };
    if (prompt) await setHealthEnabled(true);

    // A connect from the settings rereads everything, in case access widened since.
    const startedAt = Date.now();
    const since = new Date(prompt || !settings.syncedAt ? 0 : settings.syncedAt - RESYNC_MS);
    const readings = await provider.read(since);
    const weights = await importBodyWeights(readings.weights);
    const activities = await importActivities(readings.activities);
    importDailyHealth(readings.days);
    await setHealthSyncedAt(startedAt);
    return { status: 'ok', weights, activities };
  });
}

/** Stops syncing; already imported data stays. */
export function disconnectHealth() {
  return serial(async () => {
    await setHealthEnabled(false);
    await provider?.revokeAccess().catch(() => {});
  });
}
