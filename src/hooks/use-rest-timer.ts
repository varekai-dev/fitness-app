import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';

import { cancelRestEnd, scheduleRestEnd } from '@/lib/rest-notifications';

/**
 * Countdown between sets. The end time is absolute, so the countdown stays correct
 * after the app was backgrounded; a local notification covers the locked-screen case.
 */
export function useRestTimer() {
  const [endAt, setEndAt] = useState<number | null>(null);
  // Remaining ms while paused; endAt is null then.
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [totalSec, setTotalSec] = useState(0);
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
    setNow(Date.now());
    setEndAt(Date.now() + seconds * 1000);
    setPausedLeft(null);
    setTotalSec(seconds);
    setLabel(exerciseName);
    scheduleRestEnd(seconds, exerciseName);
  };

  const extend = (seconds: number) => {
    if (pausedLeft !== null) {
      setPausedLeft(pausedLeft + seconds * 1000);
    } else if (endAt !== null) {
      const end = endAt + seconds * 1000;
      setEndAt(end);
      scheduleRestEnd(Math.ceil((end - Date.now()) / 1000), label);
    } else return;
    setTotalSec((t) => t + seconds);
  };

  const pause = () => {
    if (endAt === null) return;
    setPausedLeft(Math.max(0, endAt - Date.now()));
    setEndAt(null);
    cancelRestEnd();
  };

  const resume = () => {
    if (pausedLeft === null) return;
    setNow(Date.now());
    setEndAt(Date.now() + pausedLeft);
    setPausedLeft(null);
    scheduleRestEnd(Math.ceil(pausedLeft / 1000), label);
  };

  const stop = () => {
    setEndAt(null);
    setPausedLeft(null);
    cancelRestEnd();
  };

  const leftMs = pausedLeft ?? (endAt === null ? 0 : Math.max(0, endAt - now));
  return {
    running: endAt !== null || pausedLeft !== null,
    remainingSec: Math.ceil(leftMs / 1000),
    totalSec,
    label,
    start,
    extend,
    pause,
    resume,
    stop,
  };
}
