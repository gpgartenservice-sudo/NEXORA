/**
 * Graue Schrift (Colors.textMuted / textFaint) passend zum Hintergrund.
 *
 * Klassisch (schwarzer Hintergrund): die gewohnten Grautöne.
 * Mit Design (Farbe, Farbverlauf oder Motive aus Profil → Design): durchscheinendes Weiß –
 * es nimmt den Farbton des Hintergrunds an und bleibt auf Blau, Lila, Grün … gut lesbar.
 * Feste Grautöne wären dort kaum zu sehen.
 */
export type TextTone = 'classic' | 'design';

export const TEXT_TONES: Record<TextTone, { muted: string; faint: string }> = {
  classic: { muted: '#8E8E93', faint: '#55555A' },
  design: { muted: 'rgba(255,255,255,0.76)', faint: 'rgba(255,255,255,0.55)' },
};

/** Gespeicherten Wert lesen – alles Unbekannte ist klassisch */
export const readTextTone = (raw: string | null | undefined): TextTone => (raw?.trim() === 'design' ? 'design' : 'classic');
