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
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import {
  DEFAULT_DESIGN,
  designActive,
  directionVector,
  iconCount,
  iconMotion,
  ICON_OPTIONS,
  strengthOpacity,
  type DesignSettings,
  type IconKey,
} from './design-logic';

/**
 * Design (Pro/Business, Profil → Design): Hintergrund hinter allen Seiten –
 * Farbe oder Farbverlauf, dazu wahlweise bewegte Symbole (💵, Blitze, Mondnacht …).
 */
const DesignCtx = createContext<DesignSettings>(DEFAULT_DESIGN);

/** Liefert allen Seiten das gewählte Design (Gratis: immer klassisch). */
export function DesignProvider({ design, children }: { design: DesignSettings; children: ReactNode }) {
  return <DesignCtx.Provider value={design}>{children}</DesignCtx.Provider>;
}

export const useDesign = () => useContext(DesignCtx);

/** Hintergrund-Ebene (liegt hinter dem Inhalt, fängt keine Klicks) */
export function AppBackdrop({ design }: { design?: DesignSettings }) {
  const ctx = useDesign();
  const d = design ?? ctx;
  if (!designActive(d)) return null;
  return (
    <View pointerEvents="none" style={styles.layer}>
      {d.base === 'color' && <View style={[StyleSheet.absoluteFill, { backgroundColor: d.color, opacity: strengthOpacity(d.strength) }]} />}
      {d.base === 'gradient' && !d.moving && <StaticGradient design={d} />}
      {d.base === 'gradient' && d.moving && <Aurora colors={d.gradient} opacity={strengthOpacity(d.strength, true)} />}
      <Icons kind={d.icons} density={d.density} />
    </View>
  );
}

let gradientId = 0;
const nextGradientId = () => `design-bg-${++gradientId}`;

function StaticGradient({ design }: { design: DesignSettings }) {
  const [id] = useState(nextGradientId);
  const v = directionVector(design.direction);
  const colors = design.gradient;
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={id} x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>
          {colors.map((c, i) => (
            <Stop key={c + i} offset={i / Math.max(1, colors.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} opacity={strengthOpacity(design.strength)} />
    </Svg>
  );
}

function Icons({ kind, density }: { kind: IconKey; density: DesignSettings['density'] }) {
  const motion = iconMotion(kind);
  const emoji = ICON_OPTIONS.find((o) => o.key === kind)?.emoji ?? '';
  if (motion === 'fall')
    return <EmojiFall emoji={emoji} count={iconCount(14, density)} flutter={kind === 'money'} big={kind === 'money'} />;
  if (motion === 'rise') return <EmojiRise emoji={emoji} count={iconCount(10, density)} tilt={kind === 'rockets' ? -45 : 0} />;
  if (motion === 'twinkle') return <EmojiTwinkle emoji={emoji} count={iconCount(16, density)} />;
  if (motion === 'flash') return <Lightning count={iconCount(2, density)} />;
  if (motion === 'night') return <Stars count={iconCount(70, density)} />;
  return null;
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

function Aurora({ colors, opacity }: { colors: readonly string[]; opacity: number }) {
  const { width, height } = useWindowDimensions();
  const s = Math.max(width, height) * 0.9;
  const c = (i: number) => colors[i % colors.length];
  return (
    <View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Blob color={c(0)} size={s} x={-s * 0.35} y={-s * 0.4} dx={width * 0.25} dy={height * 0.15} duration={14000} delay={0} />
      <Blob color={c(1)} size={s} x={width - s * 0.6} y={height * 0.2} dx={-width * 0.3} dy={-height * 0.1} duration={17000} delay={600} />
      <Blob color={c(2)} size={s * 0.8} x={width * 0.1} y={height - s * 0.5} dx={width * 0.2} dy={-height * 0.2} duration={20000} delay={1200} />
    </View>
  );
}

type Drift = { x: number; phase: number; duration: number; height: number; size: number; sway: number };

/**
 * Endlos 0 → 1, aber mitten im Weg starten (phase) – so ist der Bildschirm
 * sofort gleichmäßig gefüllt statt dass erst alle oben loslaufen.
 */
function useLoop(phase: number, duration: number) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 0.5 : phase);
  useEffect(() => {
    if (reduce) return;
    t.set(phase);
    t.set(
      withSequence(
        withTiming(1, { duration: duration * (1 - phase), easing: Easing.linear }),
        withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration, easing: Easing.linear })), -1),
      ),
    );
  }, [t, phase, duration, reduce]);
  return t;
}

