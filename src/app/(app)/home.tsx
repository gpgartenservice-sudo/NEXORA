import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand/wordmark';
import { Button } from '@/components/ui/button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { firstName, useAuth } from '@/providers/auth-provider';

/**
 * Vorläufige Startseite nach der Anmeldung. Hier kommen als Nächstes das
 * Onboarding und das Dashboard hin.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const name = firstName(user);

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.column}>
        <Wordmark width={150} style={styles.logo} />
        <Text style={styles.title}>{name ? `Hallo ${name} 👋` : 'Hallo 👋'}</Text>
        <Text style={styles.subtitle}>Du bist angemeldet{user?.email ? ` als ${user.email}` : ''}.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Als Nächstes</Text>
          <Text style={styles.cardText}>
            Hier entsteht dein Onboarding und danach dein persönliches Dashboard.
          </Text>
        </View>

        <Button label="Abmelden" variant="secondary" onPress={signOut} loading={signingOut} style={styles.button} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center' },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  logo: { alignSelf: 'center', marginBottom: Spacing.xxl },
  title: { color: Colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { color: Colors.textMuted, fontSize: 15, textAlign: 'center' },
  card: {
    marginTop: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  cardText: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  button: { marginTop: Spacing.lg },
});
