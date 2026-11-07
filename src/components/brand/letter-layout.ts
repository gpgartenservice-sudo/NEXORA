// Automatisch erzeugt von tools/build-logo-letters.py – nicht von Hand ändern.
// Position und Breite jedes Buchstabens als Anteil an der Gesamtbreite des Schriftzugs.

export const WORDMARK_ASPECT_RATIO = 9.49133; // Breite / Höhe

export const LETTER_LAYOUT = [
  { key: 'L', x: 0.00000, width: 0.10658 },
  { key: 'U', x: 0.11145, width: 0.11815 },
  { key: 'N', x: 0.23569, width: 0.12485 },
  { key: 'A', x: 0.35810, width: 0.13520 },
  { key: 'X', x: 0.48782, width: 0.13155 },
  { key: 'O', x: 0.61023, width: 0.12667 },
  { key: 'R', x: 0.74239, width: 0.12058 },
  { key: 'A2', x: 0.85932, width: 0.14068 },
] as const;

export type LetterKey = (typeof LETTER_LAYOUT)[number]['key'];
