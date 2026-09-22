import { useCallback, useState } from 'react';
import type { GeoPoint } from '../types';
import { DEFAULT_LOCATION } from '../constants';

export type GeoStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unsupported';

/** Wraps navigator.geolocation with a Dhaka fallback so distances always
    render, even before the user answers the permission prompt. */
export function useGeolocation(fallback: GeoPoint = DEFAULT_LOCATION) {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [point, setPoint] = useState<GeoPoint>(fallback);
  const [error, setError] = useState<string | undefined>();

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('locating');
    setError(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus('granted');
      },
      (err) => {
        setStatus('denied');
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was turned off. Using Dhanmondi for now.'
            : 'Could not get a fix. Using Dhanmondi for now.',
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  /** Forgets a granted or failed fix, so the status line goes back to the
      unasked hint — used when an area chip is picked instead. */
  const reset = useCallback(() => {
    setStatus('idle');
    setError(undefined);
  }, []);

  return { status, point, error, locate, reset };
}
