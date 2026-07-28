/**
 * Who you are, as far as this app is concerned: one name, kept in
 * localStorage. A two-line store rather than a context provider — every
 * component that cares subscribes directly.
 */

import { useSyncExternalStore } from 'react';
import { getStoredName, storeName } from '../net/session.ts';

let name = getStoredName();
const listeners = new Set<() => void>();

export function setName(next: string) {
  name = next.slice(0, 24);
  storeName(name);
  listeners.forEach((l) => l());
}

export function useName(): [string, (n: string) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => name,
  );
  return [value, setName];
}

/** Name to show when the field has been left blank. */
export const displayName = (n: string, fallback = 'You') => (n.trim() ? n.trim() : fallback);
