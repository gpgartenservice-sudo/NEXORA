import { useEffect, useState } from 'react';

/** Countdown in Sekunden, z. B. bis ein Code erneut angefordert werden darf. */
export function useCooldown(initialSeconds = 0) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return { seconds, start: (s: number) => setSeconds(s), active: seconds > 0 };
}
