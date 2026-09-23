/* What the browser provides and Node does not.

   Only localStorage. The store's `persist` middleware calls
   `createJSONStorage(() => localStorage)` when the module is first imported,
   and zustand swallows the resulting ReferenceError and quietly disables
   persistence — so without this the persistence tests would pass by testing
   nothing at all. */

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

globalThis.localStorage = new MemoryStorage();

beforeEach(() => {
  localStorage.clear();
});
