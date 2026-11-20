import { Image } from 'expo-image';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';

import {
  DEFAULT_DESIGN,
  designActive,
  directionVector,
  iconCount,
  strengthOpacity,
  type DesignSettings,
  type IconKey,
} from './design-logic';
import {
  BanknoteBack,
  BanknoteFront,
  CONFETTI_COLORS,
  ConfettiCurl,
  Diamond,
  DIAMOND_RATIO,
  Flame,
  FLAME_RATIO,
  Heart,
  HEART_RATIO,
  Leaf,
  LEAF_COLORS,
  NOTE_RATIO,
  Rocket,
  RocketFlame,
  ROCKET_RATIO,
  SmokeTrail,
  Sparkle,
  SPARKLE_COLORS,
} from './sprites';

/**
 * Design (Pro/Business, Profil → Design): Hintergrund hinter allen Seiten –
 * Farbe oder Farbverlauf, dazu wahlweise bewegte Motive (Geldscheine, Blitze,
 * Mondnacht, Raketen …). Die Motive sind gezeichnet (sprites.tsx) und bewegen
 * sich in 3D: Scheine flattern und drehen sich, Flammen züngeln, Herzen schlagen.
 */
const DesignCtx = createContext<DesignSettings>(DEFAULT_DESIGN);

/** Liefert allen Seiten das gewählte Design (Gratis: immer klassisch). */
export function DesignProvider({ design, children }: { design: DesignSettings; children: ReactNode }) {
  return <DesignCtx.Provider value={design}>{children}</DesignCtx.Provider>;
}

export const useDesign = () => useContext(DesignCtx);

/**
 * Mac (breites Fenster): ein gemeinsamer Hintergrund liegt hinter Seitenleiste und Seiten
 * (in (tabs)/_layout.tsx) – die Seiten selbst sind dann durchsichtig. Nur im Web/Mac: dort
 * blendet der Seiten-Stapel verdeckte Seiten ganz aus (am iPad lägen sie darunter).
 */
export const sharedBackdropOn = (width: number, design: DesignSettings) =>
  Platform.OS === 'web' && width >= SIDEBAR_BREAKPOINT && designActive(design);

export function useWideBackdrop(): boolean {
  const { width } = useWindowDimensions();
  return sharedBackdropOn(width, useDesign());
}

/** Grundfarbe der Seiten-Stapel: am Mac mit Hintergrund durchsichtig */
export function useStackBackground(): string {
  return useWideBackdrop() ? 'transparent' : Colors.background;
}

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
  switch (kind) {
    case 'money':
      return <MoneyRain count={iconCount(14, density)} />;
    case 'leaves':
      return <LeafFall count={iconCount(14, density)} />;
    case 'confetti':
      return <ConfettiFall count={iconCount(24, density)} />;
    case 'rockets':
      return <Rockets count={iconCount(7, density)} />;
    case 'fire':
      return <Fire count={iconCount(18, density)} />;
    case 'hearts':
      return <Hearts count={iconCount(10, density)} />;
    case 'sparkles':
      return <Sparkles count={iconCount(16, density)} />;
    case 'diamonds':
      return <Diamonds count={iconCount(9, density)} />;
    case 'lightning':
      return <Lightning count={iconCount(2, density)} />;
    case 'stars':
      return <Stars count={iconCount(70, density)} />;
    default:
      return null;
  }
}

const GLOW = require('@/assets/images/glow.png');
const TAU = Math.PI * 2;

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

// ——— Zeitgeber ———

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

/** Endlos 0 → 1 am Platz (reverse: hin und zurück, weich); `still` = Stand bei reduzierter Bewegung */
function useCycle(duration: number, delay: number, reverse = false, still = 0.5) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? still : 0);
  useEffect(() => {
    if (reduce) return;
    t.set(0);
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: reverse ? Easing.inOut(Easing.sin) : Easing.linear }), -1, reverse)));
  }, [t, duration, delay, reverse, reduce]);
  return t;
}

/** Ein- und Ausblenden am Anfang/Ende eines Wegs */
function edgeFade(p: number, fadeIn: number, fadeOut: number) {
  'worklet';
  if (p < fadeIn) return p / fadeIn;
  if (p > 1 - fadeOut) return (1 - p) / fadeOut;
  return 1;
}

