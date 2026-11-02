import { Redirect, Stack, useSegments } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';
import { ProfileProvider, useProfile } from '@/providers/profile-provider';

/** Alles in (app)/ ist nur für angemeldete Nutzer sichtbar. */
export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return <View style={styles.blank} />;
  if (!session) return <Redirect href="/" />;

  return (
    <ProfileProvider userId={session.user.id}>
      <ProfileGate />
    </ProfileProvider>
  );
}

/** Wer das Onboarding noch nicht abgeschlossen hat, wird dorthin geleitet. */
function ProfileGate() {
  const { profile, loading, error, reload } = useProfile();
  const segments = useSegments();
  const onOnboarding = segments.at(-1) === 'onboarding';

  if (loading && !profile) return <View style={styles.blank} />;

  if (error) {
    return (
      <View style={[styles.blank, styles.center]}>
        <View style={styles.message}>
          <Text style={styles.title}>{error === 'setup' ? 'Datenbank noch nicht eingerichtet' : 'Profil konnte nicht geladen werden'}</Text>
          <Text style={styles.text}>
            {error === 'setup'
              ? 'Im Supabase-Dashboard unter „SQL Editor“ einmal das Skript aus supabase/migrations ausführen (Anleitung: supabase/README.md).'
              : 'Prüfe deine Internetverbindung und versuch es erneut.'}
          </Text>
          <Button label="Erneut versuchen" variant="secondary" onPress={reload} />
        </View>
      </View>
    );
  }

  if (!profile?.onboarding_completed_at && !onOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: Colors.background } }} />;
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  message: { maxWidth: 420, gap: Spacing.lg },
  title: { color: Colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  text: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
