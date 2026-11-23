import { File, Paths } from 'expo-file-system';

import { readTextTone, TEXT_TONES, type TextTone } from './text-tone';

/**
 * Graue Schrift auf dem Handy: wird beim Start sofort (synchron) gelesen, bevor die erste Seite
 * gezeichnet wird – wie die Akzentfarbe. Ein neues Design färbt die grauen Texte deshalb ab dem
 * nächsten Öffnen der App um. (Browser/Mac: text-tone-store.web.ts, dort sofort.)
 */
const file = () => new File(Paths.document, 'lunaxora-text-tone.txt');

function loadTextTone(): TextTone {
  try {
    const f = file();
    return readTextTone(f.exists ? f.textSync() : null);
  } catch {
    return 'classic';
  }
}

const START = TEXT_TONES[loadTextTone()];
export const TEXT_MUTED: string = START.muted;
export const TEXT_FAINT: string = START.faint;

/** Merken, ob gerade ein Design aktiv ist (DesignProvider) */
export function setTextTone(tone: TextTone): void {
  try {
    const f = file();
    if (f.exists && f.textSync().trim() === tone) return;
    if (!f.exists) f.create();
    void f.write(tone).catch(() => {});
  } catch {
    // nicht schlimm: dann bleibt es bis zum nächsten Versuch bei den alten Grautönen
  }
}

/** Feste Farbwerte für Animationen – auf dem Handy die vom Start */
export function useTextToneColors(): { muted: string; faint: string } {
  return START;
}
