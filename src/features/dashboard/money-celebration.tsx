import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { burstMoney } from '@/components/motion/money-burst';
import { Colors } from '@/constants/theme';
import { NexyAvatar, type NexyMood } from '@/features/assistant/nexy-avatar';
import { autoplayAllowed, speak, speechSupported, type Speech } from '@/features/assistant/voice';
import { formatEuro } from '@/features/crm/order-logic';
import { SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { playSound } from '@/features/sound/ui-sound';

import { setMoneyShowRunning } from './money';

/**
 * Die große Show bei einer neuen Einnahme (läuft genau einmal pro Einnahme):
 * grünes Aufleuchten, der Betrag knallt in die Mitte, drei Wellen Geldscheine (unten,
 * aus den Ecken, Regen von oben), das iPhone vibriert – und Luna kommt nebenbei
 * ins Bild und gratuliert (mit Stimme). Antippen von Luna beendet sie.
 */

type Show = { id: number; amount: number };
const listeners = new Set<(s: Show) => void>();
let showId = 0;

/** Große Einnahmen-Show starten (braucht <MoneyCelebrationHost /> im App-Rahmen). */
export function celebrateIncome(amount: number) {
  const s = { id: ++showId, amount };
  listeners.forEach((l) => l(s));
}

export function MoneyCelebrationHost() {
  const [show, setShow] = useState<Show | null>(null);
  useEffect(() => {
    const l = (s: Show) => setShow(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (!show) return null;
  return <IncomeShow key={show.id} amount={show.amount} onDone={() => setShow(null)} />;
}

const GLOW = require('@/assets/images/glow.png');
/** Tippen der Sprechblase (ms pro Zeichen) – passt ungefähr zu Lunas Sprechtempo */
const TYPE_MS = 50;

/** Was Luna sagt (Anzeige) und wie sie es ausspricht (ohne Emoji, Betrag gerundet) */
function lunaLines(amount: number): { text: string; spoken: string } {
  if (amount <= 0) {
    return { text: 'Glückwunsch zur neuen Einnahme! 🎉 Weiter so!', spoken: 'Glückwunsch zur neuen Einnahme! Weiter so!' };
  }
  const shown = formatEuro(amount);
  const said = amount >= 10 ? `${Math.round(amount).toLocaleString('de-DE')} Euro` : shown;
  const lines = [
    { text: `Glückwunsch! ${shown} mehr in der Kasse – richtig stark! 🎉`, spoken: `Glückwunsch! ${said} mehr in der Kasse. Richtig stark!` },
    { text: `Zack, ${shown} verdient! Ich bin stolz auf dich. 💚`, spoken: `Zack, ${said} verdient! Ich bin stolz auf dich.` },
    { text: `Boom! ${shown} sind drin. Weiter so! 🚀`, spoken: `Boom! ${said} sind drin. Weiter so!` },
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function haptic(kind: 'success' | 'heavy' | 'medium') {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'success'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium);
  void run.catch(() => {});
}

function IncomeShow({ amount, onDone }: { amount: number; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const [line] = useState(() => lunaLines(amount));
  const [typed, setTyped] = useState(0);
  const [typing, setTyping] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOver, setVoiceOver] = useState(false);
  const [readDone, setReadDone] = useState(false);
  const [mood, setMood] = useState<NexyMood>('happy');
  const speech = useRef<Speech | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const leaving = useRef(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const flash = useSharedValue(0);
  const amountIn = useSharedValue(0);
  const amountPunch = useSharedValue(1);
  const amountOut = useSharedValue(0);
  const lunaIn = useSharedValue(0);
  const lunaHop = useSharedValue(0);
  const bubble = useSharedValue(0);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    speech.current?.cancel();
    speech.current = null;
    setSpeaking(false);
    bubble.set(withTiming(0, { duration: 180 }));
    amountOut.set(withTiming(1, { duration: 400 }));
    lunaHop.set(withSequence(withTiming(-14, { duration: 140 }), withTiming(0, { duration: 140 })));
    lunaIn.set(withDelay(200, withTiming(0, { duration: 420, easing: Easing.in(Easing.cubic) })));
    later(700, () => done.current());
  };

  useEffect(() => {
    setMoneyShowRunning(true);
    const all = timers.current;

    // 1. Aufleuchten + Vibration + erste Welle
    haptic('success');
    playSound('money');
    flash.set(withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 900, easing: Easing.out(Easing.quad) })));
    burstMoney(36, 'bottom');
    // 2. Betrag knallt rein
    amountIn.set(withSpring(1, { damping: 9, stiffness: 170, mass: 0.9 }));
    later(380, () => {
      burstMoney(24, 'corners');
      haptic('heavy');
    });
    later(900, () => {
      burstMoney(34, 'rain');
      haptic('medium');
      amountPunch.set(withSequence(withTiming(1.14, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 260 })));
    });
    // Betrag schwebt nach oben weg, wenn die Scheine durch sind
    later(3000, () => amountOut.set(withTiming(1, { duration: 600 })));

    // 3. Luna kommt nebenbei ins Bild und gratuliert
    later(reduce ? 300 : 650, () => {
      lunaIn.set(reduce ? withTiming(1, { duration: 250 }) : withSpring(1, { damping: 12, stiffness: 120 }));
      later(450, () => {
        bubble.set(withSpring(1, { damping: 12, stiffness: 200 }));
        setMood('talking');
        if (speechSupported() && autoplayAllowed()) {
          const s = speak(line.spoken, {
            onStart: () => {
              setSpeaking(true);
              setTyping(true);
            },
          });
          speech.current = s;
          later(1400, () => setTyping(true));
          void s.done.then(() => {
            if (speech.current === s) speech.current = null;
            setSpeaking(false);
            setVoiceOver(true);
            setTyping(true);
          });
        } else {
          setVoiceOver(true);
          setTyping(true);
        }
      });
    });

    return () => {
      all.forEach(clearTimeout);
      speech.current?.cancel();
      setMoneyShowRunning(false);
    };
    // nur einmal beim Start der Show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Text tippen; danach freut sie sich und bleibt kurz zum Lesen
  useEffect(() => {
    if (!typing) return;
    if (typed >= line.text.length) {
      const a = setTimeout(() => setMood('happy'), 250);
      const b = setTimeout(() => setReadDone(true), Math.max(1800, line.text.length * 35));
      return () => {
        clearTimeout(a);
        clearTimeout(b);
      };
    }
    const t = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearTimeout(t);
  }, [typing, typed, line.text]);

  // gehen, wenn gelesen UND fertig gesprochen
  useEffect(() => {
    if (!readDone || !voiceOver) return;
    const t = setTimeout(leave, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readDone, voiceOver]);

  const glowSize = Math.max(width, height) * 1.3;
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.get() * 0.75,
    transform: [{ scale: 0.6 + flash.get() * 0.7 }],
  }));
  const amountStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, amountIn.get() * 1.5) * (1 - amountOut.get()),
    transform: [
      { translateY: -40 * amountOut.get() },
      { scale: (0.2 + 0.8 * amountIn.get()) * amountPunch.get() },
    ],
  }));
  const lunaSize = wide ? 120 : 96;
  const lunaStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, lunaIn.get() * 2),
    transform: [
      { translateY: (1 - lunaIn.get()) * (lunaSize + 160) + lunaHop.get() },
      { rotate: `${(1 - lunaIn.get()) * 18}deg` },
    ],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, bubble.get() * 1.4),
    transform: [{ translateY: (1 - bubble.get()) * 12 }, { scale: 0.75 + 0.25 * bubble.get() }],
  }));

  const amountText = amount > 0 ? `+ ${formatEuro(amount)}` : '+ Neue Einnahme';
  // passt auch lange Beträge (+ 12.345,67 €) in eine Zeile
  const amountFont = Math.round(Math.max(30, Math.min(76, (width - 32) / (amountText.length * 0.62))));

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.flash,
          { width: glowSize, height: glowSize, left: (width - glowSize) / 2, top: height * 0.35 - glowSize / 2 },
          flashStyle,
        ]}>
        <Image source={GLOW} style={StyleSheet.absoluteFill} contentFit="fill" tintColor={Colors.accent} />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.amountWrap, { top: height * 0.3 }, amountStyle]}>
        <Text style={styles.amountLabel}>NEUE EINNAHME</Text>
        {/* ohne numberOfLines: das würde den Leuchtschein am Textrand abschneiden (sichtbarer Kasten) */}
        <Text style={[styles.amount, { fontSize: amountFont, lineHeight: amountFont * 1.2 }]}>{amountText}</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.luna,
          wide ? { right: 32, bottom: 32 + insets.bottom, alignItems: 'flex-end' } : { left: 16, right: 16, bottom: 20 + insets.bottom, alignItems: 'center' },
          lunaStyle,
        ]}>
        <Pressable
          onPress={leave}
          accessibilityRole="button"
          accessibilityLabel={`Luna: ${line.text}. Antippen zum Schließen`}
          style={[styles.lunaPress, { alignItems: wide ? 'flex-end' : 'center' }]}>
          <Animated.View style={[styles.bubble, wide && styles.bubbleWide, bubbleStyle]}>
            <Text style={[styles.text, styles.ghost]}>{line.text}</Text>
            <Text style={[styles.text, styles.typed]}>{line.text.slice(0, typed)}</Text>
            <View style={[styles.tail, wide ? styles.tailRight : styles.tailCenter]} />
          </Animated.View>
          <View style={wide ? styles.avatarRight : undefined}>
            <NexyAvatar size={lunaSize} mood={speaking ? 'talking' : mood} />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 990, overflow: 'hidden' },
  flash: { position: 'absolute' },
  amountWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 4 },
  amountLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '800', letterSpacing: 2.4 },
  amount: {
    textAlign: 'center',
    color: Colors.accent,
    fontWeight: '900',
    textShadowColor: 'rgba(47,227,154,0.75)',
    textShadowRadius: 26,
    textShadowOffset: { width: 0, height: 0 },
  },
  luna: { position: 'absolute' },
  lunaPress: { gap: 10 },
  avatarRight: { alignSelf: 'flex-end' },
  bubble: {
    maxWidth: 360,
    backgroundColor: 'rgba(28,28,31,0.97)',
    borderColor: 'rgba(47,227,154,0.45)',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  bubbleWide: { maxWidth: 340 },
  tail: {
    position: 'absolute',
    bottom: -8,
    width: 16,
    height: 16,
    backgroundColor: 'rgba(28,28,31,0.97)',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(47,227,154,0.45)',
    transform: [{ rotate: '45deg' }],
  },
  tailCenter: { alignSelf: 'center' },
  tailRight: { right: 44 },
  text: { color: Colors.text, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  ghost: { opacity: 0 },
  typed: { position: 'absolute', top: 14, left: 18, right: 18 },
});
