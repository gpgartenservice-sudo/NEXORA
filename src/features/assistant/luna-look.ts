import { ACCENT_COLORS, rgbOf, toHex } from '../../constants/accent';

/**
 * Lunas Aussehen (Profil → Design): Hut und die Farben der Figur – reine Logik (ohne App,
 * mit Unit-Tests). Die Farbe ist die Akzentfarbe der App, der Hut steht unter design.luna.
 * Für alle Abos.
 */

export type LunaHat =
  | 'none'
  | 'party'
  | 'crown'
  | 'santa'
  | 'tophat'
  | 'witch'
  | 'cap'
  | 'beanie'
  | 'helmet'
  | 'grad'
  | 'bow'
  | 'flower';

/** Lunas Hut – ihre Farbe ist die Akzentfarbe der App (siehe constants/accent.ts) */
export type LunaLook = { hat: LunaHat };

export const LUNA_HATS: { key: LunaHat; title: string }[] = [
  { key: 'none', title: 'Ohne' },
  { key: 'party', title: 'Partyhut' },
  { key: 'crown', title: 'Krone' },
  { key: 'santa', title: 'Weihnachtsmütze' },
  { key: 'tophat', title: 'Zylinder' },
  { key: 'witch', title: 'Hexenhut' },
  { key: 'cap', title: 'Cap' },
  { key: 'beanie', title: 'Wollmütze' },
  { key: 'helmet', title: 'Bauhelm' },
  { key: 'grad', title: 'Doktorhut' },
  { key: 'bow', title: 'Schleife' },
  { key: 'flower', title: 'Blume' },
];

export const DEFAULT_LUNA: LunaLook = { hat: 'none' };

/** Schleife und Blume sitzen seitlich – die Antenne bleibt sichtbar */
export const hatHidesAntenna = (hat: LunaHat) => hat !== 'none' && hat !== 'bow' && hat !== 'flower';

const HATS = LUNA_HATS.map((h) => h.key);

/** Gespeichertes Aussehen lesen – unbekannte Hüte fallen auf „Ohne“ zurück */
export function readLunaLook(raw: unknown): LunaLook {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { hat: HATS.includes(r.hat as LunaHat) ? (r.hat as LunaHat) : DEFAULT_LUNA.hat };
}

export type LunaPalette = {
  /** Rand, Antenne, Punkte, Funken */
  accent: string;
  /** Körper-Verlauf hell → dunkel */
  body: [string, string, string];
  /** dieselbe Farbe mit Deckkraft (Leuchten, Schatten) */
  glow: (alpha: number) => string;
};

/** Farben für die Figur – der Körper ist eine dunkle Kugel in Lunas Farbe */
export function lunaPalette(hex: string): LunaPalette {
  const known = ACCENT_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  const [r, g, b] = rgbOf(known?.hex ?? hex);
  const scale = (f: number) => toHex([r * f, g * f, b * f]);
  return {
    accent: known?.hex ?? toHex([r, g, b]),
    body: known?.body ?? [scale(0.5), scale(0.17), scale(0.045)],
    glow: (alpha) => `rgba(${r},${g},${b},${alpha})`,
  };
}

/** Farbe abdunkeln (f < 1) bzw. aufhellen (f > 1) – z. B. Schirm der Cap */
export function shadeHex(hex: string, f: number): string {
  const [r, g, b] = rgbOf(hex);
  return f <= 1 ? toHex([r * f, g * f, b * f]) : toHex([r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)]);
}
