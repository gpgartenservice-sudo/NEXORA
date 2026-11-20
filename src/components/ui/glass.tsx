import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useContext, useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { RevealDone } from '@/components/motion/reveal';

/** Apples „Liquid Glass“ gibt es ab iOS 26 – sonst bleiben Flächen wie gehabt */
export const NATIVE_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** Mac-App und Browser: Glas nachgebaut (Unschärfe, Lichtkante, leichter Schatten) */
export const WEB_GLASS = Platform.OS === 'web';

/** Irgendein Glas aktiv – für Stile, die auf Glas anders aussehen sollen */
export const HAS_GLASS = NATIVE_GLASS || WEB_GLASS;

type Props = ViewProps & {
  /** Reagiert beim Antippen (leuchtet/federt wie bei Apple) */
  interactive?: boolean;
  /** Leichte Tönung des Glases */
  tint?: string;
};

/**
 * Glasfläche im Stil von Apple: auf dem iPhone echtes Liquid Glass,
 * im Browser/Mac nachgebautes Glas, sonst eine halbdurchsichtige Fläche.
 * Rundung und Größe kommen über `style` (borderRadius formt auch das Glas).
 */
export function Glass({ interactive = false, tint, style, ...rest }: Props) {
  if (NATIVE_GLASS) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive={interactive}
        tintColor={tint}
        style={style}
        {...rest}
      />
    );
  }
  return <View style={[styles.fallback, WEB_GLASS && WEB_PANEL, tint ? { backgroundColor: tint } : null, style]} {...rest} />;
}

/**
 * Glas als Hintergrund unter vorhandenem Inhalt (Karten, Eingabefeld, Knöpfe).
 * iPhone: echtes Liquid Glass. Mac/Browser: nachgebautes Glas. Android: Fläche bleibt.
 * Die Fläche selbst bekommt dazu `glassSurface` (eigene Farbe und Rand weg).
 */
export function GlassBackdrop({ radius }: { radius: number }) {
  // Erst nach dem Einblenden einschalten (Reveal und kurze Einflug-Animationen):
  // unter halbdurchsichtigen Eltern zeichnet iOS das Glas sonst manchmal nicht
  const revealed = useContext(RevealDone);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!NATIVE_GLASS) return;
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  if (WEB_GLASS) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, WEB_LAYER, { borderRadius: radius }]} />;
  }
  if (!NATIVE_GLASS) return null;
  return (
    <GlassView
      pointerEvents="none"
      glassEffectStyle={revealed && settled ? GLASS_ON : 'none'}
      colorScheme="dark"
      style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
    />
  );
}

// länger als die Einflug-Animationen (FadeIn ~220–300 ms); das Glas materialisiert sich dann weich
const SETTLE_MS = 400;
const GLASS_ON = { style: 'regular', animate: true, animationDuration: 0.35 } as const;

/** Macht eine Fläche durchsichtig, damit das Glas darunter wirkt (Rand bleibt für gleiche Größe, nur unsichtbar) */
export const glassSurface: ViewStyle | null = HAS_GLASS ? { backgroundColor: 'transparent', borderColor: 'transparent' } : null;

/** Mauszeiger über einer Glasfläche: nur leicht aufhellen statt einer festen Farbe (nach dem Hover-Stil setzen) */
export const glassHover: ViewStyle | null = HAS_GLASS ? { backgroundColor: 'rgba(255,255,255,0.07)' } : null;

/*
 * Nachgebautes Liquid Glass für Mac/Browser (nur CSS, läuft in Electron/Chromium):
 * – Hintergrund verschwimmt und wird etwas kräftiger (backdrop-filter)
 * – heller Schimmer oben links, der nach unten ausläuft (Verlauf)
 * – feine Lichtkante oben und ein Hauch Rand rundum (innere Schatten)
 * – weicher Schatten nach unten, damit die Fläche schwebt
 */
const BLUR = 'blur(24px) saturate(185%) brightness(1.08)';
const SHINE =
  'linear-gradient(155deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.045) 38%, rgba(255,255,255,0.02) 62%, rgba(255,255,255,0.06) 100%)';
const EDGES =
  'inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.09)';

const WEB_LAYER = {
  backgroundColor: 'rgba(30,30,34,0.42)',
  backgroundImage: SHINE,
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  boxShadow: `${EDGES}, 0 10px 28px rgba(0,0,0,0.30)`,
} as unknown as ViewStyle;

/** Größere Glasflächen (Menü, schwebende Leisten) */
const WEB_PANEL = {
  backgroundColor: 'rgba(24,24,28,0.55)',
  backgroundImage: SHINE,
  backdropFilter: 'blur(30px) saturate(180%)',
  WebkitBackdropFilter: 'blur(30px) saturate(180%)',
  borderColor: 'rgba(255,255,255,0.14)',
  boxShadow: `${EDGES}, 0 18px 48px rgba(0,0,0,0.45)`,
} as unknown as ViewStyle;

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: 'rgba(26,26,28,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    borderCurve: 'continuous',
  },
});
