import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { fetchLatest, isNewer, type Update } from './updates';

/** Comprobación silenciosa de versiones nuevas, como mucho cada 6 horas mientras la app está abierta. */
const EVERY_MS = 6 * 60 * 60 * 1000;

let available: Update | null = null;
let lastCheck = 0;
const listeners = new Set<() => void>();

export async function checkForUpdateInBackground(): Promise<void> {
  if (Platform.OS !== 'android' || Date.now() - lastCheck < EVERY_MS) return;
  lastCheck = Date.now();
  try {
    const u = await fetchLatest();
    available = u && isNewer(u) ? u : null;
  } catch {
    lastCheck = 0; // sin conexión: se vuelve a intentar la próxima vez
    return;
  }
  listeners.forEach((l) => l());
}

/** Olvida el aviso (p. ej. cuando el usuario lo descarta). */
export function dismissUpdate(): void {
  available = null;
  listeners.forEach((l) => l());
}

export function useAvailableUpdate(): Update | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => available,
  );
}
