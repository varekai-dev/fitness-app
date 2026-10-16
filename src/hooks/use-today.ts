import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { addDays, startOfDay } from '@/lib/water';

/**
 * Local midnight of the current day, updated when the day rolls over.
 *
 * Pass it to `useDbQuery` deps so "today" screens reset at midnight even when
 * the app stays open. Timers don't fire while the app is suspended, so the day
 * is also rechecked whenever the app comes back to the foreground.
 */
export function useToday() {
  const [today, setToday] = useState(() => startOfDay(Date.now()));

  useEffect(() => {
    const check = () => setToday(startOfDay(Date.now()));
    // A tick past midnight, so `startOfDay` lands on the new day.
    const timer = setTimeout(check, addDays(today, 1) - Date.now() + 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);

  return today;
}
