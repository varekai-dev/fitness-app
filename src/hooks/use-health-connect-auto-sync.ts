import { useEffect } from 'react';
import { AppState } from 'react-native';

import { healthConnectSupported, syncWeightFromHealthConnect } from '@/lib/health-connect';

/**
 * Quietly imports new weighings from Health Connect when the app starts and
 * each time it comes back to the foreground, so a scale reading shows up
 * everywhere without visiting the body weight screen. Never prompts: until
 * access is granted from that screen, every attempt is a no-op.
 */
export function useHealthConnectAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !healthConnectSupported) return;
    const sync = () => syncWeightFromHealthConnect({ prompt: false }).catch(() => {});
    sync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [enabled]);
}
