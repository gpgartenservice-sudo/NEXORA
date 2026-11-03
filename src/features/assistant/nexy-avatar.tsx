import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

import { Colors } from '@/constants/theme';

export type NexyMood = 'idle' | 'thinking' | 'happy' | 'listening' | 'talking';

type Props = {
  size?: number;
  mood?: NexyMood;
  /** false = ruhig (z. B. ältere Nachrichten im Verlauf) */
  animate?: boolean;
  /** Reagiert auf Maus (Hover = freut sich, Klick = Stupser) */
  interactive?: boolean;
  /** Kleine Sprechblase beim Anstupsen (für die große Figur) */
  talk?: boolean;
  /** Lautstärke am Mikrofon 0..1 (beim Zuhören) */
  level?: SharedValue<number>;
};

const EYE = '#F2FFF9';
const PUPIL = '#0A1C15';
const CHEEK = '#FF8FB8';
const ease = Easing.inOut(Easing.sin);
const SPRING = { damping: 14, stiffness: 120, mass: 0.8 };
const REACTIONS = ['Hihi!', 'Das kitzelt!', 'Hey du!', 'Na, was steht an?', 'Ich bin bereit!', 'Huch!'];
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Nexy – die Figur des Assistenten: leuchtende Kugel mit großen Augen,
 * Bäckchen, Mund und Antenne.
 *
 * - Schaut der Maus hinterher, beugt sich bei Nähe zu ihr und macht große Augen
 * - Hover: freut sich (^^), Klick: wird zusammengedrückt, Funken + Sprechblase
 * - Schwebt (mit Schatten), atmet, blinzelt, die Antenne wippt nach
 * - Nachdenken: Punkte kreisen, Mund "o"; erledigt: strahlt
 * - Zuhören: große Augen, Schallringe und Antenne folgen der Stimme
 * - Sprechen: der Mund bewegt sich
 * - Ohne Mausbewegung wird Nexy irgendwann schläfrig – und wacht wieder auf
 * - Bei "Bewegung reduzieren" bleibt Nexy ruhig
 */
