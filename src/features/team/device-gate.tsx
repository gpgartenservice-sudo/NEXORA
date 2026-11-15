import { MonitorSmartphone } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing } from '@/constants/theme';
import { checkThisDevice, claimThisDevice, type DeviceStatus } from '@/lib/device';
import { supabase } from '@/lib/supabase';

const CHECK_EVERY_MS = 60_000;

/**
 * Pro/Business: ein Konto läuft auf einem Gerät gleichzeitig. Meldet man sich woanders an,
 * zeigt dieses Gerät beim nächsten Prüfen (Öffnen, zurück in die App, jede Minute) diesen
 * Hinweis – mit „Hier weiter nutzen“ holt man das Konto zurück.
 */
export function DeviceGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DeviceStatus>({ active: true, limited: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);

  const check = useCallback(async () => {
    if (Date.now() - last.current < 3000) return;
    last.current = Date.now();
    setStatus(await checkThisDevice());
  }, []);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return () => clearInterval(timer);
      const onFocus = () => void check();
      window.addEventListener('focus', onFocus);
      return () => {
        clearInterval(timer);
        window.removeEventListener('focus', onFocus);
      };
    }
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [check]);

  if (status.active) return <>{children}</>;

  const takeOver = async () => {
    setBusy(true);
    setError(null);
    await claimThisDevice();
    const next = await checkThisDevice();
    setBusy(false);
    if (!next.active) setError('Das hat nicht geklappt. Prüfe deine Internetverbindung und versuch es noch einmal.');
    setStatus(next);
  };

  return (
    <View style={styles.root}>
      <View style={styles.box}>
        <View style={styles.icon}>
          <MonitorSmartphone size={34} color={Colors.accent} strokeWidth={1.6} />
        </View>
        <Text style={styles.title}>Dein Konto ist auf einem anderen Gerät aktiv</Text>
        <Text style={styles.text}>
          {status.other ? `Zuletzt angemeldet: ${status.other}. ` : ''}Mit deinem Abo läuft Lunaxora auf einem Gerät
          gleichzeitig. Wenn du hier weitermachst, wird das andere Gerät pausiert.
        </Text>
        {error && <Notice tone="error">{error}</Notice>}
        <Button label="Hier weiter nutzen" loading={busy} onPress={() => void takeOver()} />
        <Button label="Abmelden" variant="secondary" onPress={() => void supabase.auth.signOut({ scope: 'local' })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  box: { width: '100%', maxWidth: 420, gap: Spacing.lg, alignItems: 'stretch' },
  icon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  text: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
