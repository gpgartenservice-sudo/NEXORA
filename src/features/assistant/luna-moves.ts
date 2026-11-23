/**
 * Lunas kleine Auftritte – reine Logik (die Animationen selbst stehen in nexy-avatar.tsx):
 * - welche Geste sie im Ruhezustand ab und zu macht (zwinkern, winken, Kopf schief legen,
 *   Pirouette, staunen) und wann die nächste kommt
 * - was ein Stupser auslöst: einmal = hüpft, doppelt = Pirouette, ganz oft hintereinander = schwindelig
 * Dazu: kichern (gedrückt halten), gähnen/strecken (einschlafen/aufwachen), begrüßen, jubeln.
 */

export type LunaGesture =
  | 'wink'
  | 'wave'
  | 'tilt'
  | 'twirl'
  | 'wow'
  | 'giggle'
  | 'dizzy'
  | 'yawn'
  | 'stretch'
  | 'greet'
  | 'cheer';

/** Gesten, die Luna von sich aus macht, wenn nichts los ist */
export type IdleGesture = Extract<LunaGesture, 'wink' | 'wave' | 'tilt' | 'twirl' | 'wow'>;

/** So lange dauert eine Geste (ms) */
export const GESTURE_MS: Record<LunaGesture, number> = {
  wink: 800,
  wave: 1700,
  tilt: 1800,
  twirl: 1050,
  wow: 1400,
  giggle: 1500,
  dizzy: 2600,
  yawn: 1900,
  stretch: 1500,
  greet: 2300,
  cheer: 2500,
};

// Zwinkern und Kopf schief legen öfter, die Pirouette seltener (sonst nutzt sie sich ab)
const IDLE: { gesture: IdleGesture; weight: number }[] = [
  { gesture: 'wink', weight: 3 },
  { gesture: 'tilt', weight: 3 },
  { gesture: 'wave', weight: 2 },
  { gesture: 'wow', weight: 2 },
  { gesture: 'twirl', weight: 1.5 },
];

/** Nächste Geste im Ruhezustand – nie zweimal dieselbe hintereinander */
export function pickIdleGesture(last: LunaGesture | null, rnd: () => number = Math.random): IdleGesture {
  const options = IDLE.filter((o) => o.gesture !== last);
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let r = rnd() * total;
  for (const o of options) {
    r -= o.weight;
    if (r < 0) return o.gesture;
  }
  return options[options.length - 1].gesture;
}

/** Pause bis zur nächsten Geste: die erste nach 6–10 s, danach alle 10–18 s */
export function idleDelay(first: boolean, rnd: () => number = Math.random): number {
  return Math.round(first ? 6000 + rnd() * 4000 : 10000 + rnd() * 8000);
}

/** Zwei Klicks so kurz hintereinander = Doppelklick */
export const DOUBLE_TAP_MS = 320;
/** So viele Stupser … */
export const DIZZY_TAPS = 6;
/** … in dieser Zeit machen Luna schwindelig */
export const DIZZY_WINDOW_MS = 2600;

export type TapKind = 'boop' | 'twirl' | 'dizzy';
export type TapState = { taps: number[]; lastTwirl: number };
export const NO_TAPS: TapState = { taps: [], lastTwirl: Number.NEGATIVE_INFINITY };

/**
 * Was ein Stupser auslöst. Doppelklick = Pirouette (wildes Draufklicken zählt nicht als
 * Doppelklick), ab dem 6. Stupser in kurzer Zeit wird ihr schwindelig – danach zählt es neu.
 */
export function nextTap(state: TapState, now: number): { kind: TapKind; state: TapState } {
  const taps = [...state.taps.filter((t) => now - t <= DIZZY_WINDOW_MS), now];
  if (taps.length >= DIZZY_TAPS) return { kind: 'dizzy', state: { taps: [], lastTwirl: state.lastTwirl } };
  const prev = taps.length >= 2 ? taps[taps.length - 2] : undefined;
  const before = taps.length >= 3 ? taps[taps.length - 3] : undefined;
  const pair =
    prev !== undefined &&
    now - prev <= DOUBLE_TAP_MS &&
    prev > state.lastTwirl &&
    (before === undefined || prev - before > DOUBLE_TAP_MS);
  if (pair) return { kind: 'twirl', state: { taps, lastTwirl: now } };
  return { kind: 'boop', state: { taps, lastTwirl: state.lastTwirl } };
}

/** Was Luna dabei sagt (Sprechblase der großen Figur) */
export const GESTURE_LINES: Partial<Record<LunaGesture, readonly string[]>> = {
  giggle: ['Hihihi!', 'Hihi, das kitzelt!', 'Hör auf, hihi!'],
  dizzy: ['Uiii … alles dreht sich!', 'Huiii, mir ist schwindelig!'],
  twirl: ['Tadaa!', 'Wuuusch!'],
  greet: ['Hallo!', 'Hi, schön, dass du da bist!'],
};

export function gestureLine(gesture: LunaGesture, rnd: () => number = Math.random): string | null {
  const lines = GESTURE_LINES[gesture];
  if (!lines?.length) return null;
  return lines[Math.min(lines.length - 1, Math.floor(rnd() * lines.length))];
}