export function NexyAvatar({
  size: S = 40,
  mood = 'idle',
  animate = true,
  interactive = false,
  talk = false,
  level,
}: Props) {
  const reduce = useReducedMotion();
  const moving = animate && !reduce;
  const tracking = moving && Platform.OS === 'web';
  const ref = useRef<ViewInstance>(null);

  // Bewegung
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const near = useSharedValue(0);
  const float = useSharedValue(0);
  const breathe = useSharedValue(0);
  const blink = useSharedValue(1);
  const glow = useSharedValue(0.55);
  const spin = useSharedValue(0);
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const jump = useSharedValue(0);
  const burst = useSharedValue(1);
  const sway = useSharedValue(0);
  const mouthOpen = useSharedValue(0);
  const attentive = useSharedValue(0);
  const noLevel = useSharedValue(0);
  const voice = level ?? noLevel;

  // Zustände, die das Aussehen umschalten
  const [hovered, setHovered] = useState(false);
  const [booped, setBooped] = useState(false);
  const [drowsy, setDrowsy] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const lastMove = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const happy = mood === 'happy' || hovered || booped;
  const thinking = mood === 'thinking';
  const listening = mood === 'listening';
  const talking = mood === 'talking';
  // nur im Ruhezustand schläfrig (beim Zuhören/Sprechen bewegt niemand die Maus)
  const sleepy = drowsy && mood === 'idle';

  // Grundbewegung: schweben, atmen, blinzeln, leuchten, Antenne
  useEffect(() => {
    for (const v of [float, breathe, blink, glow, spin, sway]) cancelAnimation(v);
    if (!moving) {
      float.set(0);
      breathe.set(0);
      blink.set(1);
      sway.set(0);
      spin.set(0);
      glow.set(thinking ? 0.85 : 0.6);
      return;
    }
    const slow = sleepy ? 1.8 : 1;
    const d = S * 0.04;
    float.set(
      withRepeat(
        withSequence(
          withTiming(-d, { duration: 1700 * slow, easing: ease }),
          withTiming(d, { duration: 1700 * slow, easing: ease }),
        ),
        -1,
        true,
      ),
    );
    breathe.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1700 * slow, easing: ease }),
          withTiming(0, { duration: 1700 * slow, easing: ease }),
        ),
        -1,
        true,
      ),
    );
    sway.set(
      withRepeat(
        withSequence(withTiming(5, { duration: 1300, easing: ease }), withTiming(-5, { duration: 1300, easing: ease })),
        -1,
        true,
      ),
    );
    blink.set(
      sleepy
        ? 1
        : withRepeat(
            withSequence(
              withDelay(2400, withTiming(0.08, { duration: 70 })),
              withTiming(1, { duration: 120 }),
              withDelay(3100, withTiming(0.08, { duration: 70 })),
              withTiming(1, { duration: 100 }),
              withTiming(0.08, { duration: 70 }),
              withTiming(1, { duration: 120 }),
            ),
            -1,
          ),
    );
    if (thinking) {
      glow.set(
        withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0.6, { duration: 600 })), -1, true),
      );
      spin.set(0);
      spin.set(withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1));
    } else {
      glow.set(
        withRepeat(
          withSequence(
            withTiming(sleepy ? 0.45 : 0.9, { duration: 2200, easing: ease }),
            withTiming(sleepy ? 0.3 : 0.5, { duration: 2200, easing: ease }),
          ),
          -1,
          true,
        ),
      );
    }
  }, [moving, thinking, sleepy, S, float, breathe, blink, glow, spin, sway]);

  // Freude bei "happy" (z. B. nach dem Ausführen)
  useEffect(() => {
    if (!moving || mood !== 'happy') return;
    jump.set(
      withSequence(
        withTiming(-S * 0.14, { duration: 180, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 7, stiffness: 220 }),
      ),
    );
    burst.set(0);
    burst.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [mood, moving, S, jump, burst]);

  // Zuhören: aufmerksam (große Augen)
  useEffect(() => {
    attentive.set(moving ? withSpring(listening ? 1 : 0, SPRING) : listening ? 1 : 0);
  }, [listening, moving, attentive]);

  // Sprechen: Mund geht auf und zu
  useEffect(() => {
    cancelAnimation(mouthOpen);
    if (!talking) {
      mouthOpen.set(moving ? withTiming(0, { duration: 160 }) : 0);
      return;
    }
    if (!moving) {
      mouthOpen.set(0.5);
      return;
    }
    mouthOpen.set(
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: 110 }),
          withTiming(0.3, { duration: 90 }),
          withTiming(0.75, { duration: 120 }),
          withTiming(0.15, { duration: 140 }),
          withTiming(1, { duration: 100 }),
          withTiming(0.45, { duration: 110 }),
          withTiming(0.8, { duration: 90 }),
          withTiming(0.1, { duration: 180 }),
        ),
        -1,
      ),
    );
  }, [talking, moving, mouthOpen]);

  // Blick: der Maus folgen (Mac/Web), sonst ab und zu umherschauen
  useEffect(() => {
    if (!moving) {
      lookX.set(0);
      lookY.set(0);
      near.set(0);
      return;
    }
    if (thinking) {
      // nachdenklich nach oben schauen und hin und her
      lookY.set(withTiming(-0.6, { duration: 300 }));
      lookX.set(
        withRepeat(
          withSequence(
            withTiming(-0.7, { duration: 500, easing: ease }),
            withTiming(0.7, { duration: 1000, easing: ease }),
            withTiming(0, { duration: 500, easing: ease }),
          ),
          -1,
        ),
      );
      return () => {
        cancelAnimation(lookX);
        lookY.set(withSpring(0, SPRING));
      };
    }
    let frame = 0;
    let wanderTimer: ReturnType<typeof setTimeout> | undefined;
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;

    const wander = () => {
      wanderTimer = setTimeout(
        () => {
          if (Date.now() - lastMove.current > 2500) {
            lookX.set(withSpring((Math.random() * 2 - 1) * 0.7, SPRING));
            lookY.set(withSpring((Math.random() * 2 - 1) * 0.4, SPRING));
          }
          wander();
        },
        2200 + Math.random() * 2600,
      );
    };
    wander();
    if (!tracking) return () => clearTimeout(wanderTimer);

    const scheduleSleep = () => {
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => setDrowsy(true), 25000);
    };
    const onMove = (e: PointerEvent) => {
      lastMove.current = Date.now();
      setDrowsy((was) => {
        if (was)
          jump.set(
            withSequence(withTiming(-S * 0.12, { duration: 140 }), withSpring(0, { damping: 8, stiffness: 240 })),
          );
        return false;
      });
      scheduleSleep();
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const node = ref.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
        const rect = node?.getBoundingClientRect?.();
        if (!rect) return;
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const reach = Math.max(S * 2.2, 160);
        lookX.set(withSpring(clamp(dx / reach, -1, 1), SPRING));
        lookY.set(withSpring(clamp(dy / reach, -1, 1), SPRING));
        near.set(withSpring(clamp(1 - Math.hypot(dx, dy) / Math.max(S * 2.4, 180), 0, 1), SPRING));
      });
    };
    const onLeave = () => {
      lookX.set(withSpring(0, SPRING));
      lookY.set(withSpring(0, SPRING));
      near.set(withSpring(0, SPRING));
    };
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    scheduleSleep();
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(wanderTimer);
      clearTimeout(sleepTimer);
    };
  }, [moving, tracking, thinking, S, lookX, lookY, near, jump]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  /** Stupser: zusammendrücken, hüpfen, Funken, kurz strahlen (+ Sprechblase) */
  const boop = useCallback(() => {
    setDrowsy(false);
    setBooped(true);
    if (talk) setSpeech(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
    timers.current.push(
      setTimeout(() => setBooped(false), 1300),
      setTimeout(() => setSpeech(null), 1800),
    );
    if (reduce) return;
    squashX.set(withSequence(withTiming(1.2, { duration: 90 }), withSpring(1, { damping: 5, stiffness: 260 })));
    squashY.set(withSequence(withTiming(0.8, { duration: 90 }), withSpring(1, { damping: 5, stiffness: 260 })));
    jump.set(
      withSequence(
        withDelay(90, withTiming(-S * 0.18, { duration: 200, easing: Easing.out(Easing.quad) })),
        withSpring(0, { damping: 7, stiffness: 220 }),
      ),
    );
    burst.set(0);
    burst.set(withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) }));
  }, [talk, reduce, S, squashX, squashY, jump, burst]);

  // --- Stile ---
  const bodyStyle = useAnimatedStyle(() => {
    const tilt = lookX.get() * (3 + near.get() * 6) + (mouthOpen.get() - 0.5) * (mouthOpen.get() > 0 ? 2 : 0);
    const swell = 1 + voice.get() * 0.04 * attentive.get();
    return {
      transform: [
        { translateX: lookX.get() * S * 0.03 * (0.4 + near.get()) },
        { translateY: float.get() + jump.get() - mouthOpen.get() * S * 0.012 },
        { rotate: `${tilt}deg` },
        { scaleX: squashX.get() * (1 - breathe.get() * 0.012) * swell },
        { scaleY: squashY.get() * (1 + breathe.get() * 0.022) * swell },
      ],
    };
  });
  const shadowStyle = useAnimatedStyle(() => {
    const lift = (float.get() + jump.get()) / (S * 0.2); // negativ = höher
    return {
      opacity: clamp(0.55 + lift * 0.9, 0.15, 0.75),
      transform: [{ scaleX: clamp(1 + lift * 0.5, 0.55, 1.15) }],
    };
  });
  const glowStyle = useAnimatedStyle(() => ({
    opacity: clamp(glow.get() + near.get() * 0.25 + voice.get() * 0.5 * attentive.get() + mouthOpen.get() * 0.2, 0, 1),
  }));
  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lookX.get() * S * 0.07 }, { translateY: lookY.get() * S * 0.05 }],
  }));
  const eyeStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: blink.get() * (sleepy ? 0.42 : 1 + near.get() * 0.08 + attentive.get() * 0.12) },
      { scaleX: 1 + near.get() * 0.06 + attentive.get() * 0.06 },
    ],
  }));
  const pupilStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: lookX.get() * S * 0.036 },
      { translateY: lookY.get() * S * 0.042 },
      { scale: 1 + near.get() * 0.12 + attentive.get() * 0.14 },
    ],
  }));
  const antennaStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sway.get() - lookX.get() * 14 + jump.get() * 0.6}deg` }],
  }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const tipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + voice.get() * 0.8 * attentive.get() + attentive.get() * 0.12 + mouthOpen.get() * 0.15 }],
  }));

  // --- Maße ---
  const eyeW = S * 0.19;
  const eyeH = S * 0.23;
  const pupil = S * 0.105;
  const detail = S >= 26; // Bäckchen, Antenne, Mund erst ab dieser Größe
  const stroke = S >= 60 ? 1.6 : 1.2;
  const id = `nexy-${Math.round(S)}`;
  const mouthW = S * 0.15;

  const content = (
    <View ref={ref} style={{ width: S, height: S }} accessibilityRole="image" accessibilityLabel="Nexy">
      {/* Schatten am Boden (nur große Figur) */}
      {S >= 80 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shadow,
            { width: S * 0.62, height: S * 0.1, left: S * 0.19, top: S * 1.08, borderRadius: S },
            shadowStyle,
          ]}
        />
      )}
      {/* Zuhören: Schallringe, die der Stimme folgen */}
      {listening &&
        S >= 50 &&
        [0, 1].map((i) => <SoundRing key={i} index={i} size={S} level={voice} breathe={breathe} />)}
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        {/* Antenne */}
        {detail && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.antenna,
              { left: S / 2 - S * 0.02, top: -S * 0.15, width: S * 0.04, height: S * 0.2 },
              antennaStyle,
            ]}>
            <View style={[styles.stem, { width: S * 0.04, borderRadius: S * 0.02 }]} />
            <Animated.View
              style={[
                styles.tip,
                {
                  width: S * 0.11,
                  height: S * 0.11,
                  borderRadius: S * 0.055,
                  left: -S * 0.035,
                  top: -S * 0.06,
                  boxShadow: `0 0 ${S * 0.12}px rgba(47,227,154,0.9)`,
                },
                tipStyle,
              ]}
            />
          </Animated.View>
        )}
        {/* Leuchten */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            { borderRadius: S / 2, boxShadow: `0 0 ${S * 0.45}px ${S * 0.08}px rgba(47,227,154,0.45)` },
            glowStyle,
          ]}
        />
        {/* Körper */}
        <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`${id}-body`} cx="40%" cy="32%" r="75%">
              <Stop offset="0" stopColor="#23775A" />
              <Stop offset="0.55" stopColor="#0D261C" />
              <Stop offset="1" stopColor="#050A08" />
            </RadialGradient>
          </Defs>
          <Circle
            cx={S / 2}
            cy={S / 2}
            r={S / 2 - stroke}
            fill={`url(#${id}-body)`}
            stroke={Colors.accent}
            strokeWidth={stroke}
            strokeOpacity={0.9}
          />
          <Ellipse cx={S * 0.3} cy={S * 0.2} rx={S * 0.1} ry={S * 0.045} fill="#FFFFFF" opacity={0.08} />
        </Svg>
        {/* Gesicht */}
        <Animated.View style={[StyleSheet.absoluteFill, faceStyle]} pointerEvents="none">
          <View style={[styles.eyes, { top: S * 0.3, gap: S * 0.11 }]}>
            {happy && !thinking
              ? [0, 1].map((i) => (
                  <View
                    key={i}
                    testID={i === 0 ? 'nexy-happy-eyes' : undefined}
                    style={{
                      width: eyeW * 1.05,
                      height: eyeH * 0.55,
                      marginTop: eyeH * 0.22,
                      borderTopLeftRadius: eyeW,
                      borderTopRightRadius: eyeW,
                      borderTopWidth: S * 0.045,
                      borderLeftWidth: S * 0.045,
                      borderRightWidth: S * 0.045,
                      borderColor: EYE,
                    }}
                  />
                ))
              : [0, 1].map((i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.eye,
                      {
                        width: eyeW,
                        height: eyeH,
                        borderRadius: eyeW / 2,
                        boxShadow: `0 0 ${S * 0.09}px rgba(242,255,249,0.45)`,
                      },
                      eyeStyle,
                    ]}>
                    <Animated.View
                      testID={i === 0 ? 'nexy-pupil' : undefined}
                      style={[
                        styles.pupil,
                        { width: pupil, height: pupil * 1.15, borderRadius: pupil / 2 },
                        pupilStyle,
                      ]}>
                      <View
                        style={[
                          styles.shine,
                          {
                            width: pupil * 0.38,
                            height: pupil * 0.38,
                            borderRadius: pupil,
                            top: pupil * 0.16,
                            left: pupil * 0.16,
                          },
                        ]}
                      />
                    </Animated.View>
                  </Animated.View>
                ))}
          </View>
          {detail && (
            <>
              {/* Bäckchen */}
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.cheek,
                    {
                      width: S * 0.14,
                      height: S * 0.075,
                      borderRadius: S * 0.05,
                      top: S * 0.55,
                      opacity: happy ? 0.75 : sleepy ? 0.2 : 0.38,
                      boxShadow: `0 0 ${S * 0.05}px ${CHEEK}`,
                    },
                    i === 0 ? { left: S * 0.14 } : { right: S * 0.14 },
                  ]}
                />
              ))}
              {/* Mund */}
              <View
                style={[styles.mouth, { top: S * 0.6, left: S / 2 - mouthW / 2, width: mouthW, height: mouthW * 0.7 }]}>
                {talking ? (
                  <TalkMouth open={mouthOpen} w={mouthW} s={S} />
                ) : (
                  <Mouth kind={sleepy ? 'line' : thinking ? 'o' : happy ? 'grin' : 'smile'} w={mouthW} s={S} />
                )}
              </View>
            </>
          )}
        </Animated.View>
        {/* Schläfrig: kleines z */}
        {sleepy && S >= 60 && (
          <Animated.Text
            entering={FadeIn.duration(600)}
            style={[styles.z, { right: -S * 0.05, top: -S * 0.08, fontSize: S * 0.16 }]}>
            z
          </Animated.Text>
        )}
      </Animated.View>
      {/* Nachdenken: kreisende Punkte */}
      {thinking && moving && (
        <Animated.View pointerEvents="none" style={[styles.orbit, { margin: -S * 0.18 }, orbitStyle]}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: S * (0.11 - i * 0.025),
                  height: S * (0.11 - i * 0.025),
                  opacity: 1 - i * 0.3,
                  transform: [{ rotate: `${-i * 26}deg` }, { translateY: -S * 0.7 }],
                },
              ]}
            />
          ))}
        </Animated.View>
      )}
      {/* Funken beim Freuen/Anstupsen */}
      {moving && [0, 1, 2, 3, 4, 5].map((i) => <Sparkle key={i} index={i} size={S} burst={burst} />)}
      {/* Sprechblase */}
      {speech && (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={[styles.bubble, { left: S * 0.82, top: -S * 0.12 }]}
          pointerEvents="none">
          <Text style={styles.bubbleText} numberOfLines={1}>
            {speech}
          </Text>
        </Animated.View>
      )}
    </View>
  );

  if (!interactive) return content;
  return (
    <Pressable
      onPress={boop}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel="Nexy anstupsen"
      style={styles.press}>
      {content}
    </Pressable>
  );
}

