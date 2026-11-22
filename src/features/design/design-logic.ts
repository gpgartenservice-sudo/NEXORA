/**
 * Design-Einstellungen (Pro/Business, Profil → Design) – reine Logik ohne Oberfläche.
 *
 * Zwei Ebenen, frei kombinierbar:
 * 1. Hintergrund: klassisch schwarz, eine Farbe oder ein eigener Farbverlauf
 * 2. Symbole darüber: Geld (💵), Blitze, Mondnacht, Raketen …
 *
 * 3. Akzentfarbe der App (= Lunas Farbe) und Lunas Hut – für alle, auch ohne Pro.
 *
 * Gespeichert in profiles.design (jsonb). Alte Einstellungen (nur `background`)
 * werden beim Lesen übernommen.
 */

import { DEFAULT_LUNA, lunaLookToJson, readLunaLook, type LunaLook } from '../assistant/luna-look';
import { DEFAULT_ACCENT, readAccent } from '../../constants/accent';

export type BaseMode = 'classic' | 'color' | 'gradient';
export type GradientDirection = 'down' | 'diagonal' | 'right' | 'up';
export type Strength = 'soft' | 'medium' | 'strong';
export type Density = 'few' | 'normal' | 'many';
export type IconKey =
  | 'none'
  | 'money'
  | 'lightning'
  | 'stars'
  | 'sparkles'
  | 'rockets'
  | 'fire'
  | 'leaves'
  | 'confetti'
  | 'diamonds'
  | 'hearts';

export type DesignSettings = {
  base: BaseMode;
  /** Farbe bei base = 'color' (#RRGGBB) */
  color: string;
  /** 2–3 Farben bei base = 'gradient' */
  gradient: string[];
  direction: GradientDirection;
  /** Verlauf wandert langsam (Lichter statt fester Verlauf) */
  moving: boolean;
  /** Wie kräftig Farbe/Verlauf durchscheinen – Text bleibt immer lesbar */
  strength: Strength;
  icons: IconKey;
  density: Density;
  /** Akzentfarbe der App und Lunas Farbe – für alle Abos (zählt nicht als Pro-Design) */
  accent: string;
  /** Lunas Hut, Brille, Hals und Kleidung – für alle Abos */
  luna: LunaLook;
};

