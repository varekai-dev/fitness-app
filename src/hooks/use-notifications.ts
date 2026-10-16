import { router, type Href } from 'expo-router';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { notificationsSupported, onNotificationTap, syncWaterReminders } from '@/lib/notifications';

/** Tables whose changes can move a water reminder: the log itself and the goal/reminder settings. */
const WATCHED_TABLES = new Set(['water_intakes', 'settings']);

/**
 * Keeps scheduled reminders current and opens the screen a tapped notification
 * points to. Reminders are recomputed at launch, on every return to the
 * foreground (a new day may have started) and whenever water or settings change.
 */
export function useNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !notificationsSupported) return;

    // Deferred a tick, so the Stack that mounted in this same commit is ready to navigate.
    let stopTaps = () => {};
    const launch = setTimeout(() => {
      stopTaps = onNotificationTap((url) => {
        // Reminders lead to tabs; a plain navigate leaves screens stacked above them in place.
        if (router.canDismiss()) router.dismissAll();
        router.navigate(url as Href);
      });
    }, 0);

    syncWaterReminders();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncWaterReminders();
    });

    let pending = false;
    const dbSub = addDatabaseChangeListener(({ tableName }) => {
      if (!WATCHED_TABLES.has(tableName) || pending) return;
      // Coalesce a burst of row changes into one sync.
      pending = true;
      setTimeout(() => {
        pending = false;
        syncWaterReminders();
      }, 300);
    });

    return () => {
      clearTimeout(launch);
      stopTaps();
      appSub.remove();
      dbSub.remove();
    };
  }, [enabled]);
}
