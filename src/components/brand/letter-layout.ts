// Automatisch erzeugt von tools/build-logo-letters.py – nicht von Hand ändern.
// Position und Breite jedes Buchstabens als Anteil an der Gesamtbreite des Schriftzugs.

export const WORDMARK_ASPECT_RATIO = 8.35468; // Breite / Höhe

export const LETTER_LAYOUT = [
  { key: 'N', x: 0.00000, width: 0.17040 },
  { key: 'E', x: 0.18278, width: 0.14741 },
  { key: 'X', x: 0.33432, width: 0.17866 },
  { key: 'O', x: 0.51061, width: 0.16274 },
  { key: 'R', x: 0.68219, width: 0.14446 },
  { key: 'A', x: 0.82017, width: 0.17983 },
] as const;

export type LetterKey = (typeof LETTER_LAYOUT)[number]['key'];