/** Auswahl an Farben (kräftig – die App dunkelt sie je nach Stärke ab) */
export const SWATCHES: { hex: string; name: string }[] = [
  { hex: '#2FE39A', name: 'Lunaxora-Grün' },
  { hex: '#0EA5A4', name: 'Petrol' },
  { hex: '#3B82F6', name: 'Blau' },
  { hex: '#1E3A8A', name: 'Nachtblau' },
  { hex: '#8B5CF6', name: 'Lila' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#EF4444', name: 'Rot' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EAB308', name: 'Gold' },
  { hex: '#84CC16', name: 'Limette' },
  { hex: '#16A34A', name: 'Waldgrün' },
  { hex: '#94A3B8', name: 'Silber' },
];

/** Fertige Verläufe als Startpunkt – danach lässt sich jede Farbe ändern */
export const GRADIENT_PRESETS: { key: string; title: string; colors: string[] }[] = [
  { key: 'lunaxora', title: 'Lunaxora', colors: ['#2FE39A', '#3B82F6', '#0EA5A4'] },
  { key: 'business', title: 'Business', colors: ['#3B82F6', '#8B5CF6', '#2FE39A'] },
  { key: 'sunset', title: 'Sonnenuntergang', colors: ['#F97316', '#EC4899', '#8B5CF6'] },
  { key: 'ocean', title: 'Ozean', colors: ['#0EA5A4', '#1E3A8A'] },
  { key: 'forest', title: 'Wald', colors: ['#84CC16', '#16A34A', '#0EA5A4'] },
  { key: 'fire', title: 'Glut', colors: ['#EAB308', '#EF4444'] },
];

export const DIRECTIONS: { value: GradientDirection; label: string; name: string }[] = [
  { value: 'down', label: '↓', name: 'Von oben nach unten' },
  { value: 'diagonal', label: '↘', name: 'Schräg' },
  { value: 'right', label: '→', name: 'Von links nach rechts' },
  { value: 'up', label: '↗', name: 'Schräg nach oben' },
];

/** Start- und Endpunkt des Verlaufs (0..1) */
export function directionVector(d: GradientDirection): { x1: number; y1: number; x2: number; y2: number } {
  switch (d) {
    case 'down':
      return { x1: 0, y1: 0, x2: 0, y2: 1 };
    case 'right':
      return { x1: 0, y1: 0, x2: 1, y2: 0 };
    case 'up':
      return { x1: 0, y1: 1, x2: 1, y2: 0 };
    default:
      return { x1: 0, y1: 0, x2: 1, y2: 1 };
  }
}

export type IconOption = { key: IconKey; title: string; emoji: string; text: string };

export const ICON_OPTIONS: IconOption[] = [
  { key: 'none', title: 'Keine', emoji: '', text: 'Nur der Hintergrund.' },
  { key: 'money', title: 'Geld', emoji: '💵', text: 'Dollarscheine schweben durchs Bild.' },
  { key: 'lightning', title: 'Blitze', emoji: '⚡', text: 'Ab und zu zuckt ein Blitz.' },
  { key: 'stars', title: 'Mondnacht', emoji: '🌙', text: 'Funkelnde Sterne und Lunas Mond.' },
  { key: 'sparkles', title: 'Funkeln', emoji: '✨', text: 'Glitzer, der kurz aufleuchtet.' },
  { key: 'rockets', title: 'Raketen', emoji: '🚀', text: 'Dein Business hebt ab.' },
  { key: 'fire', title: 'Feuer', emoji: '🔥', text: 'Flammen steigen langsam auf.' },
  { key: 'leaves', title: 'Blätter', emoji: '🍃', text: 'Blätter wehen sanft herunter.' },
  { key: 'confetti', title: 'Konfetti', emoji: '🎉', text: 'Für jeden Tag ein kleines Fest.' },
  { key: 'diamonds', title: 'Diamanten', emoji: '💎', text: 'Funkelnde Edelsteine.' },
  { key: 'hearts', title: 'Herzen', emoji: '💚', text: 'Grüne Herzen steigen auf.' },
];

/** Wie sich die Symbole bewegen */
export type IconMotion = 'fall' | 'rise' | 'twinkle' | 'flash' | 'night';

export function iconMotion(key: IconKey): IconMotion | null {
  switch (key) {
    case 'money':
    case 'leaves':
    case 'confetti':
      return 'fall';
    case 'rockets':
    case 'fire':
    case 'hearts':
      return 'rise';
    case 'sparkles':
    case 'diamonds':
      return 'twinkle';
    case 'lightning':
      return 'flash';
    case 'stars':
      return 'night';
    default:
      return null;
  }
}

/** Anzahl der Symbole je nach Menge (Grundzahl = „Normal“) */
export function iconCount(base: number, density: Density): number {
  const factor = density === 'few' ? 0.55 : density === 'many' ? 1.7 : 1;
  return Math.max(3, Math.round(base * factor));
}

/** Deckkraft der Farbe über Schwarz – auch „Kräftig“ lässt weißen Text gut lesbar */
export function strengthOpacity(strength: Strength, moving = false): number {
  if (moving) return strength === 'soft' ? 0.24 : strength === 'strong' ? 0.55 : 0.36;
  return strength === 'soft' ? 0.22 : strength === 'strong' ? 0.55 : 0.36;
}

export const DEFAULT_DESIGN: DesignSettings = {
  base: 'classic',
  color: '#3B82F6',
  gradient: ['#2FE39A', '#3B82F6', '#0EA5A4'],
  direction: 'diagonal',
  moving: false,
  strength: 'medium',
  icons: 'none',
  density: 'normal',
  accent: DEFAULT_ACCENT,
  luna: DEFAULT_LUNA,
};

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** Eingabe wie „3b82f6“, „#3B82F6“ oder „#38f“ → „#3B82F6“ (sonst null) */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const m = input.trim().match(HEX);
  if (!m) return null;
  const raw = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${raw.toUpperCase()}`;
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const BASES: BaseMode[] = ['classic', 'color', 'gradient'];
const DIRS: GradientDirection[] = ['down', 'diagonal', 'right', 'up'];
const STRENGTHS: Strength[] = ['soft', 'medium', 'strong'];
const DENSITIES: Density[] = ['few', 'normal', 'many'];
const ICONS = ICON_OPTIONS.map((o) => o.key);

/** Gespeicherte Einstellungen lesen – unbekannte Werte fallen auf den Standard zurück */
export function readDesign(raw: unknown): DesignSettings {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: DesignSettings = { ...DEFAULT_DESIGN, gradient: [...DEFAULT_DESIGN.gradient] };

  // alte Einstellung (nur ein Hintergrund zur Auswahl)
  switch (d.background) {
    case 'aurora':
      Object.assign(out, { base: 'gradient', gradient: [...GRADIENT_PRESETS[0].colors], moving: true });
      break;
    case 'business':
      Object.assign(out, { base: 'gradient', gradient: [...GRADIENT_PRESETS[1].colors], moving: true });
      break;
    case 'money':
    case 'lightning':
    case 'stars':
      out.icons = d.background;
      break;
  }

  if (d.base !== undefined) out.base = pick(d.base, BASES, out.base);
  out.color = normalizeHex(d.color) ?? out.color;
  if (Array.isArray(d.gradient)) {
    const colors = d.gradient.map(normalizeHex).filter((c): c is string => !!c).slice(0, 3);
    if (colors.length >= 2) out.gradient = colors;
  }
  out.direction = pick(d.direction, DIRS, out.direction);
  if (typeof d.moving === 'boolean') out.moving = d.moving;
  out.strength = pick(d.strength, STRENGTHS, out.strength);
  if (d.icons !== undefined) out.icons = pick(d.icons, ICONS, out.icons);
  out.density = pick(d.density, DENSITIES, out.density);
  // kurz gab es nur „Lunas Farbe“ (design.luna.color) – die gilt jetzt als Akzentfarbe
  const oldLuna = d.luna && typeof d.luna === 'object' ? (d.luna as Record<string, unknown>) : {};
  out.accent = readAccent(d.accent ?? oldLuna.color);
  out.luna = readLunaLook(d.luna);
  return out;
}

/** So wird gespeichert (ohne die alte Einstellung) */
export function designToJson(s: DesignSettings): Record<string, unknown> {
  return {
    base: s.base,
    color: s.color,
    gradient: s.gradient,
    direction: s.direction,
    moving: s.moving,
    strength: s.strength,
    icons: s.icons,
    density: s.density,
    accent: s.accent,
    luna: lunaLookToJson(s.luna),
  };
}

/** Zeigt die App überhaupt etwas hinter den Seiten? */
export function designActive(s: DesignSettings): boolean {
  return s.base !== 'classic' || s.icons !== 'none';
}

/** Ist das alles noch kostenlos? (Gratis: nur klassisch ohne Symbole) */
export const isFreeDesign = (s: DesignSettings) => !designActive(s);

export function sameDesign(a: DesignSettings, b: DesignSettings): boolean {
  return JSON.stringify(designToJson(a)) === JSON.stringify(designToJson(b));
}
