import { Image } from 'expo-image';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Banknote } from '@/components/motion/money-burst';
import { BUSINESS_GRADIENT } from '@/components/ui/gradient';

/**
 * Design-Einstellungen (Pro/Business, Profil → Design): bewegte Hintergründe hinter
 * allen Seiten. Gespeichert im Profil (design.background).
 */
export type BackgroundKey = 'none' | 'aurora' | 'business' | 'money' | 'lightning' | 'stars';

export const BACKGROUNDS: { key: BackgroundKey; title: string; text: string }[] = [
  { key: 'none', title: 'Klassisch', text: 'Schlichtes Schwarz – wie gewohnt.' },
  { key: 'aurora', title: 'Farbverlauf', text: 'Grüne und blaue Lichter, die langsam wandern.' },
  { key: 'business', title: 'Business-Verlauf', text: 'Blau, Lila und Grün – die Farben von Business.' },
  { key: 'money', title: 'Geldregen', text: 'Geldscheine, die sanft durchs Bild schweben.' },
  { key: 'lightning', title: 'Blitze', text: 'Ab und zu zuckt ein Blitz – volle Energie.' },
  { key: 'stars', title: 'Mondnacht', text: 'Funkelnde Sterne und Lunas Mond.' },
];

export const isBackgroundKey = (v: unknown): v is BackgroundKey => BACKGROUNDS.some((b) => b.key === v);

const DesignCtx = createContext<BackgroundKey>('none');

/** Liefert allen Seiten den gewählten Hintergrund (Gratis: immer klassisch). */
export function DesignProvider({ background, children }: { background: BackgroundKey; children: ReactNode }) {
  return <DesignCtx.Provider value={background}>{children}</DesignCtx.Provider>;
}

export const useBackground = () => useContext(DesignCtx);

/** Hintergrund-Ebene (liegt hinter dem Inhalt, fängt keine Klicks) */
export function AppBackdrop({ kind }: { kind?: BackgroundKey }) {
  const ctx = useBackground();
  const k = kind ?? ctx;
  if (k === 'none') return null;
  return (
    <View pointerEvents="none" style={styles.layer}>
      {k === 'aurora' && <Aurora colors={['#2FE39A', '#3B82F6', '#0EA5A4']} />}
      {k === 'business' && <Aurora colors={BUSINESS_GRADIENT} />}
      {k === 'money' && <MoneyDrift />}
      {k === 'lightning' && <Lightning />}
      {k === 'stars' && <Stars />}
    </View>
  );
}

const GLOW = require('@/assets/images/glow.png');

/** Feste Pseudo-Zufallszahl 0..1 (rein, damit sich nichts bei jedem Rendern verschiebt) */
function rand(i: number, k: number): number {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function Blob({ color, size, x, y, dx, dy, duration, delay }: { color: string; size: number; x: number; y: number; dx: number; dy: number; duration: number; delay: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [t, duration, delay, reduce]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x + dx * t.get() }, { translateY: y + dy * t.get() }, { scale: 1 + 0.15 * t.get() }],
  }));
  return (
    <Animated.View style={[styles.blob, { width: size, height: size }, style]}>
      <Image source={GLOW} style={StyleSheet.absoluteFill} contentFit="fill" tintColor={color} />
    </Animated.View>
  );
}

function Aurora({ colors }: { colors: readonly string[] }) {
  const { width, height } = useWindowDimensions();
  const s = Math.max(width, height) * 0.9;
  return (
    <View style={[StyleSheet.absoluteFill, styles.dim]}>
      <Blob color={colors[0]} size={s} x={-s * 0.35} y={-s * 0.4} dx={width * 0.25} dy={height * 0.15} duration={14000} delay={0} />
      <Blob color={colors[1]} size={s} x={width - s * 0.6} y={height * 0.2} dx={-width * 0.3} dy={-height * 0.1} duration={17000} delay={600} />
      <Blob color={colors[2] ?? colors[0]} size={s * 0.8} x={width * 0.1} y={height - s * 0.5} dx={width * 0.2} dy={-height * 0.2} duration={20000} delay={1200} />
    </View>
  );
}