/** Ein Symbol fällt von oben nach unten (Geld flattert dabei wie ein Schein) */
function Falling({ emoji, x, phase, duration, height, size, sway, flutter }: Drift & { emoji: string; flutter: boolean }) {
  const t = useLoop(phase, duration);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    return {
      transform: [
        { translateX: x + Math.sin(p * Math.PI * 4) * sway },
        { translateY: -size * 2 + (height + size * 4) * p },
        { rotate: `${Math.sin(p * Math.PI * 3) * 35}deg` },
        { scaleX: flutter ? 0.4 + 0.6 * Math.abs(Math.cos(p * Math.PI * 5)) : 1 },
      ],
    };
  });
  return <Animated.Text style={[styles.emoji, { fontSize: size, lineHeight: size * 1.25 }, style]}>{emoji}</Animated.Text>;
}

function EmojiFall({ emoji, count, flutter, big }: { emoji: string; count: number; flutter: boolean; big?: boolean }) {
  const { width, height } = useWindowDimensions();
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (width / count) * i + rand(i, 1) * 40,
        phase: rand(i, 2),
        duration: 11000 + rand(i, 3) * 9000,
        size: (big ? 32 : 24) + rand(i, 4) * (big ? 22 : 18),
        sway: 20 + rand(i, 5) * 40,
      })),
    [width, count, big],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {items.map((n, i) => (
        <Falling key={i} emoji={emoji} flutter={flutter} {...n} height={height} />
      ))}
    </View>
  );
}

/** Ein Symbol steigt von unten nach oben (Raketen, Flammen, Herzen) */
function Rising({ emoji, x, phase, duration, height, size, sway, tilt }: Drift & { emoji: string; tilt: number }) {
  const t = useLoop(phase, duration);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    return {
      opacity: p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1,
      transform: [
        { translateX: x + Math.sin(p * Math.PI * 3) * sway },
        { translateY: height + size - (height + size * 3) * p },
        { rotate: `${tilt + Math.sin(p * Math.PI * 4) * 8}deg` },
        { scale: 0.85 + 0.25 * Math.sin(p * Math.PI) },
      ],
    };
  });
  return <Animated.Text style={[styles.emoji, { fontSize: size, lineHeight: size * 1.25 }, style]}>{emoji}</Animated.Text>;
}

function EmojiRise({ emoji, count, tilt }: { emoji: string; count: number; tilt: number }) {
  const { width, height } = useWindowDimensions();
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (width / count) * i + rand(i, 11) * 50,
        phase: rand(i, 12),
        duration: 9000 + rand(i, 13) * 8000,
        size: 24 + rand(i, 14) * 18,
        sway: 10 + rand(i, 15) * 25,
      })),
    [width, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {items.map((n, i) => (
        <Rising key={i} emoji={emoji} tilt={tilt} {...n} height={height} />
      ))}
    </View>
  );
}

/** Ein Symbol leuchtet an seinem Platz kurz auf (Funkeln, Diamanten) */
function Twinkle({ emoji, x, y, size, delay, duration }: { emoji: string; x: number; y: number; size: number; delay: number; duration: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 0.6 : 0);
  useEffect(() => {
    if (reduce) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [t, delay, duration, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.1 + 0.9 * t.get(),
    transform: [{ translateX: x }, { translateY: y }, { scale: 0.6 + 0.5 * t.get() }, { rotate: `${(t.get() - 0.5) * 30}deg` }],
  }));
  return <Animated.Text style={[styles.emoji, { fontSize: size, lineHeight: size * 1.25 }, style]}>{emoji}</Animated.Text>;
}

function EmojiTwinkle({ emoji, count }: { emoji: string; count: number }) {
  const { width, height } = useWindowDimensions();
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: rand(i, 21) * (width - 40),
        y: rand(i, 22) * (height - 40),
        size: 16 + rand(i, 23) * 20,
        delay: Math.floor(rand(i, 24) * 4000),
        duration: 1400 + Math.floor(rand(i, 25) * 1800),
      })),
    [width, height, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {items.map((n, i) => (
        <Twinkle key={i} emoji={emoji} {...n} />
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

function Lightning({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill}>
      {Array.from({ length: Math.min(count, 4) }, (_, i) => (
        <Bolt key={i} width={width} height={height} seed={i} />
      ))}
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

function Stars({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: rand(i, 6) * width,
        y: rand(i, 7) * height,
        r: rand(i, 8) < 0.15 ? 1.8 : 1,
        delay: Math.floor(rand(i, 9) * 3000),
      })),
    [width, height, count],
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
  blob: { position: 'absolute', left: 0, top: 0 },
  icons: { opacity: 0.42 },
  emoji: { position: 'absolute', left: 0, top: 0, textAlign: 'center' },
  bolt: { position: 'absolute', top: 0, width: 110 },
  star: { position: 'absolute', backgroundColor: '#FFFFFF' },
  moon: { position: 'absolute', opacity: 0.8 },
});
