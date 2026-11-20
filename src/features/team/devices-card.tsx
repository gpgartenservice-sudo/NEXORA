import { useFocusEffect } from 'expo-router';
import { Laptop, Smartphone } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { checkThisDevice, KIND_LABEL, type AccountDevice, type DeviceKind } from '@/lib/device';

const KINDS: DeviceKind[] = ['phone', 'computer'];

/** „gerade aktiv“ oder „zuletzt aktiv 20.11., 14:03“ */
export function seenText(iso: string | null, now: number): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  if (now - t < 3 * 60_000) return 'gerade aktiv';
  const d = new Date(t);
  const day = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `zuletzt aktiv ${day}, ${time}`;
}

/**
 * Profil → Geräte: auf welchem iPhone und welchem Mac das Konto gerade angemeldet ist
 * (nur mit Abo – Gratis hat keine Gerätegrenze).
 */
export function DevicesCard() {
  const [devices, setDevices] = useState<AccountDevice[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void checkThisDevice().then((s) => {
        if (!alive) return;
        setNow(Date.now());
        setDevices(s.limited ? s.devices : null);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  if (!devices) return null;

  return (
    <Card>
      <Text style={styles.title}>Geräte</Text>
      <Text style={styles.text}>
        Mit deinem Abo ist dein Konto auf einem iPhone und einem Mac gleichzeitig angemeldet. Für ein neues Gerät
        meldest du dich zuerst auf dem alten ab.
      </Text>
      {KINDS.map((kind) => {
        const d = devices.find((x) => x.kind === kind);
        const Icon = kind === 'phone' ? Smartphone : Laptop;
        return (
          <View key={kind} style={styles.row} testID={`device-${kind}`}>
            <View style={styles.icon}>
              <Icon size={18} color={d ? Colors.text : Colors.textFaint} strokeWidth={1.8} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {d ? d.name || KIND_LABEL[kind] : `Kein ${KIND_LABEL[kind]} angemeldet`}
              </Text>
              {d && (
                <Text style={styles.sub} numberOfLines={1}>
                  {d.mine ? 'Dieses Gerät' : seenText(d.seen, now) || KIND_LABEL[kind]}
                </Text>
              )}
            </View>
            {d?.mine && <Text style={styles.badge}>Hier</Text>}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 4 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  name: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: Colors.textFaint, fontSize: 12.5 },
  badge: {
    color: Colors.accent,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.4)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