/** Herzschlag: zwei kurze Stöße pro Durchlauf (0..1) */
function heartbeat(p: number) {
  'worklet';
  const q = p - Math.floor(p);
  const a = Math.exp(-Math.pow((q - 0.12) / 0.05, 2));
  const b = Math.exp(-Math.pow((q - 0.3) / 0.05, 2)) * 0.6;
  return a + b;
}

// ——— Geldscheine ———

type NoteSpec = { x: number; phase: number; duration: number; w: number; sway: number; swings: number; spins: number; tilt: number; off: number };

/** Drehung um die Längsachse (Grad): ganze Umdrehungen plus Flattern */
function noteSpin(p: number, s: NoteSpec) {
  'worklet';
  return p * 360 * s.spins + Math.sin((p * TAU * s.swings + s.off) * 1.5) * 40;
}

/**
 * Ein Schein fällt wie Papier: pendelt seitlich, kippt in Pendelrichtung,
 * nickt vor und zurück und dreht sich – dann sieht man die Rückseite.
 */
function FallingNote({ s, height }: { s: NoteSpec; height: number }) {
  const t = useLoop(s.phase, s.duration);
  const h = s.w * NOTE_RATIO;
  const move = useAnimatedStyle(() => {
    const p = t.get();
    const a = p * TAU * s.swings + s.off;
    return {
      transform: [
        { perspective: 800 },
        { translateX: s.x + Math.sin(a) * s.sway },
        { translateY: -s.w * 1.4 + (height + s.w * 2.8) * p },
        { rotate: `${s.tilt + Math.cos(a) * 28}deg` },
        { rotateX: `${28 + Math.sin(a * 2) * 22}deg` },
        { rotateY: `${noteSpin(p, s)}deg` },
      ],
    };
  });
  // Rückseite deckt die Vorderseite ab, sobald der Schein mehr als halb gedreht ist
  const back = useAnimatedStyle(() => ({ opacity: Math.cos((noteSpin(t.get(), s) * Math.PI) / 180) < 0 ? 1 : 0 }));
  // hochkant zum Licht → dunkler
  const shade = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - Math.abs(Math.cos((noteSpin(t.get(), s) * Math.PI) / 180))) }));
  return (
    <Animated.View style={[styles.sprite, { width: s.w, height: h }, move]}>
      <BanknoteFront width={s.w} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.mirror, back]}>
        <BanknoteBack width={s.w} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.noteShade, shade]} />
    </Animated.View>
  );
}

