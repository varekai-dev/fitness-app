import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts from the previous value to `value` over `duration` ms, so a changed
 * number visibly rolls up (or down) instead of jumping. The first value shows
 * as is.
 */
export function useAnimatedNumber(value: number, duration = 700) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const next = from + (value - from) * easeOutCubic(t);
      current.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return display;
}
