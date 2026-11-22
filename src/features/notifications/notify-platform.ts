import type { PlannedNotification } from './notify-logic';

/**
 * Mac-App und Browser: Mitteilungen über die Web-Notification-API (in der Mac-App
 * erscheinen sie in der macOS-Mitteilungszentrale). Geplant wird nur, solange Lunaxora
 * offen ist – für die nächsten 24 Stunden.
 */
export type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function permission(): Promise<Permission> {
  if (!supported()) return 'unsupported';
  const p = Notification.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
}

export async function requestPermission(): Promise<Permission> {
  if (!supported()) return 'unsupported';
  try {
    const p = await Notification.requestPermission();
    return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

let timers: ReturnType<typeof setTimeout>[] = [];
const DAY = 24 * 60 * 60_000;

/** Zusatzangaben einer Mitteilung (z. B. welcher Chat) – kommen beim Antippen zurück */
export type NotifyData = Record<string, unknown>;
const openers = new Set<(data: NotifyData) => void>();

/** Klick auf eine Mitteilung: Fenster nach vorn holen und die passende Stelle öffnen */
export function onNotificationOpen(open: (data: NotifyData) => void): () => void {
  openers.add(open);
  return () => {
    openers.delete(open);
  };
}

function show(title: string, body: string, data?: NotifyData) {
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', silent: false });
    n.onclick = () => {
      // Mac-App: auch ein ausgeblendetes Fenster wieder zeigen
      void window.nexoraDesktop?.showWindow?.();
      window.focus();
      n.close();
      if (data) openers.forEach((fn) => fn(data));
    };
  } catch {
    // z. B. Browser ohne Erlaubnis
  }
}

export async function schedule(list: PlannedNotification[]): Promise<void> {
  timers.forEach(clearTimeout);
  timers = [];
  if ((await permission()) !== 'granted') return;
  const now = Date.now();
  for (const n of list) {
    const ms = n.at.getTime() - now;
    if (ms <= 0 || ms > DAY) continue;
    timers.push(setTimeout(() => show(n.title, n.body), ms));
  }
}

/** Sofort eine Mitteilung (z. B. Angebot angenommen, neue Team-Nachricht) */
export async function notifyNow(title: string, body: string, data?: NotifyData): Promise<boolean> {
  if ((await permission()) !== 'granted') return false;
  show(title, body, data);
  return true;
}

export const sendTest = notifyNow;
