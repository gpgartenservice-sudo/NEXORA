/**
 * Push-Mitteilungen vom Server gibt es nur auf dem iPhone (push.native.ts). Mac und Browser
 * melden Antworten auf Angebote selbst, solange Lunaxora offen ist (offer-reply-watcher.tsx).
 */
export async function registerPush(): Promise<boolean> {
  return false;
}

export async function unregisterPush(): Promise<void> {}

/** Läuft Push auf diesem Gerät? */
export function pushActive(): Promise<boolean> {
  return Promise.resolve(false);
}

/** Tippen auf eine Push-Mitteilung */
export function onPushOpen(_open: (data: Record<string, unknown>) => void): () => void {
  return () => {};
}
