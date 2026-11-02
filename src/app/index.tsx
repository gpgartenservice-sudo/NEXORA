import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type HostInstance,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  Extrapolation,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginForm } from '@/components/auth/login-form';
import { wordmarkHeight } from '@/components/brand/letters';
import { Wordmark } from '@/components/brand/wordmark';
import { IntroAnimation, type LogoTarget } from '@/components/intro/intro-animation';
import { Colors, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

const LOGO_WIDTH = 190;
const GLOW = require('@/assets/images/glow.png');

/**
 * Startbildschirm: erst die Logo-Animation, danach fliegt der Schriftzug
 * nach oben und der Anmelde-Screen blendet darunter ein.
 */
export default function WelcomeScreen() {
  const reduceMotion = useReducedMotion();
  const [introDone, setIntroDone] = useState(reduceMotion);
  const [registerHint, setRegisterHint] = useState(false);

  // 0 = Intro läuft, 1 = Anmelde-Screen vollständig sichtbar
  const exitProgress = useSharedValue(reduceMotion ? 1 : 0);
  const logoTarget = useSharedValue<LogoTarget | null>(null);
  const logoSlot = useRef<HostInstance>(null);
  const registerLink = useHover();

  const measureLogoSlot = () => {
    logoSlot.current?.measureInWindow((x, y, width) => {
      if (width > 0) logoTarget.set({ x, y, width });
    });
  };

  const contentStyle = useAnimatedStyle(() => {
    const p = interpolate(exitProgress.get(), [0.35, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ translateY: (1 - p) * 18 }] };
  });

  const ambientStyle = useAnimatedStyle(() => ({ opacity: 0.07 * exitProgress.get() }));

  return (
    <View style={styles.root}>
      {/* sanfter Lichtschein oben hinter dem Logo */}
      <Animated.View pointerEvents="none" style={[styles.ambient, ambientStyle]}>
        <Image source={GLOW} style={styles.fill} contentFit="fill" />
      </Animated.View>

      <SafeAreaView style={styles.root}>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.column}>
              <View
                ref={logoSlot}
                onLayout={measureLogoSlot}
                style={[styles.logoSlot, { width: LOGO_WIDTH, height: wordmarkHeight(LOGO_WIDTH) }]}>
                {introDone && <Wordmark width={LOGO_WIDTH} />}
              </View>

              <Animated.View style={[styles.content, contentStyle]}>
                <View style={styles.header}>
                  <Text style={styles.title}>Willkommen zurück</Text>
                  <Text style={styles.subtitle}>Melde dich an, um weiterzumachen.</Text>
                </View>

                <LoginForm />

                <View style={styles.footer}>
                  <Text style={styles.footerText}>Noch kein Konto?</Text>
                  <Pressable
                    onPress={() => setRegisterHint(true)}
                    accessibilityRole="link"
                    {...registerLink.hoverProps}>
                    <Text style={[styles.footerLink, registerLink.hovered && styles.footerLinkHover]}>
                      Jetzt registrieren
                    </Text>
                  </Pressable>
                </View>
                {registerHint && (
                  <Text style={styles.hint}>Die Registrierung folgt im nächsten Schritt.</Text>
                )}
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {!introDone && (
        <IntroAnimation
          target={logoTarget}
          exitProgress={exitProgress}
          onFinished={() => setIntroDone(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  fill: { width: '100%', height: '100%' },
  ambient: { position: 'absolute', top: -260, left: '50%', marginLeft: -450, width: 900, height: 620 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  column: { width: '100%', maxWidth: 380, alignSelf: 'center', alignItems: 'center' },
  logoSlot: { marginBottom: Spacing.xxxl },
  content: { width: '100%', gap: Spacing.xxl },
  header: { gap: Spacing.sm, alignItems: 'center' },
  title: { color: Colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xs },
  footerText: { color: Colors.textMuted, fontSize: 14 },
  footerLink: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  footerLinkHover: { textDecorationLine: 'underline' },
  hint: { color: Colors.textFaint, fontSize: 13, textAlign: 'center', marginTop: -Spacing.lg },
});