function FallingNote({ x, delay, duration, height, scale, sway }: { x: number; delay: number; duration: number; height: number; scale: number; sway: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 0.5 : 0);
  useEffect(() => {
    if (reduce) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1)));
  }, [t, delay, duration, reduce]);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    return {
      transform: [
        { translateX: x + Math.sin(p * Math.PI * 4) * sway },
        { translateY: -80 + (height + 160) * p },
        { rotate: `${Math.sin(p * Math.PI * 3) * 35}deg` },
        { scaleX: scale * (0.4 + 0.6 * Math.abs(Math.cos(p * Math.PI * 5))) },
        { scaleY: scale },
      ],
    };
  });
  return (
    <Animated.View style={[styles.note, style]}>
      <Banknote />
    </Animated.View>
  );
}

function MoneyDrift() {
  const { width, height } = useWindowDimensions();
  const notes = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: (width / 14) * i + rand(i, 1) * 40,
        delay: rand(i, 2) * 12000,
        duration: 11000 + rand(i, 3) * 9000,
        scale: 0.55 + rand(i, 4) * 0.5,
        sway: 20 + rand(i, 5) * 40,
      })),
    [width],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.faint]}>
      {notes.map((n, i) => (
        <FallingNote key={i} {...n} height={height} />
      ))}
    </View>
  );
}

function Bolt({ width, height, seed }: { width: number; height: number; seed: number }) {
  const reduce = useReducedMotion();
  const flash = useSharedValue(0);
  const [pos, setPos] = useState(() => ({ x: Math.random() * width, flip: Math.random() > 0.5 }));
  useEffect(() => {
    if (reduce) return;
    let timer: ReturnType<typeof setTimeout>;
    const strike = () => {
      setPos({ x: Math.random() * (width - 120) + 20, flip: Math.random() > 0.5 });
      flash.set(
        withSequence(
          withTiming(1, { duration: 60 }),
          withTiming(0.2, { duration: 80 }),
          withTiming(0.9, { duration: 60 }),
          withTiming(0, { duration: 500 }),
        ),
      );
      timer = setTimeout(strike, 3500 + Math.random() * 5000);
    };
    timer = setTimeout(strike, 1200 + seed * 2300);
    return () => clearTimeout(timer);
  }, [flash, width, seed, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const h = height * 0.55;
  return (
    <Animated.View style={[styles.bolt, { left: pos.x, height: h, transform: [{ scaleX: pos.flip ? -1 : 1 }] }, style]}>
      <Svg width={110} height={h} viewBox="0 0 110 300" preserveAspectRatio="none">
        <Path d="M62 0 L28 120 L58 120 L18 300 L92 98 L60 98 L84 0 Z" fill="rgba(170,200,255,0.18)" />
        <Path d="M64 6 L36 118 L62 118 L30 280 L86 104 L56 104 L78 6 Z" fill="none" stroke="#CFE0FF" strokeWidth="3" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

function Lightning() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill}>
      <Bolt width={width} height={height} seed={0} />
      <Bolt width={width} height={height} seed={1} />
    </View>
  );
}

function Star({ x, y, r, delay }: { x: number; y: number; r: number; delay: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0.4);
  useEffect(() => {
    if (reduce) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration: 1600 + delay % 1400, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [t, delay, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: 0.15 + 0.75 * t.get(), transform: [{ scale: 0.7 + 0.5 * t.get() }] }));
  return <Animated.View style={[styles.star, { left: x, top: y, width: r * 2, height: r * 2, borderRadius: r }, style]} />;
}

function Stars() {
  const { width, height } = useWindowDimensions();
  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: rand(i, 6) * width,
        y: rand(i, 7) * height,
        r: rand(i, 8) < 0.15 ? 1.8 : 1,
        delay: Math.floor(rand(i, 9) * 3000),
      })),
    [width, height],
  );
  return (
    <View style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => (
        <Star key={i} {...s} />
      ))}
      <View style={[styles.moon, { left: width - 190, top: 70 }]}>
        <Svg width={120} height={120} viewBox="0 0 120 120">
          <Circle cx="60" cy="60" r="44" fill="rgba(240,248,255,0.10)" />
          <Path d="M78 18 A44 44 0 1 0 102 78 A36 36 0 1 1 78 18 Z" fill="rgba(240,248,255,0.55)" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  dim: { opacity: 0.32 },
  faint: { opacity: 0.22 },
  blob: { position: 'absolute', left: 0, top: 0 },
  note: { position: 'absolute', left: 0, top: 0 },
  bolt: { position: 'absolute', top: 0, width: 110 },
  star: { position: 'absolute', backgroundColor: '#FFFFFF' },
  moon: { position: 'absolute', opacity: 0.8 },
});
