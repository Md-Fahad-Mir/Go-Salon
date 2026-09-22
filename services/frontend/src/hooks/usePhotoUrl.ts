import { useEffect, useState } from 'react';
import { photoStore } from '../utils/storage';

interface Loaded {
  key: string;
  url: string | null;
}

/** Loads a stored photo as an object URL and revokes it on unmount / change.
    `loading` is true until the blob for the *current* key has been read. */
export function usePhotoUrl(key: string | null | undefined): {
  url: string | null;
  loading: boolean;
  missing: boolean;
} {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!key) return;
    let active = true;
    let objectUrl: string | null = null;
    photoStore.get(key).then((blob) => {
      if (!active) return;
      objectUrl = blob ? URL.createObjectURL(blob) : null;
      setLoaded({ key, url: objectUrl });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  if (!key) return { url: null, loading: false, missing: false };
  const ready = loaded?.key === key;
  return { url: ready ? loaded.url : null, loading: !ready, missing: ready && loaded.url === null };
}
