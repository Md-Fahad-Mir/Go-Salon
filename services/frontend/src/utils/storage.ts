/* Persistence helpers.
   - `safeLocal` wraps localStorage so private mode / quota errors never crash.
   - `photoStore` keeps try-on photos in IndexedDB as Blobs; localStorage is
     far too small for images. Falls back to an in-memory map when IndexedDB
     is unavailable (some private modes), so the flow still works for the
     session. */

export const safeLocal = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or private mode: ignore */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const DB_NAME = 'eureka-photos';
const STORE = 'photos';
const memory = new Map<string, Blob>();

const openDb = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> => {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(undefined);
    }
  });
};

export const photoStore = {
  async put(key: string, blob: Blob): Promise<void> {
    memory.set(key, blob);
    await withStore('readwrite', (store) => store.put(blob, key));
  },
  async get(key: string): Promise<Blob | undefined> {
    const cached = memory.get(key);
    if (cached) return cached;
    const blob = await withStore<Blob>('readonly', (store) => store.get(key));
    if (blob) memory.set(key, blob);
    return blob ?? undefined;
  },
  async remove(key: string): Promise<void> {
    memory.delete(key);
    await withStore('readwrite', (store) => store.delete(key));
  },
  async clear(): Promise<void> {
    memory.clear();
    await withStore('readwrite', (store) => store.clear());
  },
};
