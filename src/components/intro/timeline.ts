/**
 * Ablauf der Start-Animation – alle Zeiten in Millisekunden.
 *
 * Die ganze Animation hängt an EINER Zeitleiste (t läuft von 0 bis TOTAL).
 * Jedes Element berechnet seinen Zustand nur aus t. Dadurch lässt sich der
 * Ablauf hier zentral feinjustieren, und "Überspringen" ist nur ein Sprung
 * der Zeitleiste.
 *
 *   0      schwarzer Bildschirm
 *   N_IN   das N erscheint in der Mitte
 *   N_SLIDE das N gleitet nach links an seinen Platz im Schriftzug
 *   DROP   E, X, O, R, A fallen nacheinander von oben an ihren Platz
 *   IMPACT der letzte Buchstabe landet – kurzer Ruck + Lichtblitz
 *   EXIT   der Schriftzug fliegt nach oben an seinen Platz im Anmelde-Screen
 */
export const T = {
  N_IN_START: 300,
  N_IN_END: 1200,
  N_SLIDE_START: 1550,
  N_SLIDE_END: 2400,
  DROP_START: 1850,
  DROP_STAGGER: 130,
  DROP_DURATION: 520,
  HOLD_AFTER_IMPACT: 1100,
  EXIT_DURATION: 1000,
} as const;

/** Anzahl der fallenden Buchstaben (E, X, O, R, A). */
export const FALLING_LETTERS = 5;

export const IMPACT = T.DROP_START + (FALLING_LETTERS - 1) * T.DROP_STAGGER + T.DROP_DURATION;
export const EXIT_START = IMPACT + T.HOLD_AFTER_IMPACT;
export const TOTAL = EXIT_START + T.EXIT_DURATION;

export function dropStart(index: number): number {
  'worklet';
  return T.DROP_START + index * T.DROP_STAGGER;
}

export function landing(index: number): number {
  'worklet';
  return dropStart(index) + T.DROP_DURATION;
}

// ---------------------------------------------------------------------------
// Kleine Rechenhelfer (laufen als Worklets direkt im Animations-Thread)
// ---------------------------------------------------------------------------

export function clamp01(x: number): number {
  'worklet';
  return Math.min(1, Math.max(0, x));
}

/** 0 vor `start`, 1 nach `end`, linear dazwischen. */
export function progress(t: number, start: number, end: number): number {
  'worklet';
  return clamp01((t - start) / (end - start));
}

export function easeOutCubic(x: number): number {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}

export function easeInOutCubic(x: number): number {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Beschleunigt wie ein fallender Gegenstand. */
export function easeInFall(x: number): number {
  'worklet';
  return Math.pow(x, 2.2);
}

/** Gedämpfte Schwingung nach einem Aufprall (startet bei `amplitude`, klingt auf 0 ab). */
export function damped(dt: number, amplitude: number, decayMs: number, periodMs: number): number {
  'worklet';
  if (dt < 0) return 0;
  return amplitude * Math.exp(-dt / decayMs) * Math.cos((dt / periodMs) * Math.PI * 2);
}
