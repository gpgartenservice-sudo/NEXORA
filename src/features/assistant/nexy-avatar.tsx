import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Colors } from '@/constants/theme';

export type NexyMood = 'idle' | 'thinking' | 'happy';

type Props = {
  size?: number;
  mood?: NexyMood;
  /** false = ruhig (z. B. ältere Nachrichten im Verlauf) */
  animate?: boolean;
};

const EYE = '#E9FFF5';
const ease = Easing.inOut(Easing.sin);

/**
 * Nexy – die Figur des Assistenten: leuchtende Kugel in Wachstums-Grün mit
 * zwei Augen. Schwebt und blinzelt, schaut beim Nachdenken umher (mit
 * kreisenden Punkten) und freut sich, wenn etwas erledigt ist.
 * Bei "Bewegung reduzieren" bleibt Nexy ruhig.
 */
export function NexyAvatar({ size = 40, mood = 'idle', animate = true }: Props) {
  const reduce = useReducedMotion();
  const moving = animate && !reduce;
  const float = useSharedValue(0);
  const blink = useSharedValue(1);
  const look = useSharedValue(0);
  const glow = useSharedValue(0.55);
  const spin = useSharedValue(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    for (const v of [float, blink, look, glow, spin]) cancelAnimation(v);
    if (!moving) {
      float.set(0);
      blink.set(1);
      look.set(0);
      glow.set(mood === 'thinking' ? 0.85 : 0.55);
      spin.set(0);
      return;
    }
    const d = size * 0.035;
    float.set(
      withRepeat(
        withSequence(withTiming(-d, { duration: 1700, easing: ease }), withTiming(d, { duration: 1700, easing: ease })),
        -1,
        true,
      ),
    );
    // Blinzeln: alle paar Sekunden, ab und zu doppelt
    blink.set(
      withRepeat(
        withSequence(
          withDelay(2600, withTiming(0.12, { duration: 70 })),
          withTiming(1, { duration: 110 }),
          withDelay(2900, withTiming(0.12, { duration: 70 })),
          withTiming(1, { duration: 100 }),
          withTiming(0.12, { duration: 70 }),
          withTiming(1, { duration: 110 }),
        ),
        -1,
      ),
    );
    if (mood === 'thinking') {
      const l = size * 0.06;
      look.set(
        withRepeat(
          withSequence(
            withTiming(-l, { duration: 420, easing: ease }),
            withTiming(l, { duration: 840, easing: ease }),
            withTiming(0, { duration: 420, easing: ease }),
          ),
          -1,
        ),
      );
      glow.set(
        withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0.6, { duration: 600 })), -1, true),
      );
      spin.set(0);
      spin.set(withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1));
    } else {
      look.set(withTiming(0, { duration: 300 }));
      glow.set(
        withRepeat(
          withSequence(
            withTiming(0.85, { duration: 2200, easing: ease }),
            withTiming(0.5, { duration: 2200, easing: ease }),
          ),
          -1,
          true,
        ),
      );
    }
    if (mood === 'happy')
      pop.set(
        withSequence(withSpring(1.12, { damping: 6, stiffness: 260 }), withSpring(1, { damping: 10, stiffness: 200 })),
      );
  }, [mood, moving, size, float, blink, look, glow, spin, pop]);

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.get() }, { scale: pop.get() }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateX: look.get() }] }));
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.get() }] }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));

  const eyeW = size * 0.13;
  const eyeH = size * 0.2;
  const gap = size * 0.13;
  const eyeTop = size * 0.36;
  const stroke = size >= 60 ? 1.6 : 1.2;
  const id = `nexy-${Math.round(size)}`;

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="Nexy">
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        {/* Leuchten */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            { borderRadius: size / 2, boxShadow: `0 0 ${size * 0.45}px ${size * 0.08}px rgba(47,227,154,0.45)` },
            glowStyle,
          ]}
        />
        {/* Körper */}
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`${id}-body`} cx="38%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#1F6B4E" />
              <Stop offset="0.55" stopColor="#0C2219" />
              <Stop offset="1" stopColor="#050A08" />
            </RadialGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - stroke}
            fill={`url(#${id}-body)`}
            stroke={Colors.accent}
            strokeWidth={stroke}
            strokeOpacity={0.9}
          />
          <Ellipse cx={size * 0.3} cy={size * 0.2} rx={size * 0.1} ry={size * 0.045} fill="#FFFFFF" opacity={0.07} />
        </Svg>
        {/* Gesicht */}
        <Animated.View style={[styles.face, { top: eyeTop, gap }, faceStyle]}>
          {mood === 'happy'
            ? [0, 1].map((i) => (
                <View
                  key={i}
                  style={{
                    width: eyeW * 1.25,
                    height: eyeH * 0.55,
                    borderTopLeftRadius: eyeW,
                    borderTopRightRadius: eyeW,
                    borderTopWidth: size * 0.04,
                    borderLeftWidth: size * 0.04,
                    borderRightWidth: size * 0.04,
                    borderColor: EYE,
                    marginTop: eyeH * 0.2,
                  }}
                />
              ))
            : [0, 1].map((i) => (
                <Animated.View
                  key={i}
                  style={[
                    {
                      width: eyeW,
                      height: eyeH,
                      borderRadius: eyeW / 2,
                      backgroundColor: EYE,
                      boxShadow: `0 0 ${size * 0.08}px rgba(233,255,245,0.6)`,
                    },
                    eyeStyle,
                  ]}
                />
              ))}
        </Animated.View>
      </Animated.View>
      {/* Nachdenken: kreisende Punkte */}
      {mood === 'thinking' && moving && (
        <Animated.View pointerEvents="none" style={[styles.orbit, { margin: -size * 0.18 }, orbitStyle]}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: size * (0.11 - i * 0.025),
                  height: size * (0.11 - i * 0.025),
                  opacity: 1 - i * 0.3,
                  transform: [{ rotate: `${-i * 26}deg` }, { translateY: -size * 0.68 }],
                },
              ]}
            />
          ))}
        </Animated.View>
      )}
    </View>
  );
}

/** Mini-Nexy als Symbol (z. B. in der Seitenleiste) – passt zu den übrigen Symbolen. */
export function NexyGlyph({
  size = 18,
  color = Colors.text,
  strokeWidth = 1.8,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9.5} fill="none" stroke={color} strokeWidth={strokeWidth} />
      <Rect x={8.2} y={8.6} width={2.4} height={4.4} rx={1.2} fill={color} />
      <Rect x={13.4} y={8.6} width={2.4} height={4.4} rx={1.2} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(47,227,154,0.08)' },
  face: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  orbit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', borderRadius: 999, backgroundColor: Colors.accent },
});
