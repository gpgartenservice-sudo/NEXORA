/**
 * Lunas Aussehen (Profil → Design → Luna): Farbe und Hut – reine Logik (ohne App, mit Unit-Tests).
 * Gespeichert im Profil unter design.luna, für alle Abos.
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

export type LunaLook = { color: string; hat: LunaHat };

export type LunaColor = {
  hex: string;
  name: string;
  /** Verlauf des Körpers (hell → dunkel); sonst aus der Farbe berechnet */
  body?: [string, string, string];
};

/** Lunas Farben – Grün ist die Lunaxora-Farbe */
export const LUNA_COLORS: LunaColor[] = [
  { hex: '#2FE39A', name: 'Lunaxora-Grün', body: ['#23775A', '#0D261C', '#050A08'] },
  { hex: '#2DD4BF', name: 'Türkis' },
  { hex: '#4FB3FF', name: 'Himmelblau' },
  { hex: '#A78BFA', name: 'Lila' },
  { hex: '#FF7AB6', name: 'Pink' },
  { hex: '#FF5A5F', name: 'Rot' },
  { hex: '#FF9F45', name: 'Orange' },
  { hex: '#FBBF24', name: 'Gold' },
  { hex: '#D4D8E0', name: 'Mondsilber' },
];

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

export const DEFAULT_LUNA: LunaLook = { color: '#2FE39A', hat: 'none' };

/** Schleife und Blume sitzen seitlich – die Antenne bleibt sichtbar */
export const hatHidesAntenna = (hat: LunaHat) => hat !== 'none' && hat !== 'bow' && hat !== 'flower';

const HATS = LUNA_HATS.map((h) => h.key);

/** Gespeichertes Aussehen lesen – Unbekanntes fällt auf den Standard zurück */
export function readLunaLook(raw: unknown): LunaLook {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const wanted = typeof r.color === 'string' ? r.color.toLowerCase() : null;
  const color = LUNA_COLORS.find((c) => c.hex.toLowerCase() === wanted)?.hex;
  const hat = HATS.includes(r.hat as LunaHat) ? (r.hat as LunaHat) : DEFAULT_LUNA.hat;
  return { color: color ?? DEFAULT_LUNA.color, hat };
}

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) as [number, number, number];
}

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

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
  const known = LUNA_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
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
