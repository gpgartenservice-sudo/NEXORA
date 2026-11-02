import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { LETTER_IMAGES, letterFrames, wordmarkHeight, type LetterFrame } from '@/components/brand/letters';
import { Colors } from '@/constants/theme';

import {
  damped,
  dropStart,
  easeInFall,
  easeInOutCubic,
  easeOutCubic,
  EXIT_START,
  IMPACT,
  landing,
  progress,
  T,
  TOTAL,
} from './timeline';

const GLOW = require('@/assets/images/glow.png');

/** Wohin der Schriftzug am Ende fliegt (Fensterkoordinaten). */
export type LogoTarget = { x: number; y: number; width: number };

type Props = {
  /** Position des Logos im Anmelde-Screen – dorthin fliegt der Schriftzug am Ende. */
  target: SharedValue<LogoTarget | null>;
  /** Wird von 0 auf 1 gezählt, während der Schriftzug nach oben fliegt (für das Einblenden des Anmelde-Screens). */
  exitProgress: SharedValue<number>;
  onFinished: () => void;
};

export function IntroAnimation({ target, exitProgress, onFinished }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();

  // Größe des Schriftzugs während der Animation
  const wordW = Math.min(screenW * 0.72, 640);
  const wordH = wordmarkHeight(wordW);
  const boxLeft = (screenW - wordW) / 2;
  const boxTop = (screenH - wordH) / 2;
  const frames = letterFrames(wordW);
  const nFrame = frames[0];
  // So weit muss das N anfangs nach rechts verschoben sein, um mittig zu stehen
  const nCenterOffset = wordW / 2 - (nFrame.left + nFrame.width / 2);
  // Fallhöhe: die Buchstaben starten komplett oberhalb des Fensters
  const dropDistance = boxTop + wordH + 60;

  // --- Zeitleiste --------------------------------------------------------
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(withTiming(TOTAL, { duration: TOTAL, easing: Easing.linear }));
    return () => cancelAnimation(t);
  }, [t]);

  const skip = () => {
    if (t.get() >= EXIT_START) return;
    cancelAnimation(t);
    t.set(
      withSequence(
        withTiming(EXIT_START, { duration: 0 }),
        withTiming(TOTAL, { duration: TOTAL - EXIT_START, easing: Easing.linear }),
      ),
    );
  };

  // Auf dem Mac/im Browser auch per Tastatur überspringbar
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'Enter', ' '].includes(e.key)) skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAnimatedReaction(
    () => easeInOutCubic(progress(t.get(), EXIT_START, TOTAL)),
    (p) => {
      exitProgress.set(p);
    },
  );

  useAnimatedReaction(
    () => t.get() >= TOTAL,
    (done, wasDone) => {
      if (done && !wasDone) scheduleOnRN(onFinished);
    },
  );

  // --- Hintergrund: wird am Ende durchsichtig, darunter liegt der Anmelde-Screen
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress(t.get(), EXIT_START, TOTAL),
  }));

  // --- Der ganze Schriftzug: kurzer Ruck beim Aufprall, am Ende Flug nach oben
  // (ohne Ziel – z. B. wenn man schon angemeldet ist – blendet er stattdessen aus)
  const boxStyle = useAnimatedStyle(() => {
    const exit = easeInOutCubic(progress(t.get(), EXIT_START, TOTAL));
    const thud = damped(t.get() - IMPACT, 5, 90, 160);
    const goal = target.get();
    if (!goal) {
      return {
        opacity: 1 - exit,
        transform: [{ translateY: thud * (1 - exit) }, { scale: 1 + 0.06 * exit }],
      };
    }
    const scale = goal.width / wordW;
    const goalCenterX = goal.x + goal.width / 2;
    const goalCenterY = goal.y + (goal.width / wordW) * (wordH / 2);
    return {
      opacity: 1,
      transform: [
        { translateX: exit * (goalCenterX - screenW / 2) },
        { translateY: exit * (goalCenterY - screenH / 2) + thud * (1 - exit) },
        { scale: 1 + exit * (scale - 1) },
      ],
    };
  });

  // --- Lichtschein hinter dem N (erscheint mit dem N, wandert mit nach links)
  const nGlowSize = wordH * 3.4;
  const nGlowStyle = useAnimatedStyle(() => {
    const appear = easeOutCubic(progress(t.get(), T.N_IN_START, T.N_IN_END));
    const slide = easeInOutCubic(progress(t.get(), T.N_SLIDE_START, T.N_SLIDE_END));
    return {
      opacity: appear * (0.32 - 0.22 * slide),
      transform: [
        { translateX: (1 - slide) * nCenterOffset },
        { scale: (0.85 + 0.55 * appear) - 0.4 * slide },
      ],
    };
  });

  // --- Lichtblitz hinter dem ganzen Schriftzug beim letzten Aufprall
  const flashStyle = useAnimatedStyle(() => {
    const dt = t.get() - IMPACT;
    const exit = progress(t.get(), EXIT_START, TOTAL);
    const flash = dt < 0 ? 0 : 0.5 * Math.exp(-dt / 260) + 0.1 * Math.min(1, dt / 200);
    return { opacity: flash * (1 - exit) };
  });

  // --- Das N
  const nStyle = useAnimatedStyle(() => {
    const appear = easeOutCubic(progress(t.get(), T.N_IN_START, T.N_IN_END));
    const slide = easeInOutCubic(progress(t.get(), T.N_SLIDE_START, T.N_SLIDE_END));
    return {
      opacity: appear,
      // erscheint groß in der Mitte und schrumpft beim Gleiten auf Schriftzug-Größe
      transform: [
        { translateX: (1 - slide) * nCenterOffset },
        { scale: (1.75 - 0.3 * appear) - 0.45 * slide },
      ],
    };
  });

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={skip}
      accessibilityRole="button"
      accessibilityLabel="Intro überspringen">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

      <Animated.View
        pointerEvents="none"
        style={[styles.box, { left: boxLeft, top: boxTop, width: wordW, height: wordH }, boxStyle]}>
        <Animated.View
          style={[
            styles.abs,
            { left: -wordW * 0.2, top: -wordH * 1.6, width: wordW * 1.4, height: wordH * 4.2 },
            flashStyle,
          ]}>
          <Image source={GLOW} style={styles.fill} contentFit="fill" />
        </Animated.View>

        <Animated.View
          style={[
            styles.abs,
            {
              left: nFrame.left + nFrame.width / 2 - nGlowSize / 2,
              top: wordH / 2 - nGlowSize / 2,
              width: nGlowSize,
              height: nGlowSize,
            },
            nGlowStyle,
          ]}>
          <Image source={GLOW} style={styles.fill} contentFit="fill" />
        </Animated.View>

        <Animated.View style={[styles.abs, { left: nFrame.left, width: nFrame.width, height: wordH }, nStyle]}>
          <Image source={LETTER_IMAGES.N} style={styles.fill} contentFit="fill" />
        </Animated.View>

        {frames.slice(1).map((frame, i) => (
          <FallingLetter
            key={frame.key}
            t={t}
            index={i}
            frame={frame}
            height={wordH}
            dropDistance={dropDistance}
          />
        ))}
      </Animated.View>
    </Pressable>
  );
}

