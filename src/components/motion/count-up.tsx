import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Zahl, die weich zum neuen Wert hochzählt (z. B. Gewinn auf der Startseite).
 * `from` setzt einen neuen Startwert (z. B. 0 beim App-Start); `replay` startet neu.
 */
export function useCountUp(value: number, { duration = 1400, from, replay = 0 }: { duration?: number; from?: number; replay?: number } = {}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(from ?? value);
  const current = useRef(from ?? value);

  useEffect(() => {
    if (reduce) {
      current.current = value;
      return;
    }
    const start = replay && from !== undefined ? from : current.current;
    let frame = 0;
    if (start === value) {
      current.current = value;
      frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      // schnell los, sanft auslaufen
      const eased = 1 - Math.pow(1 - p, 4);
      const v = start + (value - start) * eased;
      current.current = v;
      setShown(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, replay, reduce]);

  return reduce ? value : shown;
}
