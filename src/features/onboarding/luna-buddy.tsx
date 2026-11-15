import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GlassBackdrop, glassSurface, NATIVE_GLASS } from '@/components/ui/glass';
import { Colors, Spacing } from '@/constants/theme';
import { NexyAvatar, type NexyMood } from '@/features/assistant/nexy-avatar';

/**
 * Luna im Onboarding: sitzt über der Frage und reagiert mit Sprechblase und
 * Gesichtsausdruck auf jede Antwort (Tippen = hört zu, Auswahl = freut sich).
 */
export function LunaBuddy({ message, mood = 'idle', compact }: { message: string; mood?: NexyMood; compact?: boolean }) {
  const [shown, setShown] = useState(message);
  const pop = useSharedValue(1);
  const hop = useSharedValue(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Blase kurz zusammenziehen, Text tauschen, wieder aufploppen – Luna hüpft dazu
    pop.set(withSequence(withTiming(0.86, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 260 })));
    hop.set(withSequence(withTiming(-10, { duration: 140 }), withSpring(0, { damping: 7, stiffness: 220 })));
    const t = setTimeout(() => setShown(message), 110);
    return () => clearTimeout(t);
  }, [message, pop, hop]);

  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const lunaStyle = useAnimatedStyle(() => ({ transform: [{ translateY: hop.get() }] }));
  const size = compact ? 58 : 72;

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Animated.View style={lunaStyle}>
        <NexyAvatar size={size} mood={mood} interactive />
      </Animated.View>
      <Animated.View style={[styles.bubble, glassSurface, bubbleStyle]}>
        <GlassBackdrop radius={18} />
        {!NATIVE_GLASS && <View style={styles.tail} />}
        <Text style={styles.text}>{shown}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, alignSelf: 'center', maxWidth: 460, width: '100%' },
  bubble: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    transformOrigin: 'left center',
  },
  tail: {
    position: 'absolute',
    left: -6,
    bottom: 10,
    width: 12,
    height: 12,
    backgroundColor: Colors.surfaceRaised,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    transform: [{ rotate: '45deg' }],
  },
  text: { color: Colors.text, fontSize: 15, lineHeight: 21, fontWeight: '500' },
});
