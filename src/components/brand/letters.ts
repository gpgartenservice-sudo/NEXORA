import { LETTER_LAYOUT, WORDMARK_ASPECT_RATIO, type LetterKey } from './letter-layout';

/** Die einzelnen Buchstaben des Schriftzugs (aus tools/build-logo-letters.py). */
export const LETTER_IMAGES: Record<LetterKey, number> = {
  L: require('@/assets/images/logo/letter-l.png'),
  U: require('@/assets/images/logo/letter-u.png'),
  N: require('@/assets/images/logo/letter-n.png'),
  A: require('@/assets/images/logo/letter-a.png'),
  X: require('@/assets/images/logo/letter-x.png'),
  O: require('@/assets/images/logo/letter-o.png'),
  R: require('@/assets/images/logo/letter-r.png'),
  A2: require('@/assets/images/logo/letter-a2.png'),
};

export type LetterFrame = { key: LetterKey; left: number; width: number };

/** Höhe des Schriftzugs bei gegebener Breite. */
export function wordmarkHeight(width: number): number {
  return width / WORDMARK_ASPECT_RATIO;
}

/** Position und Breite jedes Buchstabens in Punkten für eine Schriftzug-Breite. */
export function letterFrames(width: number): LetterFrame[] {
  return LETTER_LAYOUT.map((l) => ({ key: l.key, left: l.x * width, width: l.width * width }));
}

export { LETTER_LAYOUT, WORDMARK_ASPECT_RATIO };
export type { LetterKey };
