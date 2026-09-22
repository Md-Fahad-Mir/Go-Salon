import { useCallback, useEffect, useState } from 'react';

/** Seconds-based countdown for OTP resend buttons. */
export function useCountdown(initialSeconds = 0) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const restart = useCallback((value: number) => setSeconds(value), []);

  return { seconds, running: seconds > 0, restart };
}