function MoneyRain({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const notes = useMemo(
    () =>
      Array.from({ length: count }, (_, i): NoteSpec => {
        const w = 58 + rand(i, 4) * 40;
        return {
          x: (width / count) * i + rand(i, 1) * 50 - w / 2,
          phase: rand(i, 2),
          duration: 12000 + rand(i, 3) * 9000,
          w,
          sway: 26 + rand(i, 5) * 46,
          swings: 2 + Math.floor(rand(i, 6) * 3),
          spins: (rand(i, 7) > 0.5 ? 1 : -1) * (1 + Math.floor(rand(i, 8) * 2)),
          tilt: (rand(i, 9) - 0.5) * 40,
          off: rand(i, 10) * TAU,
        };
      }),
    [width, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {notes.map((s, i) => (
        <FallingNote key={i} s={s} height={height} />
      ))}
    </View>
  );
}

// ——— Blätter ———

type LeafSpec = NoteSpec & { variant: number };

function FallingLeaf({ s, height }: { s: LeafSpec; height: number }) {
  const t = useLoop(s.phase, s.duration);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const a = p * TAU * s.swings + s.off;
    return {
      transform: [
        { perspective: 600 },
        { translateX: s.x + Math.sin(a) * s.sway },
        { translateY: -s.w * 3 + (height + s.w * 6) * p },
        { rotate: `${s.tilt + p * 360 * s.spins + Math.cos(a) * 30}deg` },
        { rotateX: `${Math.sin(a * 1.7) * 55}deg` },
        { rotateY: `${Math.cos(a * 1.3) * 60}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.sprite, style]}>
      <Leaf width={s.w} variant={s.variant} />
    </Animated.View>
  );
}

function LeafFall({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const leaves = useMemo(
    () =>
      Array.from({ length: count }, (_, i): LeafSpec => {
        const w = 24 + rand(i, 31) * 18;
        return {
          x: (width / count) * i + rand(i, 32) * 40 - w / 2,
          phase: rand(i, 33),
          duration: 11000 + rand(i, 34) * 9000,
          w,
          sway: 30 + rand(i, 35) * 50,
          swings: 2 + Math.floor(rand(i, 36) * 3),
          spins: (rand(i, 37) > 0.5 ? 1 : -1) * (1 + Math.floor(rand(i, 38) * 2)),
          tilt: rand(i, 39) * 360,
          off: rand(i, 40) * TAU,
          variant: Math.floor(rand(i, 41) * LEAF_COLORS.length),
        };
      }),
    [width, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {leaves.map((s, i) => (
        <FallingLeaf key={i} s={s} height={height} />
      ))}
    </View>
  );
}

// ——— Konfetti ———

type ConfettiSpec = { x: number; phase: number; duration: number; size: number; sway: number; spin: number; flips: number; off: number; color: string; shape: 'strip' | 'square' | 'dot' | 'curl' };

function ConfettiPiece({ s, height }: { s: ConfettiSpec; height: number }) {
  const t = useLoop(s.phase, s.duration);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const a = p * TAU * 3 + s.off;
    return {
      transform: [
        { perspective: 400 },
        { translateX: s.x + Math.sin(a) * s.sway },
        { translateY: -40 + (height + 80) * p },
        { rotate: `${p * s.spin}deg` },
        { rotateX: `${p * 360 * s.flips}deg` },
        { rotateY: `${Math.sin(a * 1.4) * 50}deg` },
      ],
    };
  });
  if (s.shape === 'curl')
    return (
      <Animated.View style={[styles.sprite, style]}>
        <ConfettiCurl height={s.size * 2.4} color={s.color} />
      </Animated.View>
    );
  const dims =
    s.shape === 'strip'
      ? { width: s.size * 0.6, height: s.size * 1.5, borderRadius: 1.5 }
      : s.shape === 'square'
        ? { width: s.size, height: s.size, borderRadius: 2 }
        : { width: s.size * 0.9, height: s.size * 0.9, borderRadius: s.size };
  return <Animated.View style={[styles.sprite, dims, { backgroundColor: s.color }, style]} />;
}

function ConfettiFall({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i): ConfettiSpec => {
        const r = rand(i, 51);
        return {
          x: (width / count) * i + rand(i, 52) * 30,
          phase: rand(i, 53),
          duration: 6500 + rand(i, 54) * 5500,
          size: 10 + rand(i, 55) * 6,
          sway: 12 + rand(i, 56) * 26,
          spin: (rand(i, 57) > 0.5 ? 1 : -1) * (360 + rand(i, 58) * 720),
          flips: 3 + Math.floor(rand(i, 59) * 5),
          off: rand(i, 60) * TAU,
          color: CONFETTI_COLORS[Math.floor(rand(i, 61) * CONFETTI_COLORS.length)],
          shape: r < 0.45 ? 'strip' : r < 0.7 ? 'square' : r < 0.85 ? 'dot' : 'curl',
        };
      }),
    [width, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {pieces.map((s, i) => (
        <ConfettiPiece key={i} s={s} height={height} />
      ))}
    </View>
  );
}

// ——— Raketen ———

type RocketSpec = { x: number; phase: number; duration: number; w: number; sway: number; swings: number; off: number };

/** Flamme flackert schnell (eigener Takt, oben am Triebwerk befestigt) */
function Exhaust({ w, top }: { w: number; top: number }) {
  const f = useCycle(90 + Math.round(w) * 2, 0, true, 0.5);
  const fw = w * 0.42;
  const style = useAnimatedStyle(() => ({
    opacity: 0.8 + 0.2 * f.get(),
    transform: [{ scaleY: 0.7 + 0.5 * f.get() }, { scaleX: 1.08 - 0.16 * f.get() }],
  }));
  return (
    <Animated.View style={[styles.exhaust, { left: (w - fw) / 2, top, width: fw, height: fw * 2 }, style]}>
      <RocketFlame width={fw} />
    </Animated.View>
  );
}

function FlyingRocket({ s, height }: { s: RocketSpec; height: number }) {
  const t = useLoop(s.phase, s.duration);
  const rh = s.w * ROCKET_RATIO;
  const flameTop = rh * 0.9;
  const trailTop = flameTop + s.w * 0.55;
  const trailH = s.w * 6;
  const total = trailTop + trailH;
  const travel = height + total + rh;
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const a = p * TAU * s.swings + s.off;
    // Nase zeigt in Flugrichtung
    const vx = Math.cos(a) * s.sway * TAU * s.swings;
    const tilt = (Math.atan2(vx, travel) * 180) / Math.PI;
    return {
      opacity: edgeFade(p, 0.04, 0.08),
      transform: [{ translateX: s.x + Math.sin(a) * s.sway }, { translateY: height + rh - travel * p }, { rotate: `${tilt}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.sprite, { width: s.w, height: total, transformOrigin: `50% ${Math.round(rh / 2)}px` }, style]}>
      <View style={[styles.trail, { left: s.w * 0.25, top: trailTop, width: s.w * 0.5, height: trailH }]}>
        <SmokeTrail width={s.w * 0.5} height={trailH} />
      </View>
      <Exhaust w={s.w} top={flameTop} />
      <Rocket width={s.w} />
    </Animated.View>
  );
}

function Rockets({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const rockets = useMemo(
    () =>
      Array.from({ length: count }, (_, i): RocketSpec => {
        const w = 20 + rand(i, 71) * 12;
        return {
          x: (width / count) * i + rand(i, 72) * 40,
          phase: rand(i, 73),
          duration: 8000 + rand(i, 74) * 7000,
          w,
          sway: 14 + rand(i, 75) * 30,
          swings: 1 + Math.floor(rand(i, 76) * 2),
          off: rand(i, 77) * TAU,
        };
      }),
    [width, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {rockets.map((s, i) => (
        <FlyingRocket key={i} s={s} height={height} />
      ))}
    </View>
  );
}

// ——— Feuer ———

type TongueSpec = { x: number; w: number; scale: number; phase: number; duration: number; off: number };

/** Eine Flammenzunge am unteren Rand: wird größer/kleiner, schmaler und weht hin und her */
function Tongue({ s, height }: { s: TongueSpec; height: number }) {
  const t = useLoop(s.phase, s.duration);
  const fh = s.w * FLAME_RATIO * s.scale;
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const a = p * TAU + s.off;
    return {
      transform: [
        { scaleY: 1 + 0.14 * Math.sin(a * 3) + 0.07 * Math.sin(a * 7 + 1) },
        { scaleX: 1 + 0.06 * Math.sin(a * 5 + 2) },
        { skewX: `${Math.sin(a * 2) * 8}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.tongue, { left: s.x, top: height - fh * 0.82, width: s.w, height: fh }, style]}>
      <Flame width={s.w} />
    </Animated.View>
  );
}

type EmberSpec = { x: number; phase: number; duration: number; size: number; sway: number; off: number; color: string; reach: number };

/** Glühender Funke steigt auf und verglimmt */
function Ember({ s, height }: { s: EmberSpec; height: number }) {
  const t = useLoop(s.phase, s.duration);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const a = p * TAU * 2 + s.off;
    return {
      opacity: edgeFade(p, 0.08, 0.5) * (0.65 + 0.35 * Math.sin(a * 4.5)),
      transform: [
        { translateX: s.x + Math.sin(a) * s.sway },
        { translateY: height - height * s.reach * p },
        { scale: 1 - 0.5 * p },
      ],
    };
  });
  return (
    <Animated.View style={[styles.sprite, styles.ember, { width: s.size * 3, height: s.size * 3 }, style]}>
      <View style={[styles.emberHalo, { backgroundColor: s.color, borderRadius: s.size * 1.5 }]} />
      <View style={{ width: s.size, height: s.size, borderRadius: s.size / 2, backgroundColor: s.color }} />
    </Animated.View>
  );
}

function Fire({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const tongues = useMemo(() => {
    const n = Math.max(5, Math.min(14, Math.round(width / 70)));
    const step = width / n;
    return Array.from({ length: n + 1 }, (_, i): TongueSpec => {
      const w = step * (1.5 + rand(i, 81) * 0.5);
      return {
        x: i * step - w / 2 + (rand(i, 82) - 0.5) * step * 0.4,
        w,
        scale: 0.6 + rand(i, 83) * 0.4,
        phase: rand(i, 84),
        duration: 1800 + rand(i, 85) * 1400,
        off: rand(i, 86) * TAU,
      };
    });
  }, [width]);
  const embers = useMemo(
    () =>
      Array.from({ length: count }, (_, i): EmberSpec => ({
        x: rand(i, 91) * width,
        phase: rand(i, 92),
        duration: 4200 + rand(i, 93) * 4200,
        size: 3 + rand(i, 94) * 3.5,
        sway: 10 + rand(i, 95) * 30,
        off: rand(i, 96) * TAU,
        color: ['#FFE08A', '#FF9A3D', '#FFF4C8', '#FF6A2A'][i % 4],
        reach: 0.45 + rand(i, 97) * 0.4,
      })),
    [width, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.fireLayer]}>
      <Svg style={[styles.fireGlow, { height: height * 0.45 }]} preserveAspectRatio="none" viewBox="0 0 10 100">
        <Defs>
          <LinearGradient id="lx-fire-glow" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#FF6A1A" stopOpacity="0.75" />
            <Stop offset="0.45" stopColor="#E0360F" stopOpacity="0.25" />
            <Stop offset="1" stopColor="#E0360F" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="10" height="100" fill="url(#lx-fire-glow)" />
      </Svg>
      {embers.map((s, i) => (
        <Ember key={i} s={s} height={height} />
      ))}
      {tongues.map((s, i) => (
        <Tongue key={i} s={s} height={height} />
      ))}
    </View>
  );
}

// ——— Herzen ———

type HeartSpec = { x: number; phase: number; duration: number; w: number; sway: number; off: number; beats: number; variant: number };

function RisingHeart({ s, height }: { s: HeartSpec; height: number }) {
  const t = useLoop(s.phase, s.duration);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    const a = p * TAU * 2 + s.off;
    return {
      opacity: edgeFade(p, 0.1, 0.2),
      transform: [
        { translateX: s.x + Math.sin(a) * s.sway },
        { translateY: height + s.w - (height + s.w * 3) * p },
        { rotate: `${Math.sin(a + 0.6) * 14}deg` },
        { scale: (0.85 + 0.2 * Math.sin(p * Math.PI)) * (1 + 0.16 * heartbeat(p * s.beats)) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.sprite, { width: s.w, height: s.w * HEART_RATIO }, style]}>
      <Heart width={s.w} variant={s.variant} />
    </Animated.View>
  );
}

function Hearts({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const hearts = useMemo(
    () =>
      Array.from({ length: count }, (_, i): HeartSpec => {
        const duration = 9000 + rand(i, 101) * 8000;
        return {
          x: (width / count) * i + rand(i, 102) * 50 - 10,
          phase: rand(i, 103),
          duration,
          w: 22 + rand(i, 104) * 20,
          sway: 10 + rand(i, 105) * 25,
          off: rand(i, 106) * TAU,
          // etwa ein Herzschlag pro Sekunde
          beats: Math.round(duration / 1000),
          variant: i % 3,
        };
      }),
    [width, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {hearts.map((s, i) => (
        <RisingHeart key={i} s={s} height={height} />
      ))}
    </View>
  );
}

// ——— Funkeln ———

type SparkSpec = { x: number; y: number; size: number; delay: number; duration: number; color: string; dir: number };

/** Funkelt kurz auf (wächst, dreht sich, verglüht), dann Pause bis zum nächsten Mal */
function Twinkle({ s }: { s: SparkSpec }) {
  const t = useCycle(s.duration, s.delay, false, 0.2);
  const style = useAnimatedStyle(() => {
    const q = Math.min(1, t.get() / 0.4);
    const v = Math.pow(Math.sin(q * Math.PI), 2);
    return {
      opacity: v,
      transform: [{ translateX: s.x }, { translateY: s.y }, { scale: 0.15 + 0.85 * v }, { rotate: `${q * 90 * s.dir}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.sprite, style]}>
      <Sparkle size={s.size} color={s.color} />
    </Animated.View>
  );
}

function Sparkles({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const sparks = useMemo(
    () =>
      Array.from({ length: count }, (_, i): SparkSpec => ({
        x: rand(i, 21) * (width - 40),
        y: rand(i, 22) * (height - 40),
        size: 16 + rand(i, 23) * 26,
        delay: Math.floor(rand(i, 24) * 4000),
        duration: 2400 + Math.floor(rand(i, 25) * 2600),
        color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
        dir: rand(i, 26) > 0.5 ? 1 : -1,
      })),
    [width, height, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {sparks.map((s, i) => (
        <Twinkle key={i} s={s} />
      ))}
    </View>
  );
}

// ——— Diamanten ———

type GemSpec = { x: number; y: number; w: number; delay: number; duration: number; tone: 'ice' | 'mint'; rot: number };

/** Schwebt am Platz, wiegt sich leicht – oben blitzt ab und zu ein Lichtfunke */
function FloatingGem({ s }: { s: GemSpec }) {
  const t = useCycle(s.duration, s.delay, true);
  const h = s.w * DIAMOND_RATIO;
  const move = useAnimatedStyle(() => {
    const p = t.get();
    return {
      transform: [
        { perspective: 600 },
        { translateX: s.x },
        { translateY: s.y - 8 * p },
        { rotate: `${s.rot + (p - 0.5) * 16}deg` },
        { rotateY: `${(p - 0.5) * 50}deg` },
      ],
    };
  });
  const glint = useAnimatedStyle(() => {
    const g = Math.max(0, (t.get() - 0.88) / 0.12);
    return { opacity: g, transform: [{ scale: 0.3 + 0.9 * g }, { rotate: `${g * 45}deg` }] };
  });
  return (
    <Animated.View style={[styles.sprite, { width: s.w, height: h }, move]}>
      <Diamond width={s.w} tone={s.tone} />
      <Animated.View style={[styles.glint, { left: s.w * 0.12, top: -s.w * 0.16 }, glint]}>
        <Sparkle size={s.w * 0.55} />
      </Animated.View>
    </Animated.View>
  );
}

function Diamonds({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const gems = useMemo(
    () =>
      Array.from({ length: count }, (_, i): GemSpec => ({
        x: rand(i, 111) * (width - 60),
        y: 20 + rand(i, 112) * (height - 90),
        w: 24 + rand(i, 113) * 22,
        delay: Math.floor(rand(i, 114) * 2500),
        duration: 2600 + Math.floor(rand(i, 115) * 2400),
        tone: rand(i, 116) < 0.3 ? 'mint' : 'ice',
        rot: (rand(i, 117) - 0.5) * 24,
      })),
    [width, height, count],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.icons]}>
      {gems.map((s, i) => (
        <FloatingGem key={i} s={s} />
      ))}
    </View>
  );
}

// ——— Blitze ———

type BoltShape = { main: string; branches: string[] };

/** Zufälliger, gezackter Blitz von oben nach unten mit Seitenästen */
function makeBolt(x0: number, h: number): BoltShape {
  const pts: [number, number][] = [[x0, 0]];
  let x = x0;
  let y = 0;
  while (y < h) {
    y = Math.min(h, y + 14 + Math.random() * 26);
    x += (Math.random() - 0.5) * 46;
    pts.push([x, y]);
  }
  const line = (p: [number, number][]) => p.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
  const branches: string[] = [];
  const nBranches = 1 + Math.floor(Math.random() * 3);
  for (let b = 0; b < nBranches; b++) {
    const start = pts[1 + Math.floor(Math.random() * Math.max(1, pts.length * 0.7 - 1))];
    if (!start) continue;
    const side = Math.random() > 0.5 ? 1 : -1;
    const bp: [number, number][] = [start];
    let [bx, by] = start;
    const len = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < len; k++) {
      by += 10 + Math.random() * 18;
      bx += side * (8 + Math.random() * 18);
      bp.push([bx, by]);
    }
    branches.push(line(bp));
  }
  return { main: line(pts), branches };
}

function Bolt({ width, height, seed, flash }: { width: number; height: number; seed: number; flash: SharedValue<number> }) {
  const reduce = useReducedMotion();
  const glow = useSharedValue(0);
  const [shape, setShape] = useState<BoltShape>(() => makeBolt(width * (0.2 + Math.random() * 0.6), height * (0.45 + Math.random() * 0.25)));
  useEffect(() => {
    if (reduce) return;
    let timer: ReturnType<typeof setTimeout>;
    const strike = () => {
      setShape(makeBolt(40 + Math.random() * (width - 80), height * (0.4 + Math.random() * 0.35)));
      const seq = withSequence(
        withTiming(1, { duration: 50 }),
        withTiming(0.15, { duration: 70 }),
        withTiming(0.95, { duration: 50 }),
        withTiming(0, { duration: 520 }),
      );
      glow.set(seq);
      flash.set(
        withSequence(withTiming(1, { duration: 50 }), withTiming(0.1, { duration: 70 }), withTiming(0.7, { duration: 50 }), withTiming(0, { duration: 600 })),
      );
      timer = setTimeout(strike, 3500 + Math.random() * 5000);
    };
    timer = setTimeout(strike, 1200 + seed * 2300);
    return () => clearTimeout(timer);
  }, [glow, flash, width, height, seed, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: glow.get() }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height}>
        {shape.branches.map((d, i) => (
          <Path key={`g${i}`} d={d} stroke="#8FB6FF" strokeOpacity={0.25} strokeWidth={7} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        <Path d={shape.main} stroke="#8FB6FF" strokeOpacity={0.28} strokeWidth={14} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {shape.branches.map((d, i) => (
          <Path key={`b${i}`} d={d} stroke="#DCE8FF" strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        <Path d={shape.main} stroke="#CFE0FF" strokeWidth={4.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Path d={shape.main} stroke="#FFFFFF" strokeWidth={1.8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function Lightning({ count }: { count: number }) {
  const { width, height } = useWindowDimensions();
  const flash = useSharedValue(0);
  const sky = useAnimatedStyle(() => ({ opacity: flash.get() * 0.12 }));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.skyFlash, sky]} />
      {Array.from({ length: Math.min(count, 4) }, (_, i) => (
        <Bolt key={i} width={width} height={height} seed={i} flash={flash} />
      ))}
    </View>
  );
}

// ——— Mondnacht ———

function Star({ x, y, r, delay }: { x: number; y: number; r: number; delay: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0.4);
  useEffect(() => {
    if (reduce) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration: 1600 + (delay % 1400), easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [t, delay, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: 0.15 + 0.75 * t.get(), transform: [{ scale: 0.7 + 0.5 * t.get() }] }));
  return <Animated.View style={[styles.star, { left: x, top: y, width: r * 2, height: r * 2, borderRadius: r }, style]} />;
}

/** Ab und zu zieht eine Sternschnuppe schräg über den Himmel */
function ShootingStar({ width, height }: { width: number; height: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  const [path, setPath] = useState({ x: width * 0.6, y: height * 0.1, angle: 25 });
  useEffect(() => {
    if (reduce) return;
    let timer: ReturnType<typeof setTimeout>;
    const fly = () => {
      const fromLeft = Math.random() > 0.5;
      setPath({ x: fromLeft ? width * (0.05 + Math.random() * 0.4) : width * (0.55 + Math.random() * 0.4), y: height * (0.04 + Math.random() * 0.3), angle: fromLeft ? 18 + Math.random() * 20 : 142 + Math.random() * 20 });
      t.set(0);
      t.set(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
      timer = setTimeout(fly, 6000 + Math.random() * 7000);
    };
    timer = setTimeout(fly, 2500);
    return () => clearTimeout(timer);
  }, [t, width, height, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.sin(t.get() * Math.PI),
    transform: [{ translateX: t.get() * 260 }, { scaleX: 0.4 + 0.6 * Math.sin(t.get() * Math.PI) }],
  }));
  return (
    <View style={[styles.shootingWrap, { left: path.x, top: path.y, transform: [{ rotate: `${path.angle}deg` }] }]}>
      <Animated.View style={[styles.shooting, style]}>
        <Svg width={130} height={4} viewBox="0 0 130 4">
          <Defs>
            <LinearGradient id="lx-shooting" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.95" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0.8" width="128" height="2.4" rx="1.2" fill="url(#lx-shooting)" />
          <Circle cx="127.5" cy="2" r="2" fill="#FFFFFF" />
        </Svg>
      </Animated.View>
    </View>
  );
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
      <ShootingStar width={width} height={height} />
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
  icons: { opacity: 0.6 },
  fireLayer: { opacity: 0.75 },
  sprite: { position: 'absolute', left: 0, top: 0 },
  mirror: { transform: [{ scaleX: -1 }] },
  noteShade: { backgroundColor: '#0B1A0E', borderRadius: 3 },
  exhaust: { position: 'absolute', transformOrigin: 'top' },
  trail: { position: 'absolute' },
  tongue: { position: 'absolute', transformOrigin: 'bottom' },
  ember: { alignItems: 'center', justifyContent: 'center' },
  emberHalo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.28 },
  fireGlow: { position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%' },
  glint: { position: 'absolute' },
  skyFlash: { backgroundColor: '#CFE0FF' },
  star: { position: 'absolute', backgroundColor: '#FFFFFF' },
  shootingWrap: { position: 'absolute', width: 400, height: 4, transformOrigin: 'left center' },
  shooting: { position: 'absolute', left: 0, top: 0, width: 130, height: 4 },
  moon: { position: 'absolute', opacity: 0.8 },
});
