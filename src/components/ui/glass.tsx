import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useContext, useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { RevealDone } from '@/components/motion/reveal';

/** Apples „Liquid Glass“ gibt es ab iOS 26 – sonst bleiben Flächen wie gehabt */
export const NATIVE_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

type Props = ViewProps & {
  /** Reagiert beim Antippen (leuchtet/federt wie bei Apple) */
  interactive?: boolean;
  /** Leichte Tönung des Glases */
  tint?: string;
};

/**
 * Glasfläche im Stil von Apple: auf dem iPhone echtes Liquid Glass,
 * im Browser/Mac verschwommenes Milchglas, sonst eine halbdurchsichtige Fläche.
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
  return <View style={[styles.fallback, Platform.OS === 'web' && WEB_BLUR, tint ? { backgroundColor: tint } : null, style]} {...rest} />;
}

/**
 * Glas als Hintergrund unter vorhandenem Inhalt (Karten, Eingabefeld, Knöpfe).
 * Nur mit echtem Liquid Glass – auf Mac/Android bleibt die Fläche, wie sie ist.
 * Die Fläche selbst bekommt dazu `glassSurface` (eigene Farbe und Rand weg).
 */
export function GlassBackdrop({ radius }: { radius: number }) {
  // Erst nach dem Einblenden einschalten (Reveal und kurze Einflug-Animationen):
  // unter halbdurchsichtigen Eltern zeichnet iOS das Glas sonst manchmal nicht
  const revealed = useContext(RevealDone);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
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
export const glassSurface: ViewStyle | null = NATIVE_GLASS
  ? { backgroundColor: 'transparent', borderColor: 'transparent' }
  : null;

const WEB_BLUR = {
  backgroundColor: 'rgba(28,28,30,0.62)',
  backdropFilter: 'blur(28px) saturate(170%)',
} as unknown as ViewStyle;

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: 'rgba(26,26,28,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    borderCurve: 'continuous',
  },
});
