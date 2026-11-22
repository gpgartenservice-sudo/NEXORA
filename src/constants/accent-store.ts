import { File, Paths } from 'expo-file-system';

import { readAccent } from './accent';

/**
 * Akzentfarbe auf dem Handy merken. Wird beim Start sofort (synchron) gelesen, bevor die
 * erste Seite gezeichnet wird – eine neue Farbe gilt deshalb ab dem nächsten Öffnen der App.
 */
const file = () => new File(Paths.document, 'lunaxora-accent.txt');

export function loadAccent(): string {
  try {
    const f = file();
    return f.exists ? readAccent(f.textSync()) : readAccent(null);
  } catch {
    return readAccent(null);
  }
}

export function storeAccent(hex: string): void {
  try {
    const f = file();
    if (f.exists && f.textSync().trim() === hex) return;
    if (!f.exists) f.create();
    void f.write(hex).catch(() => {});
  } catch {
    // nicht schlimm: dann bleibt es bis zum nächsten Versuch bei der alten Farbe
  }
}

/** Auf dem Handy lässt sich die App nicht selbst neu starten */
export const canApplyAccentNow = false;
export function applyAccentNow(): void {}
