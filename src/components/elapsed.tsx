import { useEffect, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { Text } from '@/components/ui';
import { formatDuration, workoutDurationMs } from '@/lib/metrics';

type Timed = { startedAt: number; pausedAt: number | null; pausedMs: number };

/** Live workout clock that excludes paused time and stops ticking while paused. */
export function Elapsed({ workout, style }: { workout: Timed; style?: StyleProp<TextStyle> }) {
  const [now, setNow] = useState(() => Date.now());
  const paused = workout.pausedAt !== null;
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [paused]);
  return (
    <Text variant="caption" style={style}>
      {formatDuration(workoutDurationMs(workout, now) / 1000)}
    </Text>
  );
}
