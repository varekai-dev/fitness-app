import { useEffect, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { Text } from '@/components/ui';
import { formatDuration } from '@/lib/metrics';

/** Live "time since" counter, ticking every second. */
export function Elapsed({ since, style }: { since: number; style?: StyleProp<TextStyle> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text variant="caption" style={style}>
      {formatDuration(Math.max(0, now - since) / 1000)}
    </Text>
  );
}
