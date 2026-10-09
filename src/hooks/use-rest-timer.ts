import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';

import { cancelRestEnd, scheduleRestEnd } from '@/lib/rest-notifications';

/**
 * Countdown between sets. The end time is absolute, so the countdown stays correct
 * after the app was backgrounded; a local notification covers the locked-screen case.
 */
export function useRestTimer() {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endAt === null) return;
    const tick = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt) {
        setEndAt(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [endAt]);

  // Never leave a stale notification behind when the workout screen closes.
  useEffect(() => () => void cancelRestEnd(), []);

  const start = (seconds: number, exerciseName: string) => {
    if (seconds <= 0) return;
    const end = Date.now() + seconds * 1000;
    setNow(Date.now());
    setEndAt(end);
    setLabel(exerciseName);
    scheduleRestEnd(seconds, exerciseName);
  };

  const extend = (seconds: number) => {
    if (endAt === null) return;
    const end = endAt + seconds * 1000;
    setEndAt(end);
    scheduleRestEnd(Math.ceil((end - Date.now()) / 1000), label);
  };

  const stop = () => {
    setEndAt(null);
    cancelRestEnd();
  };

  const remainingSec = endAt === null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000));
  return { running: endAt !== null, remainingSec, label, start, extend, stop };
}
