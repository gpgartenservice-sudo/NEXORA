import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Spacing } from '@/constants/theme';
import { NexyAvatar, type NexyMood } from '@/features/assistant/nexy-avatar';
import { useGuide } from '@/features/assistant/nexy-guide';
import { useTutorial } from '@/features/tutorial/tutorial-provider';
import { useProfile } from '@/providers/profile-provider';

import { lunaQuip } from './content';
import { useCelebration } from './money';

const KEY = 'nexora.last-open';
/** Wartezeit nach dem Öffnen der Startseite */
const START_DELAY = 1300;
/** Tippen der Sprechblase (ms pro Zeichen) */
const TYPE_MS = 32;
/** Einmal pro App-Start */
let shownThisStart = false;

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);
const WEB = Platform.OS === 'web';
const BLUR = 45;

type Phase = 'in' | 'talk' | 'out';

/**
 * Luna begrüßt dich auf der Startseite – mit einem lockeren Spruch, wenn es passt
 * (spät abends, nach ein paar Tagen Pause, Montagmorgen …): Der Hintergrund wird
 * unscharf, Luna fliegt ins Bild, sagt ihren Satz und fliegt wieder hinaus.
 * Antippen beendet es sofort.
 */
export function LunaGreeting() {
  const pathname = usePathname();
  const { profile } = useProfile();
  const tutorial = useTutorial();
  const guide = useGuide();
  const celebration = useCelebration();
  const [quip, setQuip] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const decided = useRef(false);

  // Spruch einmal pro App-Start festlegen (und merken, wann die App zuletzt offen war)
  useEffect(() => {
    if (decided.current || shownThisStart || pathname !== '/home' || !profile) return;
    decided.current = true;
    shownThisStart = true;
    const name = profile.display_name?.trim().split(/\s+/)[0];
    void (async () => {
      let last: Date | null = null;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        last = raw ? new Date(raw) : null;
        await AsyncStorage.setItem(KEY, new Date().toISOString());
      } catch {
        // ohne Speicher eben ohne „Wie war dein Urlaub?“
      }
      setQuip(lunaQuip(new Date(), last && !Number.isNaN(last.getTime()) ? last : null, name));
    })();
  }, [pathname, profile]);

  // Erst auftreten, wenn nichts anderes läuft (Einführung, Vorführung, Geldregen)
  const busy = !!tutorial.active || !!guide?.running || !!celebration;
  useEffect(() => {
    if (!quip || ready || busy || pathname !== '/home') return;
    const t = setTimeout(() => setReady(true), START_DELAY);
    return () => clearTimeout(t);
  }, [quip, ready, busy, pathname]);

  if (!quip || !ready) return null;
  return <LunaGreetingView text={quip} away={pathname !== '/home'} onDone={() => setQuip(null)} />;
}

