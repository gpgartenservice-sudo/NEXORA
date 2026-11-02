import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand/wordmark';
import { Colors, Spacing } from '@/constants/theme';

export const AUTH_LOGO_WIDTH = 190;
const GLOW = require('@/assets/images/glow.png');

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Unter dem Formular, z. B. "Noch kein Konto? Registrieren" */
  footer?: ReactNode;
  /** Eigener Logo-Bereich (Startseite: Ziel der Intro-Animation). Standard: Schriftzug. */
  logo?: ReactNode;
  /** Für das Einblenden nach dem Intro */
  contentStyle?: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  ambientStyle?: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
};

/**
 * Gemeinsamer Rahmen aller Anmelde-Screens: Logo oben, Titel, Formular.
 * Logo und Spalte stehen auf jedem Screen exakt an derselben Stelle, so
 * wirken die Wechsel zwischen den Screens ruhig.
 */
export function AuthShell({ title, subtitle, children, footer, logo, contentStyle, ambientStyle }: Props) {
  return (
    <View style={styles.root}>
      {/* sanfter Lichtschein oben hinter dem Logo */}
      <Animated.View pointerEvents="none" style={[styles.ambient, ambientStyle]}>
        <Image source={GLOW} style={styles.fill} contentFit="fill" />
      </Animated.View>

      <SafeAreaView style={styles.root}>
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.column}>
              <View style={styles.logo}>{logo ?? <Wordmark width={AUTH_LOGO_WIDTH} />}</View>

              <Animated.View style={[styles.content, contentStyle]}>
                <View style={styles.header}>
                  <Text style={styles.title} accessibilityRole="header">
                    {title}
                  </Text>
                  {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>

                {children}

                {footer}
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** Zeile "Text + Link" unter dem Formular. */
export function AuthFooter({ text, children }: { text?: string; children: ReactNode }) {
  return (
    <View style={styles.footer}>
      {!!text && <Text style={styles.footerText}>{text}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  ambient: {
    position: 'absolute',
    top: -260,
    left: '50%',
    marginLeft: -450,
    width: 900,
    height: 620,
    opacity: 0.07,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  column: { width: '100%', maxWidth: 380, alignSelf: 'center', alignItems: 'center' },
  logo: { marginBottom: Spacing.xxxl },
  content: { width: '100%', gap: Spacing.xxl },
  header: { gap: Spacing.sm, alignItems: 'center' },
  title: { color: Colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  footerText: { color: Colors.textMuted, fontSize: 14 },
});
