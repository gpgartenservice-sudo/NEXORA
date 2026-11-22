import type { PlannedNotification } from './notify-logic';

/**
 * Handy: echte Mitteilungen über expo-notifications (lokal geplant, kein Server nötig).
 * Fehlt das Modul in einer älteren App-Version, passiert einfach nichts.
 */
type Mod = typeof import('expo-notifications');
let N: Mod | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  N = require('expo-notifications') as Mod;
  N.setNotificationHandler({
    // Neue Team-Nachrichten mit Ton (wie ein Messenger), alles andere leise
    handleNotification: async (n) => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: (n.request.content.data as { kind?: unknown } | null)?.kind === 'team',
      shouldSetBadge: false,
    }),
  });
} catch {
  N = null;
}

export type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function permission(): Promise<Permission> {
  if (!N) return 'unsupported';
  try {
    const r = await N.getPermissionsAsync();
    return r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export async function requestPermission(): Promise<Permission> {
  if (!N) return 'unsupported';
  try {
    const r = await N.requestPermissionsAsync();
    return r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Alle geplanten Lunaxora-Mitteilungen durch die neue Liste ersetzen */
export async function schedule(list: PlannedNotification[]): Promise<void> {
  if (!N || (await permission()) !== 'granted') return;
  await N.cancelAllScheduledNotificationsAsync();
  for (const n of list) {
    await N.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: { kind: n.kind } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: n.at },
    });
  }
}

/** Zusatzangaben einer Mitteilung (z. B. welcher Chat) – kommen beim Antippen zurück */
export type NotifyData = Record<string, unknown>;

/** Sofort eine Mitteilung (Test, Angebot angenommen, neue Team-Nachricht …) */
export async function notifyNow(title: string, body: string, data?: NotifyData): Promise<boolean> {
  if (!N || (await permission()) !== 'granted') return false;
  await N.scheduleNotificationAsync({
    content: { title, body, ...(data ? { data } : {}), ...(data?.kind === 'team' ? { sound: 'default' } : {}) },
    trigger: null,
  });
  return true;
}

/** Antippen einer Mitteilung (auch einer, die die App selbst geschickt hat) */
export function onNotificationOpen(open: (data: NotifyData) => void): () => void {
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data && typeof data === 'object') open(data as NotifyData);
  });
  return () => sub.remove();
}

export const sendTest = notifyNow;