/** Der eigentliche Auftritt (auch einzeln nutzbar). `away` = Seite gewechselt → sofort verabschieden */
export function LunaGreetingView({ text, away = false, onDone }: { text: string; away?: boolean; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('in');
  const [typed, setTyped] = useState(reduce ? text.length : 0);
  const [mood, setMood] = useState<NexyMood>('happy');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const leaving = useRef(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const size = Math.round(Math.max(120, Math.min(190, Math.min(width, height) * 0.38)));

  const backdrop = useSharedValue(0);
  const flyY = useSharedValue(reduce ? 0 : height * 0.65);
  const flyScale = useSharedValue(reduce ? 1 : 0.45);
  const tilt = useSharedValue(reduce ? 0 : -14);
  const squash = useSharedValue(1);
  const lunaOpacity = useSharedValue(reduce ? 0 : 1);
  const bubble = useSharedValue(0);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /** Luna verabschiedet sich: hüpft kurz, fliegt nach oben raus, Hintergrund wird wieder scharf */
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase('out');
    setMood('happy');
    setTyped(text.length);
    bubble.set(withTiming(0, { duration: 180 }));
    if (reduce) {
      lunaOpacity.set(withTiming(0, { duration: 250 }));
    } else {
      squash.set(withSequence(withTiming(0.85, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 260 })));
      flyY.set(withDelay(140, withTiming(-height * 0.75, { duration: 520, easing: Easing.in(Easing.cubic) })));
      flyScale.set(withDelay(140, withTiming(0.55, { duration: 520 })));
      tilt.set(withDelay(140, withTiming(12, { duration: 520 })));
    }
    backdrop.set(withDelay(reduce ? 0 : 260, withTiming(0, { duration: 420 })));
    later(reduce ? 450 : 760, () => done.current());
  };

  // Ablauf: Hintergrund verschwimmt → Luna fliegt ein und landet → Blase → tippen → warten → weg
  useEffect(() => {
    backdrop.set(withTiming(1, { duration: 420 }));
    if (reduce) {
      lunaOpacity.set(withTiming(1, { duration: 250 }));
      bubble.set(withTiming(1, { duration: 250 }));
      later(250, () => setPhase('talk'));
      later(250 + Math.max(2600, text.length * 60), leave);
    } else {
      flyY.set(withDelay(180, withSpring(0, { damping: 13, stiffness: 95, mass: 1 })));
      flyScale.set(withDelay(180, withSpring(1, { damping: 12, stiffness: 110 })));
      tilt.set(withDelay(180, withSpring(0, { damping: 10, stiffness: 90 })));
      // Landung: kurz zusammendrücken
      later(760, () =>
        squash.set(withSequence(withTiming(0.88, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 240 }))),
      );
      later(900, () => {
        setPhase('talk');
        setMood('talking');
        bubble.set(withSpring(1, { damping: 12, stiffness: 200 }));
      });
    }
    return () => timers.current.forEach(clearTimeout);
    // nur einmal beim Auftreten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Text Buchstabe für Buchstabe; danach freut sie sich und bleibt kurz zum Lesen
  useEffect(() => {
    if (phase !== 'talk' || reduce) return;
    if (typed >= text.length) {
      const a = setTimeout(() => setMood('happy'), 250);
      const b = setTimeout(leave, Math.max(2200, text.length * 45));
      return () => {
        clearTimeout(a);
        clearTimeout(b);
      };
    }
    const t = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, typed, text, reduce]);

  // Seite gewechselt: sofort verabschieden
  useEffect(() => {
    if (!away) return;
    const t = setTimeout(leave, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [away]);

  const blurProps = useAnimatedProps(() => ({ intensity: BLUR * backdrop.get() }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));
  const lunaStyle = useAnimatedStyle(() => ({
    opacity: lunaOpacity.get(),
    transform: [
      { translateY: flyY.get() },
      { rotate: `${tilt.get()}deg` },
      { scale: flyScale.get() },
      { scaleX: 2 - squash.get() },
      { scaleY: squash.get() },
    ],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, bubble.get() * 1.4),
    transform: [{ translateY: (1 - bubble.get()) * -14 }, { scale: 0.7 + 0.3 * bubble.get() }],
  }));

  const shown = text.slice(0, typed);
  return (
    <View style={styles.layer} accessibilityViewIsModal accessibilityLiveRegion="polite">
      {/* Hintergrund: im Browser/Mac per CSS, auf dem Handy echtes iOS-Blur */}
      {WEB ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, WEB_BLUR, tintStyle]} />
      ) : (
        <>
          <AnimatedBlur pointerEvents="none" tint="dark" animatedProps={blurProps} style={StyleSheet.absoluteFill} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint, tintStyle]} />
        </>
      )}
      <Pressable
        style={styles.center}
        onPress={leave}
        accessibilityRole="button"
        accessibilityLabel={`Luna: ${text}. Antippen zum Schließen`}>
        <Animated.View style={lunaStyle} testID="greeting-luna">
          <NexyAvatar size={size} mood={mood} />
        </Animated.View>
        <Animated.View style={[styles.bubble, bubbleStyle]} testID="greeting-bubble">
          <View style={styles.tail} />
          {/* volle Länge unsichtbar vorhalten, damit die Blase beim Tippen nicht wächst */}
          <Text style={[styles.text, styles.ghost]}>{text}</Text>
          <Text style={[styles.text, styles.typed]}>{shown}</Text>
        </Animated.View>
        <Animated.Text style={[styles.hint, bubbleStyle]}>Antippen zum Schließen</Animated.Text>
      </Pressable>
    </View>
  );
}

const WEB_BLUR = {
  backgroundColor: 'rgba(0,0,0,0.38)',
  backdropFilter: 'blur(18px) saturate(140%)',
  WebkitBackdropFilter: 'blur(18px) saturate(140%)',
} as unknown as ViewStyle;

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 950 },
  tint: { backgroundColor: 'rgba(0,0,0,0.28)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xxl, paddingHorizontal: Spacing.xl },
  bubble: {
    maxWidth: 440,
    backgroundColor: 'rgba(28,28,31,0.96)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  tail: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    width: 16,
    height: 16,
    backgroundColor: 'rgba(28,28,31,0.96)',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    transform: [{ rotate: '45deg' }],
  },
  text: { color: Colors.text, fontSize: 20, lineHeight: 27, fontWeight: '600' },
  ghost: { opacity: 0 },
  typed: { position: 'absolute', top: 16, left: 22, right: 22 },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '500' },
});
