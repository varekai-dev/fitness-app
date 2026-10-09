import { useEffect, useState } from 'react';

import { Text } from '@/components/ui';
import { formatDuration } from '@/lib/metrics';

/** Live "time since" counter, ticking every second. */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text variant="caption">{formatDuration(Math.max(0, now - since) / 1000)}</Text>;
}
