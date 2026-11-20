import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

import { SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from './nav-items';

/**
 * Mac (breites Fenster): Seitenleiste ein- und ausklappen. Eingeklappt bleibt eine schmale
 * Leiste mit den Symbolen. Wird pro Gerät gemerkt.
 */
export const SIDEBAR_COLLAPSED_WIDTH = 76;

const KEY = 'nexora.sidebar-collapsed';
let collapsed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

void AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === '1' && !collapsed) {
      collapsed = true;
      notify();
    }
  })
  .catch(() => {});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSidebarCollapsed(next: boolean) {
  if (next === collapsed) return;
  collapsed = next;
  notify();
  void AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, () => collapsed, () => collapsed);
}

/** Breite der Seitenleiste – 0 am Handy, schmal wenn eingeklappt */
export function useSidebarWidth(): number {
  const { width } = useWindowDimensions();
  const c = useSidebarCollapsed();
  if (width < SIDEBAR_BREAKPOINT) return 0;
  return c ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
}
