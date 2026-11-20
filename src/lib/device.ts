import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { unregisterPush } from '@/features/notifications/push';

import { forgetAccount, switchToNextAccount } from './accounts';
import { supabase } from './supabase';

/**
 * Dieses Gerät für „ein Handy + ein Computer gleichzeitig“ (Skripte 20261120090000_feinschliff.sql
 * und 20261124090000_zwei_geraete.sql): eine zufällige, dauerhafte Kennung pro Installation,
 * ein lesbarer Name und die Art (Handy oder Computer).
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

export type DeviceKind = 'phone' | 'computer';

/** Handy (iPhone/Android, auch Handy-Browser) oder Computer (Mac-App, Browser am Computer) */
export function deviceKind(): DeviceKind {
  if (Platform.OS !== 'web') return 'phone';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /iPhone|iPad|Android/i.test(ua) ? 'phone' : 'computer';
}

/** „iPhone“ bzw. „Mac“ – so heißen die beiden Plätze in Hinweisen */
export const KIND_LABEL: Record<DeviceKind, string> = { phone: 'iPhone', computer: 'Mac' };

/** Nach dem Anmelden: dieses Gerät eintragen (klappt nur, wenn sein Platz frei ist – sonst zeigt die Sperre den Hinweis). */
export async function claimThisDevice(): Promise<void> {
  try {
    const { error } = await supabase.rpc('device_claim', {
      p_device: await deviceId(),
      p_name: deviceName(),
      p_kind: deviceKind(),
    });
    if (error && !['PGRST202', '42883'].includes(String(error.code))) console.warn('[Gerät]', error);
  } catch (e) {
    console.warn('[Gerät]', e);
  }
}

/** Vor dem Abmelden: Platz dieses Geräts freigeben, damit sich ein anderes Gerät anmelden kann */
export async function releaseThisDevice(): Promise<void> {
  try {
    const { error } = await supabase.rpc('device_release', { p_device: await deviceId() });
    if (error && !['PGRST202', '42883'].includes(String(error.code))) console.warn('[Gerät]', error);
  } catch (e) {
    console.warn('[Gerät]', e);
  }
}

/**
 * Abmelden auf diesem Gerät: erst den Platz freigeben, dann nur hier abmelden (das andere Gerät
 * bleibt angemeldet). Ist hier noch ein weiteres Konto angemeldet, geht es mit dem weiter.
 */
export async function signOutHere(): Promise<'switched' | 'signed-out'> {
  await releaseThisDevice();
  // keine Push-Mitteilungen mehr für dieses Konto auf dieses Gerät
  await unregisterPush();
  const { data } = await supabase.auth.getSession();
  const current = data.session;
  if (current) await forgetAccount(current.user.id);
  if (await switchToNextAccount(current?.user.id)) {
    // die alte Sitzung beim Server beenden (nur diese – andere Geräte bleiben angemeldet)
    if (current) await supabase.auth.admin.signOut(current.access_token, 'local').catch(() => null);
    return 'switched';
  }
  await supabase.auth.signOut({ scope: 'local' });
  return 'signed-out';
}

export type AccountDevice = { kind: DeviceKind; name: string | null; seen: string | null; mine: boolean };

export type DeviceStatus = {
  active: boolean;
  limited: boolean;
  /** Name des Geräts, das den Platz belegt (wenn dieses gesperrt ist) */
  other?: string | null;
  otherKind?: DeviceKind;
  /** angemeldete Geräte des Kontos (höchstens ein Handy und ein Computer) */
  devices: AccountDevice[];
};

const OPEN: DeviceStatus = { active: true, limited: false, devices: [] };

/** Antwort von device_status lesen (fehlerhafte Einträge auslassen) */
export function parseDeviceStatus(raw: unknown): DeviceStatus {
  if (!raw || typeof raw !== 'object') return OPEN;
  const r = raw as Record<string, unknown>;
  const kind = (v: unknown): DeviceKind | null => (v === 'phone' || v === 'computer' ? v : null);
  const devices = (Array.isArray(r.devices) ? r.devices : []).flatMap((d): AccountDevice[] => {
    const x = (d ?? {}) as Record<string, unknown>;
    const k = kind(x.kind);
    if (!k) return [];
    return [
      {
        kind: k,
        name: typeof x.name === 'string' ? x.name : null,
        seen: typeof x.seen === 'string' ? x.seen : null,
        mine: x.mine === true,
      },
    ];
  });
  return {
    active: r.active !== false,
    limited: r.limited === true,
    other: typeof r.other === 'string' ? r.other : null,
    otherKind: kind(r.other_kind) ?? undefined,
    devices,
  };
}

/** Darf dieses Gerät gerade? Fehlt das Skript oder ist das Netz weg: ja (nicht aussperren). */
export async function checkThisDevice(): Promise<DeviceStatus> {
  try {
    const { data, error } = await supabase.rpc('device_status', {
      p_device: await deviceId(),
      p_kind: deviceKind(),
      p_name: deviceName(),
    });
    if (error || !data) return OPEN;
    return parseDeviceStatus(data);
  } catch {
    return OPEN;
  }
}
