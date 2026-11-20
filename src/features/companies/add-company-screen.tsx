import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Colors, Spacing } from '@/constants/theme';
import { EXTRA_COMPANY_PRICE, formatPrice } from '@/features/plan/plan-logic';
import { usePlan } from '@/features/plan/plan-provider';
import { playSound } from '@/features/sound/ui-sound';

import { useCompanies } from './company-provider';

const back = () => (router.canGoBack() ? router.back() : router.replace('/profil'));

const POINTS = [
  `${formatPrice(EXTRA_COMPANY_PRICE.month)} im Monat je weiterer Firma (jährlich ${formatPrice(EXTRA_COMPANY_PRICE.year)}) – mit Lunaxora Pro oder Business.`,
  'Eigene Kunden, Aufträge, Rechnungsnummern, Termine, Finanzen und ein eigenes Team.',
  'Luna-Nachrichten und Personen teilen sich alle Firmen deines Kontos.',
  'Wechseln jederzeit unter Profil → Firmen.',
];

/** Profil → Firmen → „Weitere Firma hinzufügen“: eine ganz neue Firma im selben Konto. */
export function AddCompanyScreen() {
  const { companies, missing, canAdd, create } = useCompanies();
  const { info, admin } = usePlan();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const paid = info?.plan === 'pro' || info?.plan === 'business';
  const left = companies ? companies.extraAllowed - companies.extraUsed : 0;

  const submit = async () => {
    if (!name.trim()) {
      setError('Bitte gib der Firma einen Namen.');
      return;
    }
    setBusy(true);
    setError(undefined);
    const r = await create(name);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    playSound('success');
    // neue Firma ist jetzt offen – gleich Anschrift & Co. für Angebote und Rechnungen eintragen
    router.replace('/firma');
  };

  return (
    <Screen maxWidth={560}>
      <PageHeader
        title="Weitere Firma"
        subtitle="Eine ganz neue Firma im selben Konto – getrennt von deiner bisherigen."
        back={{ label: 'Profil', onPress: back }}
      />

      <Card>
        {POINTS.map((p) => (
          <View key={p} style={styles.point}>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.body}>{p}</Text>
          </View>
        ))}
      </Card>

      {missing ? (
        <Notice>Firmen-Skript fehlt noch in der Datenbank (20261127090000_mehrere_firmen.sql).</Notice>
      ) : canAdd ? (
        <View style={styles.form}>
          <Notice tone="success">
            {admin
              ? 'Admin-Zugang: weitere Firmen sind für dich kostenlos.'
              : `Du hast noch ${left} gebuchte ${left === 1 ? 'Firma' : 'Firmen'} frei.`}
          </Notice>
          <TextField
            label="Name der Firma"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (error) setError(undefined);
            }}
            error={error}
            placeholder="z. B. Muster Webdesign"
            maxLength={120}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          <Button label="Firma anlegen" loading={busy} onPress={() => void submit()} />
        </View>
      ) : paid ? (
        <Notice>Weitere Firmen kannst du bald direkt hier zu deinem Abo dazubuchen.</Notice>
      ) : (
        <View style={styles.form}>
          <Notice>Weitere Firmen gibt es mit Lunaxora Pro und Business.</Notice>
          <Button label="Abo ansehen" variant="secondary" onPress={() => router.push('/profil/abo')} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', gap: Spacing.sm },
  dot: { color: Colors.accent, fontSize: 15, lineHeight: 21 },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21, flex: 1 },
  form: { gap: Spacing.md },
});
