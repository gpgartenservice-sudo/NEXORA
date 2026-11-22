/**
 * Akzentfarbe der App (Profil → Design): Hauptbuttons, Haken, Auswahl, aktiver Bereich –
 * und Lunas Farbe. Reine Logik ohne App-Abhängigkeiten (mit Unit-Tests).
 * Grün ist die Lunaxora-Farbe; alle Farben sind hell genug für schwarze Schrift darauf.
 */

export type AccentColor = {
  hex: string;
  name: string;
  /** Verlauf von Lunas Körper (hell → dunkel); sonst aus der Farbe berechnet */
  body?: [string, string, string];
};

export const DEFAULT_ACCENT = '#2FE39A';

export const ACCENT_COLORS: AccentColor[] = [
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

const findAccent = (hex: string) => ACCENT_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());

/** Gespeicherte Farbe lesen – nur bekannte Farben, sonst Grün */
export function readAccent(raw: unknown): string {
  return typeof raw === 'string' ? (findAccent(raw.trim())?.hex ?? DEFAULT_ACCENT) : DEFAULT_ACCENT;
}

export const accentName = (hex: string) => findAccent(hex)?.name ?? '';

export function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) as [number, number, number];
}

export function toHex(rgb: number[]): string {
  return `#${rgb
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

/** Farbe mit Deckkraft, z. B. für Rahmen und Leuchten */
export function rgbaOf(hex: string, alpha: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
