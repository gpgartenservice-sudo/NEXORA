import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Dieses Gerät für „ein Gerät gleichzeitig“ (Skript 20261120090000_feinschliff.sql):
 * eine zufällige, dauerhafte Kennung pro Installation und ein lesbarer Name.
 */

const KEY = 'nexora.device-id';
let cached: string | null = null;

export async function deviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored && stored.length >= 8) {
      cached = stored;
      return stored;
    }
  } catch {
    // Speicher nicht verfügbar (z. B. privates Fenster) – dann eben neu
  }
  const id = randomUUID();
  cached = id;
  try {
    await AsyncStorage.setItem(KEY, id);
  } catch {
    // egal
  }
  return id;
}

export function deviceName(): string {
  if (Platform.OS === 'web') {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Electron/i.test(ua)) return 'Mac-App';
    if (/iPhone|iPad/i.test(ua)) return 'Browser auf dem iPhone';
    if (/Android/i.test(ua)) return 'Browser auf Android';
    return 'Browser';
  }
  return Device.deviceName || Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android-Handy');
}

/** Nach dem Anmelden: dieses Gerät wird das aktive (andere Geräte werden abgemeldet angezeigt). */
export async function claimThisDevice(): Promise<void> {
  try {
    const { error } = await supabase.rpc('device_claim', { p_device: await deviceId(), p_name: deviceName() });
    if (error && !['PGRST202', '42883'].includes(String(error.code))) console.warn('[Gerät]', error);
  } catch (e) {
    console.warn('[Gerät]', e);
  }
}

export type DeviceStatus = { active: boolean; limited: boolean; other?: string | null };

/** Darf dieses Gerät gerade? Fehlt das Skript oder ist das Netz weg: ja (nicht aussperren). */
export async function checkThisDevice(): Promise<DeviceStatus> {
  try {
    const { data, error } = await supabase.rpc('device_status', { p_device: await deviceId() });
    if (error || !data) return { active: true, limited: false };
    const r = data as Record<string, unknown>;
    return { active: r.active !== false, limited: r.limited === true, other: typeof r.other === 'string' ? r.other : null };
  } catch {
    return { active: true, limited: false };
  }
}
