import '@/global.css';

/**
 * NEXORA – Farben & Abstände.
 *
 * Die Marke ist bewusst schwarz-weiß. Eine Akzentfarbe ist noch nicht
 * festgelegt – sobald sie steht, kommt sie hier als `accent` dazu.
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
  buttonPrimary: '#FFFFFF',
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
