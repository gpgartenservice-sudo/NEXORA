import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * Fliegende Dollarscheine (💵) – für „Kauf abgeschlossen“, neue Einnahmen und den App-Start.
 *
 * Arten:
 * - 'bottom'  : schießen unten in der Mitte heraus und fliegen links/rechts hinaus
 * - 'corners' : kommen aus den unteren Ecken und fliegen quer übers Bild
 * - 'rain'    : regnen von oben herunter
 *
 * - <MoneyBurst trigger={n} /> : spielt ab, sobald sich `trigger` ändert (n > 0)
 * - <MoneyBurstHost /> einmal im App-Rahmen + burstMoney() von überall.
 *   Mehrere Wellen kurz hintereinander laufen gleichzeitig (nichts wird abgeschnitten).
 */

export type BurstKind = 'bottom' | 'corners' | 'rain';

const SIZE = 46;

type Flight = {
  id: string;
  kind: BurstKind;
  x0: number;
  y0: number;
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
  emoji: string;
};

let wave = 0;

function makeFlights(count: number, width: number, height: number, kind: BurstKind): Flight[] {
  const seed = ++wave;
  return Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const emoji = Math.random() < 0.1 ? '💰' : '💵';
    const base = {
      id: `${seed}-${i}`,
      kind,
      delay: Math.random() * (kind === 'rain' ? 1100 : 650),
      spin: side * (180 + Math.random() * 360),
      rot0: (Math.random() - 0.5) * 60,
      flutter: 3 + Math.random() * 4,
      scale: 0.75 + Math.random() * 0.6,
      emoji,
    };
    if (kind === 'rain') {
      return {
        ...base,
        x0: Math.random() * width,
        y0: -SIZE * 2 - Math.random() * 120,
        dx: (Math.random() - 0.5) * 140,
        rise: 0,
        duration: 1900 + Math.random() * 900,
        spin: (Math.random() - 0.5) * 240,
      };
    }
    if (kind === 'corners') {
      const fromLeft = side > 0;
      return {
        ...base,
        x0: fromLeft ? -SIZE + Math.random() * width * 0.15 : width + SIZE - Math.random() * width * 0.15,
        y0: height + 40,
        dx: (fromLeft ? 1 : -1) * (width * 0.6 + Math.random() * width * 0.6),
        rise: height * (0.5 + Math.random() * 0.4),
        duration: 1600 + Math.random() * 700,
      };
    }
    return {
      ...base,
      x0: width / 2 + (Math.random() - 0.5) * width * 0.5,
      y0: height + 40,
      dx: side * (width * 0.55 + Math.random() * width * 0.45),
      rise: height * (0.45 + Math.random() * 0.45),
      duration: 1500 + Math.random() * 700,
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
    let x: number;
    let y: number;
    if (f.kind === 'rain') {
      // fällt schneller werdend, pendelt dabei
      x = f.x0 + Math.sin(p * Math.PI * 2.5) * 30 + f.dx * p;
      y = f.y0 + (height + SIZE * 4) * (0.35 * p + 0.65 * p * p);
    } else {
      // Wurfbahn: schnell hoch, oben langsamer, dann seitlich hinaus und leicht nach unten
      const b = f.rise / 0.2025;
      y = f.y0 - (0.9 * b * p - b * p * p);
      x = f.x0 + f.dx * Math.pow(p, 1.35);
    }
    return {
      opacity: p <= 0 ? 0 : 1,
      transform: [
        { translateX: x - SIZE / 2 },
        { translateY: y },
        { rotate: `${f.rot0 + f.spin * p}deg` },
        { scaleX: f.scale * (0.35 + 0.65 * Math.abs(Math.cos(p * f.flutter * Math.PI))) },
        { scaleY: f.scale },
      ],
    };
  });
  return <Animated.Text style={[styles.note, style]}>{f.emoji}</Animated.Text>;
}

type Wave = { count: number; kind: BurstKind };

/** Spielt ab, wenn sich `trigger` ändert (und größer als 0 ist). */
export function MoneyBurst({ trigger, count = 22, kind = 'bottom' }: { trigger: number; count?: number; kind?: BurstKind }) {
  const next = useMemo(() => ({ count, kind }), [count, kind]);
  return <MoneyWaves trigger={trigger} wave={next} />;
}

function MoneyWaves({ trigger, wave: next }: { trigger: number; wave: Wave }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [flights, setFlights] = useState<Flight[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!trigger || reduce) return;
    const start = requestAnimationFrame(() => {
      const fresh = makeFlights(next.count, width, height, next.kind);
      const ids = new Set(fresh.map((f) => f.id));
      setFlights((all) => [...all, ...fresh]);
      // jede Welle räumt nur sich selbst wieder weg
      timers.current.push(setTimeout(() => setFlights((all) => all.filter((f) => !ids.has(f.id))), 4200));
    });
    return () => cancelAnimationFrame(start);
    // Größe absichtlich nicht als Auslöser: nur neu starten, wenn trigger sich ändert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, reduce]);

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

type Listener = (w: Wave) => void;
const listeners = new Set<Listener>();

/** Dollarscheine fliegen lassen (braucht <MoneyBurstHost /> im App-Rahmen). */
export function burstMoney(count = 22, kind: BurstKind = 'bottom') {
  listeners.forEach((l) => l({ count, kind }));
}

export function MoneyBurstHost() {
  const [state, setState] = useState<{ trigger: number; wave: Wave }>({ trigger: 0, wave: { count: 22, kind: 'bottom' } });
  useEffect(() => {
    const l: Listener = (w) => setState((s) => ({ trigger: s.trigger + 1, wave: w }));
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return <MoneyWaves trigger={state.trigger} wave={state.wave} />;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, overflow: 'hidden' },
  note: { position: 'absolute', left: 0, top: 0, fontSize: SIZE, lineHeight: SIZE * 1.2, width: SIZE * 1.3, textAlign: 'center' },
});
