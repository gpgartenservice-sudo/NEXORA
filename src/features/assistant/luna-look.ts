import { ACCENT_COLORS, rgbOf, toHex } from '../../constants/accent';

/**
 * Lunas Aussehen (Profil → Design): Hut, Brille, etwas am Hals, Kleidung und die Farben der
 * Figur – reine Logik (ohne App, mit Unit-Tests). Die Farbe ist die Akzentfarbe der App, der
 * Rest steht unter design.luna. Fertige Sets setzen alles auf einmal. Für alle Abos.
 */

export type LunaHat =
  | 'none'
  | 'party'
  | 'crown'
  | 'santa'
  | 'tophat'
  | 'fedora'
  | 'witch'
  | 'cap'
  | 'beanie'
  | 'beret'
  | 'helmet'
  | 'grad'
  | 'bow'
  | 'flower';

export type LunaGlasses = 'none' | 'round' | 'nerd' | 'sun' | 'heart' | 'star' | 'monocle';

/** Am Hals: Fliege, Krawatte, Schal … */
export type LunaNeck = 'none' | 'bowtie' | 'tie' | 'scarf' | 'pearls' | 'medal' | 'lei';

/** Kleidung auf dem unteren Teil der Kugel */
export type LunaOutfit = 'none' | 'suit' | 'hoodie' | 'vest' | 'sweater' | 'robe' | 'cape';

export type LunaLook = { hat: LunaHat; glasses: LunaGlasses; neck: LunaNeck; outfit: LunaOutfit };

type Option<K> = { key: K; title: string };

export const LUNA_HATS: Option<LunaHat>[] = [
  { key: 'none', title: 'Ohne' },
  { key: 'party', title: 'Partyhut' },
  { key: 'crown', title: 'Krone' },
  { key: 'santa', title: 'Weihnachtsmütze' },
  { key: 'tophat', title: 'Zylinder' },
  { key: 'fedora', title: 'Fedora' },
  { key: 'witch', title: 'Hexenhut' },
  { key: 'cap', title: 'Cap' },
  { key: 'beanie', title: 'Wollmütze' },
  { key: 'beret', title: 'Baskenmütze' },
  { key: 'helmet', title: 'Bauhelm' },
  { key: 'grad', title: 'Doktorhut' },
  { key: 'bow', title: 'Schleife' },
  { key: 'flower', title: 'Blume' },
];

export const LUNA_GLASSES: Option<LunaGlasses>[] = [
  { key: 'none', title: 'Ohne' },
  { key: 'round', title: 'Rundbrille' },
  { key: 'nerd', title: 'Hornbrille' },
  { key: 'sun', title: 'Sonnenbrille' },
  { key: 'heart', title: 'Herzbrille' },
  { key: 'star', title: 'Sternbrille' },
  { key: 'monocle', title: 'Monokel' },
];

export const LUNA_NECK: Option<LunaNeck>[] = [
  { key: 'none', title: 'Ohne' },
  { key: 'bowtie', title: 'Fliege' },
  { key: 'tie', title: 'Krawatte' },
  { key: 'scarf', title: 'Schal' },
  { key: 'pearls', title: 'Perlenkette' },
  { key: 'medal', title: 'Medaille' },
  { key: 'lei', title: 'Blumenkette' },
];

export const LUNA_OUTFITS: Option<LunaOutfit>[] = [
  { key: 'none', title: 'Ohne' },
  { key: 'suit', title: 'Anzug' },
  { key: 'hoodie', title: 'Hoodie' },
  { key: 'vest', title: 'Warnweste' },
  { key: 'sweater', title: 'Weihnachtspulli' },
  { key: 'robe', title: 'Talar' },
  { key: 'cape', title: 'Königsmantel' },
];

export const DEFAULT_LUNA: LunaLook = { hat: 'none', glasses: 'none', neck: 'none', outfit: 'none' };

export type LunaSet = { key: string; title: string; look: LunaLook };

const set = (key: string, title: string, look: Partial<LunaLook>): LunaSet => ({
  key,
  title,
  look: { ...DEFAULT_LUNA, ...look },
});

