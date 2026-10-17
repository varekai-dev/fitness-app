import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncHomeWidget } from '@/db/home-widget';

/** Coalesces bursts of writes (a set of edits, a restore) into one widget update. */
const DEBOUNCE_MS = 500;

/**
 * Keeps the Android home screen widgets current: on start, after every database
 * change and when the app comes back to the foreground (the day may have changed).
 */
export function useHomeWidgetSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => syncHomeWidget().catch(() => {}), DEBOUNCE_MS);
    };
    sync();
    const db = addDatabaseChangeListener(sync);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      clearTimeout(timer);
      db.remove();
      app.remove();
    };
  }, [enabled]);
}
