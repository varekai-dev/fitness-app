import { inArray } from 'drizzle-orm';

import { db } from './client';
import { settings } from './schema';

const KEYS = {
  // '0' once the user disconnects; absent before the first connect, so access
  // granted by an earlier version (weight sync on the body weight screen) keeps syncing.
  enabled: 'health_sync_enabled',
  syncedAt: 'health_synced_at',
} as const;

export type HealthSettings = { enabled: boolean; syncedAt: number | null };

export async function getHealthSettings(): Promise<HealthSettings> {
  const rows = await db.query.settings.findMany({
    where: inArray(settings.key, Object.values(KEYS)),
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  const syncedAt = Number(value(KEYS.syncedAt));
  return {
    enabled: value(KEYS.enabled) !== '0',
    syncedAt: Number.isFinite(syncedAt) && syncedAt > 0 ? syncedAt : null,
  };
}

async function write(key: string, value: string) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export const setHealthEnabled = (enabled: boolean) => write(KEYS.enabled, enabled ? '1' : '0');

export const setHealthSyncedAt = (at: number) => write(KEYS.syncedAt, String(at));
