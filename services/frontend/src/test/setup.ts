/* What the browser provides and Node does not.

   Only localStorage, and only when it is genuinely missing. The store's
   `persist` middleware calls `createJSONStorage(() => localStorage)` when the
   module is first imported, and zustand swallows the resulting ReferenceError
   and quietly disables persistence — so under the `node` project, without
   this, the persistence tests would pass by testing nothing at all.

   Under the `dom` project jsdom supplies the real thing, and the guard below
   is load-bearing rather than tidy: vitest installs each window key on
   `globalThis` behind an accessor whose setter writes through to the window,
   and jsdom defines `localStorage` as a getter-only property. Assigning over
   it throws `Cannot set property localStorage of [object Window] which has
   only a getter`, which takes down the whole setup file and with it every
   test in the run — the existing ones included. */

import { beforeEach } from 'vitest';

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

if (!('localStorage' in globalThis)) {
  globalThis.localStorage = new MemoryStorage();
}

beforeEach(() => {
  localStorage.clear();
});
