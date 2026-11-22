import '@/global.css';
import { Platform } from 'react-native';

import { rgbaOf, rgbOf } from './accent';
import { loadAccent } from './accent-store';

/** Akzentfarbe (Profil → Design) – beim Start gelesen, gilt für die ganze App */
export const ACCENT = loadAccent();
const [AR, AG, AB] = rgbOf(ACCENT);

/** Akzentfarbe mit Deckkraft (Rahmen, Leuchten) – geht auch in Animationen */
export function accentAlpha(alpha: number): string {
  'worklet';
  return `rgba(${AR},${AG},${AB},${alpha})`;
}

/**
 * Lunaxora – Farben & Abstände.
 *
 * Logo und Grundlook sind schwarz-weiß. Die Akzentfarbe (Standard "Wachstums-Grün",
 * wählbar in Profil → Design) kommt nur dort zum Einsatz, wo etwas passiert: Hauptbuttons,
 * Fortschritt, Haken, Auswahl, Erfolgsmeldungen, aktiver Bereich in der Navigation.
 */
export const Colors = {
  background: '#000000',
  surface: '#0E0E0F',
  surfaceRaised: '#151517',
  border: '#232326',
  borderFocus: '#5A5A60',
  text: '#FFFFFF',
  textMuted: '#8E8E93',
  textFaint: '#55555A',
  danger: '#FF6B6B',
  /** Akzentfarbe (Standard Wachstums-Grün, Kontrast auf Schwarz 12.6:1) */
  accent: ACCENT,
  /** Schrift auf Flächen in der Akzentfarbe */
  onAccent: '#000000',
  accentGlow: rgbaOf(ACCENT, 0.45),
  accentSoft: rgbaOf(ACCENT, 0.12),
  buttonPrimary: ACCENT,
  buttonPrimaryText: '#000000',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  md: 12,
  lg: 16,
} as const;

/** Schrift mit fester Breite (iOS kennt „monospace“ nicht → Menlo) */
export const MonoFont = Platform.select({ ios: 'Menlo', default: 'monospace' });
