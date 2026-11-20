import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { DEFAULT_DESIGN, readDesign, type DesignSettings } from './design-logic';

/**
 * Zuletzt benutzter Hintergrund (Profil → Design) auf diesem Gerät – damit schon das Intro mit
 * dem Lunaxora-Schriftzug ihn zeigt, bevor Konto und Profil geladen sind. Gratis: klassisch.
 */
const KEY = 'nexora.design.last';
let saved: DesignSettings = DEFAULT_DESIGN;
let raw = '';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

void AsyncStorage.getItem(KEY)
  .then((value) => {
    if (!value || raw) return; // inzwischen schon neu gesetzt
    raw = value;
    saved = readDesign(JSON.parse(value));
    notify();
  })
  .catch(() => {});

export function saveDesign(design: DesignSettings) {
  const next = JSON.stringify(design);
  if (next === raw) return;
  raw = next;
  saved = design;
  notify();
  void AsyncStorage.setItem(KEY, next).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSavedDesign(): DesignSettings {
  return useSyncExternalStore(subscribe, () => saved, () => saved);
}
