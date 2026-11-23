import { useSyncExternalStore } from 'react';

import { TEXT_TONES, type TextTone } from './text-tone';

/**
 * Graue Schrift im Browser und in der Mac-App: CSS-Variablen. Ein neues Design (Profil → Design)
 * färbt alle grauen Texte und Symbole sofort um – ohne Neuladen. Ohne Variable gilt klassisch.
 */
export const TEXT_MUTED = `var(--lx-text-muted, ${TEXT_TONES.classic.muted})`;
export const TEXT_FAINT = `var(--lx-text-faint, ${TEXT_TONES.classic.faint})`;

let current: TextTone = 'classic';
const listeners = new Set<() => void>();

/** Gerade aktives Design übernehmen (DesignProvider) */
export function setTextTone(tone: TextTone): void {
  if (tone === current) return;
  current = tone;
  try {
    const style = globalThis.document?.documentElement?.style;
    style?.setProperty('--lx-text-muted', TEXT_TONES[tone].muted);
    style?.setProperty('--lx-text-faint', TEXT_TONES[tone].faint);
  } catch {
    // ohne Seite (z. B. beim Vorab-Rendern): klassisch
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Feste Farbwerte für Animationen (interpolateColor kennt keine CSS-Variablen) */
export function useTextToneColors(): { muted: string; faint: string } {
  return TEXT_TONES[useSyncExternalStore(subscribe, () => current, () => current)];
}
