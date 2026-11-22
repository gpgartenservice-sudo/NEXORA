import { readAccent } from './accent';

/**
 * Akzentfarbe im Browser und in der Mac-App merken (localStorage, sofort lesbar).
 * „Übernehmen“ lädt die Seite neu – dann gilt die Farbe überall.
 */
const KEY = 'lunaxora.accent';

export function loadAccent(): string {
  try {
    return readAccent(globalThis.localStorage?.getItem(KEY));
  } catch {
    return readAccent(null);
  }
}

export function storeAccent(hex: string): void {
  try {
    if (globalThis.localStorage?.getItem(KEY) !== hex) globalThis.localStorage?.setItem(KEY, hex);
  } catch {
    // privates Fenster o. Ä.: dann bleibt es bei Grün
  }
}

export const canApplyAccentNow = true;
export function applyAccentNow(): void {
  globalThis.location?.reload();
}
