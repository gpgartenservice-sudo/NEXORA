import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand/wordmark';
import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { goalLabel, industryLabel, stageLabel } from '@/features/onboarding/options';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useProfile } from '@/providers/profile-provider';

/**
 * Vorläufige Startseite nach der Anmeldung. Hier entsteht als Nächstes das
 * Dashboard.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const name = profile?.display_name?.trim().split(/\s+/)[0] ?? '';

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/');
  };

  const rows: [string, string | undefined][] = [
    ['Phase', stageLabel(profile?.stage)],
    ['Business', profile?.business_name ?? undefined],
    ['Branche', industryLabel(profile?.industry)],
    ['Schwerpunkte', profile?.goals?.length ? profile.goals.map(goalLabel).join(' · ') : undefined],
  ];

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Reveal>
            <Wordmark width={150} style={styles.logo} />
          </Reveal>
          <AnimatedTitle text={name ? `Hallo ${name} 👋` : 'Hallo 👋'} style={styles.title} delay={150} />
          <Reveal delay={350}>
            <Text style={styles.subtitle}>Du bist angemeldet{user?.email ? ` als ${user.email}` : ''}.</Text>
          </Reveal>

          <Reveal delay={480}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Dein Profil</Text>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value ?? '–'}</Text>
                </View>
              ))}
              <View style={styles.editRow}>
                <TextLink label="Antworten ändern" onPress={() => router.push('/onboarding')} />
              </View>
            </View>
          </Reveal>

          <Reveal delay={600}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Als Nächstes</Text>
              <Text style={styles.cardText}>Hier entsteht dein persönliches Dashboard – passend zu deinen Antworten.</Text>
            </View>
          </Reveal>

          <Reveal delay={720}>
            <Button label="Abmelden" variant="secondary" onPress={signOut} loading={signingOut} />
          </Reveal>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.xxxl },
  column: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  logo: { alignSelf: 'center', marginBottom: Spacing.xl },
  title: { color: Colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: Colors.textMuted, fontSize: 15, textAlign: 'center' },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  cardText: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.lg },
  rowLabel: { color: Colors.textFaint, fontSize: 14 },
  rowValue: { color: Colors.text, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  editRow: { alignItems: 'flex-end', marginTop: Spacing.xs },
});
