import { useFocusEffect, usePathname } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { PanResponder, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Colors, accentAlpha } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';

import { NAV_ITEMS } from './nav-items';

/**
 * Handy: vom linken Rand nach rechts wischen.
 * – Hauptseite (Start, Kunden, …): das Seitenmenü kommt mit dem Finger herein.
 * – Unterseite (z. B. ein Kunde): zurück – genau wie der Zurück-Link im Seitenkopf.
 * Die Stacks haben dafür die eingebaute iOS-Geste aus (sonst ginge es doppelt zurück).
 *
 * Mac: auf einer Unterseite mit zwei Fingern nach rechts wischen (wie in Safari) – zurück.
 */

/** So nah am linken Rand muss der Finger aufsetzen */
const EDGE = 26;
/** Ab dieser Wischweite geht es zurück */
const BACK_DISTANCE = 80;
const ARROW = 44;
/** Mac-Trackpad: so weit seitlich wischen (Pixel), dann geht es zurück */
const TRACKPAD_DISTANCE = 150;
/** Pause, nach der ein Wischen als beendet gilt (auch das Nachgleiten) */
const GESTURE_GAP = 220;

type DrawerHandle = {
  progress: SharedValue<number>;
  /** Weg, bis das Menü ganz offen ist */
  distance: number;
  open: () => void;
  /** Loslassen ohne Öffnen: Menü federt zurück */
  cancel: () => void;
};

// Es gibt immer nur ein Menü und eine sichtbare Seite – darum reichen einfache Variablen
let drawer: DrawerHandle | null = null;
let back: { run: () => void } | null = null;
let onMainPage = false;
let swipeOn = false;
let mode: 'menu' | 'back' | null = null;

/** Handy-Menü meldet sich an, damit das Wischen es mitziehen kann */
export function registerDrawer(handle: DrawerHandle) {
  drawer = handle;
  return () => {
    if (drawer === handle) drawer = null;
  };
}

/** Unterseite: ihr Zurück (aus dem Seitenkopf) gilt auch fürs Wischen vom Rand */
export function useSwipeBack(onBack: (() => void) | undefined) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  const has = !!onBack;
  useFocusEffect(
    useCallback(() => {
      if (!has) return;
      const entry = { run: () => latest.current?.() };
      back = entry;
      return () => {
        if (back === entry) back = null;
      };
    }, [has]),
  );
}

/** Erkennt das Wischen; `pull`/`y` steuern den Zurück-Pfeil */
function createResponder(pull: SharedValue<number>, y: SharedValue<number>) {
  const finish = (dx: number, vx: number) => {
    if (mode === 'menu' && drawer) {
      if (dx > drawer.distance * 0.35 || (vx > 0.4 && dx > 24)) {
        playSound('tick');
        drawer.open();
      } else drawer.cancel();
    } else if (mode === 'back') {
      pull.set(withTiming(0, { duration: 200 }));
      if ((dx > BACK_DISTANCE || (vx > 0.5 && dx > 30)) && back) {
        playSound('tick');
        back.run();
      }
    }
    mode = null;
  };
  return PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_e, g) =>
      swipeOn &&
      g.x0 <= EDGE &&
      g.dx > 12 &&
      Math.abs(g.dx) > Math.abs(g.dy) * 1.6 &&
      (onMainPage ? !!drawer : !!back),
    onPanResponderGrant: (_e, g) => {
      mode = onMainPage ? 'menu' : 'back';
      y.set(g.y0);
    },
    onPanResponderMove: (_e, g) => {
      const dx = Math.max(0, g.dx);
      if (mode === 'menu' && drawer) drawer.progress.set(Math.min(1, dx / drawer.distance));
      else if (mode === 'back') {
        pull.set(dx);
        y.set(g.moveY);
      }
    },
    onPanResponderRelease: (_e, g) => finish(g.dx, g.vx),
    onPanResponderTerminate: () => finish(0, 0),
    onPanResponderTerminationRequest: () => false,
  });
}

/** Liegt der Zeiger über etwas, das selbst seitlich scrollt (oder einem Textfeld)? Dann nicht zurück. */
function scrollsSideways(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
    const { overflowX } = getComputedStyle(el);
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

/** Mac: zwei Finger nach rechts (Trackpad-Scrollen nach links) auf einer Unterseite = zurück */
function useTrackpadBack(pull: SharedValue<number>, y: SharedValue<number>) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let acc = 0;
    let fired = false;
    let blocked: boolean | null = null;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const end = () => {
      acc = 0;
      fired = false;
      blocked = null;
      pull.set(withTiming(0, { duration: 200 }));
    };
    const onWheel = (e: WheelEvent) => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(end, GESTURE_GAP);
      if (fired || e.ctrlKey || onMainPage || !back) return;
      const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      if (Math.abs(dx) <= Math.abs(e.deltaY) * 1.5) return;
      blocked ??= scrollsSideways(e.target);
      if (blocked) return;
      // Finger nach rechts = Inhalt nach links scrollen = deltaX negativ
      acc = Math.max(0, acc - dx);
      pull.set(Math.min(acc, TRACKPAD_DISTANCE) * ((BACK_DISTANCE + 6) / TRACKPAD_DISTANCE));
      y.set(e.clientY);
      if (acc >= TRACKPAD_DISTANCE) {
        fired = true;
        playSound('tick');
        pull.set(withTiming(0, { duration: 220 }));
        back.run();
      }
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      if (idle) clearTimeout(idle);
    };
  }, [pull, y]);
}

type Props = { enabled: boolean; style?: StyleProp<ViewStyle>; children: ReactNode };

/** Umschließt den Seiteninhalt und erkennt das Wischen vom linken Rand */
export function EdgeSwipe({ enabled, style, children }: Props) {
  const pathname = usePathname();
  const main = NAV_ITEMS.some((i) => i.href === pathname);
  const active = enabled && Platform.OS !== 'web';
  useEffect(() => {
    onMainPage = main;
    swipeOn = active;
  }, [main, active]);

  const pull = useSharedValue(0);
  const y = useSharedValue(0);

  const responder = useMemo(() => createResponder(pull, y), [pull, y]);
  useTrackpadBack(pull, y);
  // Mac: der Pfeil zeigt auch das Zurück-Wischen mit zwei Fingern
  const showArrow = active || Platform.OS === 'web';

  // Zurück-Pfeil am Rand: kommt mit dem Finger herein, leuchtet auf, sobald es reicht
  const arrowStyle = useAnimatedStyle(() => {
    const p = pull.get();
    const ready = [BACK_DISTANCE - 12, BACK_DISTANCE + 6];
    return {
      opacity: interpolate(p, [0, 40], [0, 1], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(p, ready, ['rgba(38,38,42,0.92)', accentAlpha(0.28)]),
      borderColor: interpolateColor(p, ready, ['rgba(255,255,255,0.14)', accentAlpha(0.6)]),
      transform: [
        { translateX: -ARROW + Math.min(p, 160) * 0.45 },
        { translateY: y.get() - ARROW / 2 },
        { scale: interpolate(p, ready, [1, 1.12], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View style={style} {...responder.panHandlers}>
      {children}
      {showArrow && (
        <Animated.View pointerEvents="none" style={[styles.arrow, arrowStyle]}>
          <ChevronLeft size={22} color={Colors.text} strokeWidth={2.4} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  arrow: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: ARROW,
    height: ARROW,
    borderRadius: ARROW / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
