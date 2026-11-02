import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * Bausteine für das gestaffelte Einblenden von Inhalten.
 *
 * <RevealProvider ready={...}> legt fest, ab wann eingeblendet wird (z. B.
 * erst wenn das Intro fertig ist). Alles darin, was in <Reveal> oder
 * <AnimatedTitle> steckt, blendet dann mit der angegebenen Verzögerung ein.
 */

/** Weiche, "teure" Kurve: schnell los, sehr sanft auslaufend. */
export const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

const RevealContext = createContext({ ready: true });

export function RevealProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <RevealContext.Provider value={{ ready }}>{children}</RevealContext.Provider>;
}

/** Fortschritt 0 → 1, startet sobald der umgebende RevealProvider bereit ist. */
function useRevealProgress(delay: number, duration: number) {
  const { ready } = useContext(RevealContext);
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!ready) return;
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(withDelay(delay, withTiming(1, { duration, easing: EASE_OUT_EXPO })));
  }, [ready, delay, duration, reduceMotion, progress]);

  return progress;
}

type RevealProps = {
  children: ReactNode;
  /** Verzögerung in ms */
  delay?: number;
  /** Wie weit der Inhalt von unten hochgleitet (pt) */
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

/** Blendet Inhalt weich ein und lässt ihn leicht nach oben gleiten. */
export function Reveal({ children, delay = 0, distance = 16, style }: RevealProps) {
  const progress = useRevealProgress(delay, 800);
  const animated = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * distance }, { scale: 0.985 + 0.015 * p }],
    };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

type TitleProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  delay?: number;
  /** Abstand zwischen den Wörtern in ms */
  stagger?: number;
  align?: 'center' | 'left';
};

/** Überschrift, deren Wörter nacheinander aus einer leichten Unschärfe hochsteigen. */
export function AnimatedTitle({ text, style, delay = 0, stagger = 70, align = 'center' }: TitleProps) {
  const words = text.split(' ');
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={text}
      style={[styles.words, align === 'center' ? styles.center : styles.left]}>
      {words.map((word, i) => (
        <Word key={`${i}-${word}`} word={word} style={style} delay={delay + i * stagger} trailingSpace={i < words.length - 1} />
      ))}
    </View>
  );
}

function Word({
  word,
  style,
  delay,
  trailingSpace,
}: {
  word: string;
  style?: StyleProp<TextStyle>;
  delay: number;
  trailingSpace: boolean;
}) {
  const progress = useRevealProgress(delay, 900);
  const animated = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 14 }, { scale: 0.96 + 0.04 * p }],
      // Unschärfe gibt es nur im Web/auf dem Mac
      ...(Platform.OS === 'web' ? { filter: `blur(${(1 - p) * 10}px)` } : {}),
    };
  });
  return (
    <Animated.View style={animated} importantForAccessibility="no-hide-descendants" aria-hidden>
      <Text style={style}>
        {word}
        {trailingSpace ? ' ' : ''}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  words: { flexDirection: 'row', flexWrap: 'wrap' },
  center: { justifyContent: 'center' },
  left: { justifyContent: 'flex-start' },
});
