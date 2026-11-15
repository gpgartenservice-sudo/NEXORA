import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

/**
 * Geldscheine, die unten aus dem Bildschirm schießen und links und rechts
 * hinausfliegen – für „Kauf abgeschlossen“, neue Einnahmen und den App-Start.
 *
 * - <MoneyBurst trigger={n} /> : spielt ab, sobald sich `trigger` ändert (n > 0)
 * - <MoneyBurstHost /> einmal im App-Rahmen + burstMoney() von überall
 */

const NOTE_W = 74;
const NOTE_H = 38;

/** Ein Geldschein (SVG, sieht auf Handy und Mac gleich aus) */
export function Banknote({ width = NOTE_W, value = '50' }: { width?: number; value?: string }) {
  const h = (width * NOTE_H) / NOTE_W;
  return (
    <Svg width={width} height={h} viewBox={`0 0 ${NOTE_W} ${NOTE_H}`}>
      <Defs>
        <LinearGradient id="note" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5BF0B4" />
          <Stop offset="0.55" stopColor="#2FE39A" />
          <Stop offset="1" stopColor="#14A56A" />
        </LinearGradient>
      </Defs>
      <Rect x="0.5" y="0.5" width={NOTE_W - 1} height={NOTE_H - 1} rx="4" fill="url(#note)" />
      <Rect x="4" y="4" width={NOTE_W - 8} height={NOTE_H - 8} rx="2.5" fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="1" />
      <Circle cx={NOTE_W / 2} cy={NOTE_H / 2} r="10" fill="rgba(255,255,255,0.35)" stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
      <SvgText x={NOTE_W / 2} y={NOTE_H / 2 + 4.5} fontSize="13" fontWeight="bold" fill="#063B26" textAnchor="middle">
        €
      </SvgText>
      <SvgText x="8" y="14" fontSize="8" fontWeight="bold" fill="#063B26">
        {value}
      </SvgText>
      <SvgText x={NOTE_W - 8} y={NOTE_H - 7} fontSize="8" fontWeight="bold" fill="#063B26" textAnchor="end">
        {value}
      </SvgText>
    </Svg>
  );
}

type Flight = {
  id: string;
  x0: number;
  /** seitliche Strecke bis zum Ende (negativ = nach links) */
  dx: number;
  /** wie hoch der Schein steigt (px) */
  rise: number;
  delay: number;
  duration: number;
  spin: number;
  rot0: number;
  flutter: number;
  scale: number;
  value: string;
};

const VALUES = ['5', '10', '20', '50', '100'];

function makeFlights(count: number, width: number, height: number, seed: number): Flight[] {
  return Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const x0 = width / 2 + (Math.random() - 0.5) * width * 0.5;
    return {
      id: `${seed}-${i}`,
      x0,
      dx: side * (width * 0.55 + Math.random() * width * 0.45),
      rise: height * (0.45 + Math.random() * 0.4),
      delay: Math.random() * 650,
      duration: 1500 + Math.random() * 700,
      spin: side * (180 + Math.random() * 360),
      rot0: (Math.random() - 0.5) * 60,
      flutter: 3 + Math.random() * 4,
      scale: 0.75 + Math.random() * 0.5,
      value: VALUES[Math.floor(Math.random() * VALUES.length)],
    };
  });
}

function Note({ f, height }: { f: Flight; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(f.delay, withTiming(1, { duration: f.duration, easing: Easing.linear })));
  }, [t, f]);
  const style = useAnimatedStyle(() => {
    const p = t.get();
    // Wurfbahn: schnell hoch, oben langsamer, dann seitlich hinaus und leicht nach unten
    const b = f.rise / 0.2025;
    const y = height + 40 - (0.9 * b * p - b * p * p);
    const x = f.x0 + f.dx * Math.pow(p, 1.35);
    return {
      opacity: p <= 0 ? 0 : 1,
      transform: [
        { translateX: x - NOTE_W / 2 },
        { translateY: y },
        { rotate: `${f.rot0 + f.spin * p}deg` },
        { scaleX: f.scale * (0.35 + 0.65 * Math.abs(Math.cos(p * f.flutter * Math.PI))) },
        { scaleY: f.scale },
      ],
    };
  });
  return (
    <Animated.View style={[styles.note, style]}>
      <Banknote value={f.value} />
    </Animated.View>
  );
}

/** Spielt ab, wenn sich `trigger` ändert (und größer als 0 ist). */
export function MoneyBurst({ trigger, count = 22 }: { trigger: number; count?: number }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    if (!trigger || reduce) return;
    const start = requestAnimationFrame(() => setFlights(makeFlights(count, width, height, trigger)));
    const done = setTimeout(() => setFlights([]), 3200);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(done);
    };
    // Größe absichtlich nicht als Auslöser: nur neu starten, wenn trigger sich ändert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, count, reduce]);

  if (!flights.length) return null;
  return (
    <View pointerEvents="none" style={styles.layer}>
      {flights.map((f) => (
        <Note key={f.id} f={f} height={height} />
      ))}
    </View>
  );
}

// --- Global: ein Host im App-Rahmen, auslösbar von überall --------------------------------

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

/** Geldscheine fliegen lassen (braucht <MoneyBurstHost /> im App-Rahmen). */
export function burstMoney(count = 22) {
  listeners.forEach((l) => l(count));
}

export function MoneyBurstHost() {
  const [state, setState] = useState({ trigger: 0, count: 22 });
  useEffect(() => {
    const l: Listener = (count) => setState((s) => ({ trigger: s.trigger + 1, count }));
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return useMemo(() => <MoneyBurst trigger={state.trigger} count={state.count} />, [state]);
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, overflow: 'hidden' },
  note: { position: 'absolute', left: 0, top: 0, width: NOTE_W, height: NOTE_H },
});
