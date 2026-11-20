import { router } from 'expo-router';
import { ArrowLeftRight } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { glassHover } from '@/components/ui/glass';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';
import { switchAccount, useSavedAccounts, type SavedAccount } from '@/lib/accounts';
import { useAuth } from '@/providers/auth-provider';

/**
 * Profil, über „Abmelden“: zwischen den Konten wechseln, die auf diesem Gerät angemeldet sind,
 * und ein weiteres Konto anmelden (das aktive bleibt dabei angemeldet).
 */
export function AccountSwitcher() {
  const { user } = useAuth();
  const others = useSavedAccounts().filter((a) => a.id !== user?.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const open = async (account: SavedAccount) => {
    if (busy) return;
    playSound('tick');
    setBusy(account.id);
    setMessage(null);
    const result = await switchAccount(account.id);
    setBusy(null);
    if (result === 'ok') {
      router.replace('/home');
    } else if (result === 'offline') {
      setMessage('Keine Verbindung – versuch es gleich noch einmal.');
    } else {
      // Anmeldung abgelaufen oder dort abgemeldet: neu anmelden
      router.push({ pathname: '/profil/konto-hinzufuegen', params: { email: account.email, abgelaufen: '1' } });
    }
  };

  return (
    <View style={styles.wrap}>
      {others.length > 0 && (
        <Card>
          <Text style={styles.title}>Konto wechseln</Text>
          {others.map((a) => (
            <AccountRow key={a.id} account={a} busy={busy === a.id} onPress={() => void open(a)} />
          ))}
          {message && <Text style={styles.message}>{message}</Text>}
        </Card>
      )}
      <View style={styles.add}>
        <TextLink label="Weiteres Konto anmelden" onPress={() => router.push('/profil/konto-hinzufuegen')} />
      </View>
    </View>
  );
}

function AccountRow({ account, busy, onPress }: { account: SavedAccount; busy: boolean; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  const title = account.name || account.email;
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="button"
      accessibilityLabel={`Zu ${title} wechseln`}
      testID="switch-account"
      style={({ pressed }) => [styles.row, hovered && [styles.rowHover, glassHover], pressed && styles.pressed]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(title.trim()[0] ?? '?').toUpperCase()}</Text>
      </View>
      <View style={styles.texts}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        {!!account.name && !!account.email && (
          <Text style={styles.email} numberOfLines={1}>
            {account.email}
          </Text>
        )}
      </View>
      {busy ? <ActivityIndicator color={Colors.textMuted} /> : <ArrowLeftRight size={17} color={Colors.textMuted} strokeWidth={1.9} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  title: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginHorizontal: -Spacing.sm,
    borderRadius: 12,
  },
  rowHover: { backgroundColor: 'rgba(255,255,255,0.05)' },
  pressed: { opacity: 0.7 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  texts: { flex: 1 },
  name: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  email: { color: Colors.textFaint, fontSize: 12.5 },
  message: { color: Colors.danger, fontSize: 13.5 },
  add: { alignItems: 'center' },
});