/** Fertige Sets – setzen Hut, Brille, Hals und Kleidung auf einmal (danach frei änderbar) */
export const LUNA_SETS: LunaSet[] = [
  set('plain', 'Nur Luna', {}),
  set('gentleman', 'Gentleman', { hat: 'tophat', glasses: 'monocle', neck: 'bowtie', outfit: 'suit' }),
  set('boss', 'Chefin', { glasses: 'nerd', neck: 'tie', outfit: 'suit' }),
  set('agent', 'Agentin', { hat: 'fedora', glasses: 'sun', neck: 'tie', outfit: 'suit' }),
  set('site', 'Baustelle', { hat: 'helmet', outfit: 'vest' }),
  set('street', 'Streetstyle', { hat: 'cap', glasses: 'sun', outfit: 'hoodie' }),
  set('winter', 'Winter', { hat: 'beanie', neck: 'scarf', outfit: 'hoodie' }),
  set('xmas', 'Weihnachten', { hat: 'santa', glasses: 'round', outfit: 'sweater' }),
  set('party', 'Party', { hat: 'party', glasses: 'star', neck: 'bowtie' }),
  set('grad', 'Abschluss', { hat: 'grad', glasses: 'round', neck: 'medal', outfit: 'robe' }),
  set('queen', 'Königin', { hat: 'crown', neck: 'pearls', outfit: 'cape' }),
  set('holiday', 'Urlaub', { hat: 'flower', glasses: 'sun', neck: 'lei' }),
  set('artist', 'Künstlerin', { hat: 'beret', glasses: 'round', neck: 'scarf' }),
];

/** Schleife und Blume sitzen seitlich – die Antenne bleibt sichtbar */
export const hatHidesAntenna = (hat: LunaHat) => hat !== 'none' && hat !== 'bow' && hat !== 'flower';

const keys = <K>(list: Option<K>[]) => list.map((o) => o.key);
const HATS = keys(LUNA_HATS);
const GLASSES = keys(LUNA_GLASSES);
const NECK = keys(LUNA_NECK);
const OUTFITS = keys(LUNA_OUTFITS);

const pick = <K extends string>(value: unknown, allowed: K[], fallback: K): K =>
  allowed.includes(value as K) ? (value as K) : fallback;

/** Gespeichertes Aussehen lesen – unbekannte oder fehlende Teile fallen auf „Ohne“ zurück */
export function readLunaLook(raw: unknown): LunaLook {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    hat: pick(r.hat, HATS, DEFAULT_LUNA.hat),
    glasses: pick(r.glasses, GLASSES, DEFAULT_LUNA.glasses),
    neck: pick(r.neck, NECK, DEFAULT_LUNA.neck),
    outfit: pick(r.outfit, OUTFITS, DEFAULT_LUNA.outfit),
  };
}

/** So wird gespeichert (profiles.design.luna) */
export const lunaLookToJson = (l: LunaLook) => ({ hat: l.hat, glasses: l.glasses, neck: l.neck, outfit: l.outfit });

export const sameLook = (a: LunaLook, b: LunaLook) =>
  a.hat === b.hat && a.glasses === b.glasses && a.neck === b.neck && a.outfit === b.outfit;

/** Welches Set Luna gerade trägt (genau so) – sonst null */
export const activeSet = (look: LunaLook) => LUNA_SETS.find((s) => sameLook(s.look, look))?.key ?? null;

/** Kurze Beschreibung zum Vorlesen, z. B. „Zylinder, Monokel, Fliege, Anzug“ (leer = nichts an) */
export function describeLook(look: LunaLook): string {
  const title = <K>(list: Option<K>[], key: K) => (key === 'none' ? null : list.find((o) => o.key === key)?.title);
  return [
    title(LUNA_HATS, look.hat),
    title(LUNA_GLASSES, look.glasses),
    title(LUNA_NECK, look.neck),
    title(LUNA_OUTFITS, look.outfit),
  ]
    .filter(Boolean)
    .join(', ');
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
