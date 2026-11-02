import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { LETTER_IMAGES, LETTER_LAYOUT, WORDMARK_ASPECT_RATIO } from '@/components/brand/letters';

const GLOW = require('@/assets/images/glow.png');
const SIZE = 168;
const RINGS = 3;

/** Abschluss-Effekt: das N springt herein, Lichtringe pulsieren nach außen. */
export function SuccessBurst() {
  const pop = useSharedValue(0);
  const wave = useSharedValue(0);

  useEffect(() => {
    pop.set(withDelay(150, withSpring(1, { damping: 9, stiffness: 140 })));
    wave.set(withDelay(350, withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1)));
  }, [pop, wave]);

  // Proportionen des N wie im Schriftzug
  const n = LETTER_LAYOUT[0];
  const nHeight = 64;
  const nWidth = (n.width * WORDMARK_ASPECT_RATIO) * nHeight;

  const nStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.get() * 1.4),
    transform: [{ scale: 0.4 + 0.6 * pop.get() }, { rotate: `${(1 - pop.get()) * -12}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.45 * Math.min(1, pop.get()) }));

  return (
    <View style={styles.wrap} accessible={false}>
      <Animated.View style={[styles.glow, glowStyle]}>
        <Image source={GLOW} style={styles.fill} contentFit="fill" />
      </Animated.View>
      {Array.from({ length: RINGS }, (_, i) => (
        <Ring key={i} wave={wave} offset={i / RINGS} />
      ))}
      <Animated.View style={[{ width: nWidth, height: nHeight }, nStyle]}>
        <Image source={LETTER_IMAGES.N} style={styles.fill} contentFit="fill" />
      </Animated.View>
    </View>
  );
}

function Ring({ wave, offset }: { wave: SharedValue<number>; offset: number }) {
  const style = useAnimatedStyle(() => {
    const p = (wave.get() + offset) % 1;
    return {
      opacity: wave.get() === 0 ? 0 : 0.5 * (1 - p),
      transform: [{ scale: 0.55 + 1.1 * p }],
    };
  });
  return <Animated.View style={[styles.ring, style]} />;
}

const styles = StyleSheet.create({
  wrap: { width: SIZE * 1.6, height: SIZE * 1.6, alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  glow: { position: 'absolute', width: SIZE * 1.8, height: SIZE * 1.8 },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
});