function Mouth({ kind, w, s }: { kind: 'smile' | 'grin' | 'o' | 'line'; w: number; s: number }) {
  const h = w * 0.7;
  const sw = Math.max(1.2, s * 0.028);
  return (
    <View testID={`nexy-mouth-${kind}`}>
      <Svg width={w} height={h}>
        {kind === 'smile' && (
          <Path
            d={`M ${w * 0.18} ${h * 0.25} Q ${w / 2} ${h * 0.75} ${w * 0.82} ${h * 0.25}`}
            stroke={EYE}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {kind === 'grin' && (
          <>
            <Path d={`M ${w * 0.1} ${h * 0.18} Q ${w / 2} ${h * 1.15} ${w * 0.9} ${h * 0.18} Z`} fill={EYE} />
            <Ellipse cx={w / 2} cy={h * 0.55} rx={w * 0.17} ry={h * 0.13} fill={CHEEK} opacity={0.9} />
          </>
        )}
        {kind === 'o' && (
          <Ellipse cx={w / 2} cy={h * 0.45} rx={w * 0.16} ry={h * 0.2} stroke={EYE} strokeWidth={sw} fill="none" />
        )}
        {kind === 'line' && (
          <Path
            d={`M ${w * 0.3} ${h * 0.4} L ${w * 0.7} ${h * 0.4}`}
            stroke={EYE}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        )}
      </Svg>
    </View>
  );
}

/** Offener Mund beim Sprechen – geht im Takt auf und zu */
function TalkMouth({ open, w, s }: { open: SharedValue<number>; w: number; s: number }) {
  const sw = Math.max(1, s * 0.022);
  // offener Mund ist größer als das Lächeln, damit man ihn auch bei kleiner Figur sieht
  const mw = w * 1.1;
  const mh = w * 0.92;
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.16 + open.get() * 0.84 }, { scaleX: 1 - open.get() * 0.14 }],
  }));
  return (
    <View
      testID="nexy-mouth-talk"
      style={{ width: w, height: w * 0.7, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[styles.talkMouth, { width: mw, height: mh, borderRadius: mw / 2, borderWidth: sw }, style]}>
        <View
          style={[
            styles.tongue,
            { width: mw * 0.62, height: mh * 0.42, borderTopLeftRadius: mw, borderTopRightRadius: mw },
          ]}
        />
      </Animated.View>
    </View>
  );
}

