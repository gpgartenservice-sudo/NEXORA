import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassBackdrop, glassSurface } from '@/components/ui/glass';
import { Colors, Spacing } from '@/constants/theme';
import { NexyAvatar } from '@/features/assistant/nexy-avatar';
import { useProfile } from '@/providers/profile-provider';

import { lunaQuip } from './content';

const KEY = 'nexora.last-open';
const SHOW_MS = 5500;
/** Einmal pro App-Start */
let shownThisStart = false;

/**
 * Luna meldet sich kurz oben auf der Startseite – mit einem lockeren Spruch, wenn es
 * passt (spät abends, nach ein paar Tagen Pause, Montagmorgen …), und verschwindet wieder.
 */
export function LunaToast() {
  const pathname = usePathname();
  const { profile } = useProfile();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState<string | null>(null);
  const decided = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

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
      const quip = lunaQuip(new Date(), last && !Number.isNaN(last.getTime()) ? last : null, name);
      if (!quip) return;
      timers.current.push(
        setTimeout(() => setText(quip), 1400),
        setTimeout(() => setText(null), 1400 + SHOW_MS),
      );
    })();
  }, [pathname, profile]);

  // Beim Verlassen der Startseite sofort weg
  if (!text || pathname !== '/home') return null;
  return (
    <Animated.View
      entering={SlideInUp.springify().damping(16)}
      exiting={FadeOutUp.duration(300)}
      style={[styles.wrap, { top: insets.top + Spacing.md }]}
      pointerEvents="box-none">
      <Pressable onPress={() => setText(null)} style={[styles.toast, glassSurface]} accessibilityRole="alert">
        <GlassBackdrop radius={22} />
        <NexyAvatar size={38} mood="happy" />
        <Text style={styles.text}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 900, paddingHorizontal: Spacing.lg },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    maxWidth: 460,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(21,21,23,0.96)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  text: { color: Colors.text, fontSize: 15, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
});