type FallingLetterProps = {
  t: SharedValue<number>;
  index: number;
  frame: LetterFrame;
  height: number;
  dropDistance: number;
};

/** Ein Buchstabe, der von oben herunterfällt, kurz aufprallt und einrastet. */
function FallingLetter({ t, index, frame, height, dropDistance }: FallingLetterProps) {
  const style = useAnimatedStyle(() => {
    const start = dropStart(index);
    const land = landing(index);
    const fall = progress(t.get(), start, land);
    const dt = t.get() - land;

    // Fallen: beschleunigt von oben herab, leicht in die Länge gezogen
    let translateY = -dropDistance * (1 - easeInFall(fall));
    let scaleY = 1 + 0.18 * fall;
    let scaleX = 1 - 0.06 * fall;

    // Aufprall: kurz gestaucht, kleiner Hüpfer, dann eingerastet
    if (dt >= 0) {
      const squash = damped(dt, 0.16, 70, 210);
      scaleY = 1 - squash;
      scaleX = 1 + squash * 0.45;
      translateY = -Math.max(0, Math.sin(Math.min(1, dt / 190) * Math.PI)) * height * 0.09;
    }

    return {
      opacity: t.get() >= start ? 1 : 0,
      transform: [
        // Stauchung zur Grundlinie hin (statt zur Mitte)
        { translateY: translateY + (height * (1 - scaleY)) / 2 },
        { scaleX },
        { scaleY },
      ],
    };
  });

  return (
    <Animated.View style={[styles.abs, { left: frame.left, width: frame.width, height }, style]}>
      <Image source={LETTER_IMAGES[frame.key]} style={styles.fill} contentFit="fill" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: Colors.background },
  box: { position: 'absolute' },
  abs: { position: 'absolute', top: 0 },
  fill: { width: '100%', height: '100%' },
});

