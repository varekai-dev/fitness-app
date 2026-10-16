import { useEffect } from 'react';
import { AppState } from 'react-native';

import { healthSupported, syncHealth } from '@/lib/health';

/**
 * Quietly imports new weighings and activities from Apple Health / Health
 * Connect when the app starts and each time it comes back to the foreground.
 * Never prompts: until the store is connected in the integration settings,
 * every attempt is a no-op.
 */
export function useHealthAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !healthSupported) return;
    const sync = () => syncHealth({ prompt: false }).catch(() => {});
    sync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [enabled]);
}
