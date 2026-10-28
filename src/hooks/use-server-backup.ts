import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { uploadBackupIfDue } from '@/lib/server-backup';

/**
 * Uploads a backup to the account on the server once a day: checked when the
 * app starts and each time it comes back to the foreground. Data only changes
 * while the app is open, so a day without opening it needs no new copy.
 */
export function useServerBackup(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const run = () => uploadBackupIfDue().catch(() => {});
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [enabled]);
}
