import { MonitorSmartphone } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing } from '@/constants/theme';
import { checkThisDevice, deviceKind, KIND_LABEL, signOutHere, type DeviceStatus } from '@/lib/device';

const CHECK_EVERY_MS = 60_000;

/**
 * Pro/Business/Testphase: ein Konto läuft auf einem iPhone und einem Mac gleichzeitig.
 * Ist der Platz schon von einem anderen Gerät der gleichen Art belegt, zeigt dieses Gerät
 * den Hinweis, sich dort zuerst abzumelden (geprüft beim Öffnen, zurück in die App, jede Minute).
 */
export function DeviceGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DeviceStatus>({ active: true, limited: false, devices: [] });
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

  const retry = async () => {
    setBusy(true);
    setError(null);
    last.current = 0;
    const next = await checkThisDevice();
    setBusy(false);
    if (!next.active) setError('Das andere Gerät ist noch angemeldet. Melde dich dort unter Profil → Abmelden ab.');
    setStatus(next);
  };

  const kind = KIND_LABEL[status.otherKind ?? deviceKind()];
  return (
    <View style={styles.root}>
      <View style={styles.box}>
        <View style={styles.icon}>
          <MonitorSmartphone size={34} color={Colors.accent} strokeWidth={1.6} />
        </View>
        <Text style={styles.title}>Dein Konto ist schon auf einem anderen {kind} angemeldet</Text>
        <Text style={styles.text}>
          {status.other ? `Angemeldet auf: ${status.other}. ` : ''}Mit deinem Abo darfst du Lunaxora auf einem iPhone
          und einem Mac gleichzeitig nutzen. Melde dich zuerst auf dem anderen {kind} ab (Profil → Abmelden) – dann
          geht es hier weiter.
        </Text>
        {error && <Notice tone="error">{error}</Notice>}
        <Button label="Ich habe mich dort abgemeldet" loading={busy} onPress={() => void retry()} />
        <Button label="Hier abmelden" variant="secondary" onPress={() => void signOutHere()} />
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
