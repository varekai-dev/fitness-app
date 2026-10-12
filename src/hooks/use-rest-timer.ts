import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';

const restEndSound = require('@/assets/sounds/rest-end.wav');

/**
 * Countdown between sets. The end time is absolute, so the countdown stays correct
 * after the app was backgrounded. A chime and a haptic mark the end of the rest.
 */
export function useRestTimer() {
  const chime = useAudioPlayer(restEndSound);
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
        chime.seekTo(0);
        chime.play();
      }
    }, 250);
    return () => clearInterval(tick);
  }, [endAt, chime]);

  const start = (seconds: number, exerciseName: string) => {
    if (seconds <= 0) return;
    setNow(Date.now());
    setEndAt(Date.now() + seconds * 1000);
    setPausedLeft(null);
    setTotalSec(seconds);
    setLabel(exerciseName);
  };

  const extend = (seconds: number) => {
    if (pausedLeft !== null) {
      setPausedLeft(pausedLeft + seconds * 1000);
    } else if (endAt !== null) {
      setEndAt(endAt + seconds * 1000);
    } else return;
    setTotalSec((t) => t + seconds);
  };

  const pause = () => {
    if (endAt === null) return;
    setPausedLeft(Math.max(0, endAt - Date.now()));
    setEndAt(null);
  };

  const resume = () => {
    if (pausedLeft === null) return;
    setNow(Date.now());
    setEndAt(Date.now() + pausedLeft);
    setPausedLeft(null);
  };

  const stop = () => {
    setEndAt(null);
    setPausedLeft(null);
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
