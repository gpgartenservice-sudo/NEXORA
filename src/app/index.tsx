import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';

import { AUTH_LOGO_WIDTH, AuthFooter, AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { wordmarkHeight } from '@/components/brand/letters';
import { Wordmark } from '@/components/brand/wordmark';
import { IntroAnimation, type LogoTarget } from '@/components/intro/intro-animation';
import { TextLink } from '@/components/ui/text-link';
import { useAuth } from '@/providers/auth-provider';

/** Das Intro läuft nur beim ersten Öffnen, nicht bei jeder Rückkehr zur Anmeldung. */
let introAlreadyPlayed = false;

/**
 * Startadresse. Links zu Online-Angeboten kommen als „/?angebot=…“ (das
 * funktioniert auf jedem Webspace) und führen direkt zur Angebotsseite.
 */
export default function StartScreen() {
  const { angebot } = useLocalSearchParams<{ angebot?: string }>();
  if (typeof angebot === 'string' && angebot) {
    return <Redirect href={{ pathname: '/angebot/[token]', params: { token: angebot } }} />;
  }
  return <WelcomeScreen />;
}

/**
 * Startbildschirm: erst die Logo-Animation, danach fliegt der Schriftzug
 * nach oben und der Anmelde-Screen blendet darunter ein. Wer schon
 * angemeldet ist, landet nach dem Intro direkt in der App.
 */
function WelcomeScreen() {
  const reduceMotion = useReducedMotion();
  const { session, initializing } = useAuth();
  const [introDone, setIntroDone] = useState(reduceMotion || introAlreadyPlayed);
  // Inhalte blenden ein, sobald der Schriftzug nach oben fliegt
  const [contentReady, setContentReady] = useState(introDone);

  // 0 = Intro läuft, 1 = Anmelde-Screen vollständig sichtbar
  const exitProgress = useSharedValue(introDone ? 1 : 0);
  const logoTarget = useSharedValue<LogoTarget | null>(null);
  const logoSlot = useRef<HostInstance>(null);

  const measureLogoSlot = () => {
    logoSlot.current?.measureInWindow((x, y, width) => {
      if (width > 0) logoTarget.set({ x, y, width });
    });
  };

  // Angemeldet: der Schriftzug fliegt nicht in den Anmelde-Screen, sondern blendet aus
  useEffect(() => {
    if (session) logoTarget.set(null);
  }, [session, logoTarget]);

  const contentStyle = useAnimatedStyle(() => {
    const p = interpolate(exitProgress.get(), [0.35, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ translateY: (1 - p) * 18 }] };
  });
  const ambientStyle = useAnimatedStyle(() => ({ opacity: 0.07 * exitProgress.get() }));

  const finishIntro = () => {
    introAlreadyPlayed = true;
    setIntroDone(true);
  };

  if (introDone && !initializing && session) {
    return <Redirect href="/home" />;
  }

  return (
    <View style={styles.root}>
      {!session && (
        <AuthShell
          title="Willkommen zurück"
          subtitle="Melde dich an, um weiterzumachen."
          contentStyle={contentStyle}
          ambientStyle={ambientStyle}
          ready={contentReady}
          logo={
            <View
              ref={logoSlot}
              onLayout={measureLogoSlot}
              style={{ width: AUTH_LOGO_WIDTH, height: wordmarkHeight(AUTH_LOGO_WIDTH) }}>
              {introDone && <Wordmark width={AUTH_LOGO_WIDTH} />}
            </View>
          }
          footer={
            <AuthFooter text="Noch kein Konto?">
              <TextLink label="Jetzt registrieren" emphasis onPress={() => router.push('/register')} />
            </AuthFooter>
          }>
          <LoginForm />
        </AuthShell>
      )}

      {!introDone && (
        <IntroAnimation
          target={logoTarget}
          exitProgress={exitProgress}
          onExitStart={() => setContentReady(true)}
          onFinished={finishIntro}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
