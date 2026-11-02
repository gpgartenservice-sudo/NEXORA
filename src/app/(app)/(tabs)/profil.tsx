import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { goalLabel, industryLabel, stageLabel } from '@/features/onboarding/options';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useProfile } from '@/providers/profile-provider';

/** Konto, Onboarding-Antworten und Abmelden. */
export default function ProfileScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const name = profile?.display_name?.trim() || 'Dein Profil';

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/');
  };

  const rows: [string, string | undefined][] = [
    ['Name', profile?.display_name ?? undefined],
    ['E-Mail', user?.email],
    ['Phase', stageLabel(profile?.stage)],
    ['Business', profile?.business_name ?? undefined],
    ['Branche', industryLabel(profile?.industry)],
    ['Schwerpunkte', profile?.goals?.length ? profile.goals.map(goalLabel).join(' · ') : undefined],
  ];

  return (
    <Screen maxWidth={640}>
      <View style={styles.header}>
        <Reveal>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        </Reveal>
        <AnimatedTitle text={name} style={styles.title} delay={100} />
        {!!user?.email && (
          <Reveal delay={250}>
            <Text style={styles.subtitle}>{user.email}</Text>
          </Reveal>
        )}
      </View>

      <Reveal delay={350}>
        <Card>
          <Text style={styles.cardTitle}>Deine Angaben</Text>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value ?? '–'}</Text>
            </View>
          ))}
          <View style={styles.editRow}>
            <TextLink label="Antworten ändern" emphasis onPress={() => router.push('/onboarding')} />
          </View>
        </Card>
      </Reveal>

      <Reveal delay={480}>
        <Button label="Abmelden" variant="secondary" onPress={signOut} loading={signingOut} />
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xl },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    boxShadow: '0 0 40px rgba(255,255,255,0.18)',
  },
  avatarText: { color: Colors.background, fontSize: 32, fontWeight: '800' },
  title: { color: Colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: Colors.textMuted, fontSize: 15 },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.lg },
  rowLabel: { color: Colors.textFaint, fontSize: 14 },
  rowValue: { color: Colors.text, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  editRow: { alignItems: 'flex-end', marginTop: Spacing.xs },
});
