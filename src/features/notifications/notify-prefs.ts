import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_PREFS, type NotifyKind, type NotifyPrefs } from './notify-logic';

/** Welche Benachrichtigungen dieses Gerät bekommt (pro Gerät gespeichert) */
const KEY = 'nexora.notify-prefs';
const listeners = new Set<(p: NotifyPrefs) => void>();
let cache: NotifyPrefs | null = null;

export async function loadNotifyPrefs(): Promise<NotifyPrefs> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = { ...DEFAULT_PREFS, ...(raw ? (JSON.parse(raw) as Partial<NotifyPrefs>) : {}) };
  } catch {
    cache = { ...DEFAULT_PREFS };
  }
  return cache;
}

export function useNotifyPrefs() {
  const [prefs, setPrefs] = useState<NotifyPrefs>(cache ?? DEFAULT_PREFS);
  useEffect(() => {
    void loadNotifyPrefs().then(setPrefs);
    listeners.add(setPrefs);
    return () => {
      listeners.delete(setPrefs);
    };
  }, []);
  const set = useCallback(async (key: NotifyKind, value: boolean) => {
    const next = { ...(await loadNotifyPrefs()), [key]: value };
    cache = next;
    listeners.forEach((l) => l(next));
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // egal – gilt dann bis zum Neustart
    }
  }, []);
  return { prefs, set };
}
