import { reloadAppAsync } from 'expo';
import { DevSettings } from 'react-native';

import { sqlite } from '@/db/client';

/**
 * Read synchronously from the settings table, for preferences resolved while
 * modules load. The table doesn't exist yet before the first migration.
 */
export function readSettingSync(key: string): string | null {
  try {
    return (
      sqlite.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)
        ?.value ?? null
    );
  } catch {
    return null;
  }
}

/** Saves a setting, or removes it with null to fall back to the default. */
export function writeSettingSync(key: string, value: string | null) {
  if (value === null) {
    sqlite.runSync('DELETE FROM settings WHERE key = ?', key);
  } else {
    sqlite.runSync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }
}

/** Restarts the JS so module-level labels and formatters pick up a changed preference. */
export async function reloadApp(reason: string) {
  // reloadAppAsync is a no-op in Expo Go; the dev reload works there and in dev builds.
  if (__DEV__) DevSettings.reload(reason);
  else await reloadAppAsync();
}