/** Ring um Nexy beim Zuhören – wird mit der Stimme größer und heller */
function SoundRing({
  index,
  size: S,
  level,
  breathe,
}: {
  index: number;
  size: number;
  level: SharedValue<number>;
  breathe: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const l = level.get();
    return {
      opacity: clamp(0.16 + l * 0.85 - index * 0.07, 0, 0.85),
      // höchstens ~1,4-fach, damit die Ringe nichts in der Nähe überdecken
      transform: [{ scale: 1.06 + index * 0.12 + breathe.get() * 0.02 + l * (0.14 + index * 0.08) }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      testID={index === 0 ? 'nexy-sound-ring' : undefined}
      style={[styles.ring, { width: S, height: S, borderRadius: S / 2, borderWidth: Math.max(1.5, S * 0.018) }, style]}
    />
  );
}

/** Ein Funke, der beim Freuen/Anstupsen nach außen fliegt */
function Sparkle({ index, size: S, burst }: { index: number; size: number; burst: SharedValue<number> }) {
  const angle = (index / 6) * Math.PI * 2 - Math.PI / 2 + (index % 2 ? 0.25 : -0.1);
  const dist = S * (index % 2 ? 0.78 : 0.68);
  const style = useAnimatedStyle(() => {
    const b = burst.get();
    return {
      opacity: b >= 1 ? 0 : 1 - b,
      transform: [
        { translateX: Math.cos(angle) * dist * b },
        { translateY: Math.sin(angle) * dist * b },
        { rotate: '45deg' },
        { scale: 0.4 + (1 - b) * 0.8 },
      ],
    };
  });
  const d = S * (index % 2 ? 0.06 : 0.08);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sparkle,
        {
          width: d,
          height: d,
          left: S / 2 - d / 2,
          top: S / 2 - d / 2,
          backgroundColor: index % 3 === 0 ? CHEEK : Colors.accent,
        },
        style,
      ]}
    />
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
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.6 L12 4.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={2.2} r={1.3} fill={color} />
      <Circle cx={12} cy={13} r={8.6} fill="none" stroke={color} strokeWidth={strokeWidth} />
      <Ellipse cx={9.2} cy={12} rx={1.5} ry={1.9} fill={color} />
      <Ellipse cx={14.8} cy={12} rx={1.5} ry={1.9} fill={color} />
      <Path
        d="M10.4 15.6 Q12 16.9 13.6 15.6"
        stroke={color}
        strokeWidth={strokeWidth * 0.8}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: 'center' },
  shadow: {
    position: 'absolute',
    backgroundColor: 'rgba(47,227,154,0.22)',
    boxShadow: '0 0 18px rgba(47,227,154,0.35)',
  },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(47,227,154,0.08)' },
  antenna: { position: 'absolute', transformOrigin: 'bottom' },
  stem: { flex: 1, backgroundColor: Colors.accent, opacity: 0.85 },
  tip: { position: 'absolute', backgroundColor: Colors.accent },
  eyes: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  eye: { backgroundColor: EYE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pupil: { backgroundColor: PUPIL },
  shine: { position: 'absolute', backgroundColor: '#FFFFFF' },
  cheek: { position: 'absolute', backgroundColor: CHEEK },
  mouth: { position: 'absolute', alignItems: 'center' },
  z: { position: 'absolute', color: Colors.textMuted, fontWeight: '700' },
  orbit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', borderRadius: 999, backgroundColor: Colors.accent },
  sparkle: { position: 'absolute', borderRadius: 2 },
  talkMouth: {
    backgroundColor: '#06140F',
    borderColor: EYE,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tongue: { backgroundColor: CHEEK, opacity: 0.9 },
  ring: { position: 'absolute', top: 0, left: 0, borderColor: Colors.accent },
  bubble: {
    position: 'absolute',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  bubbleText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
});
