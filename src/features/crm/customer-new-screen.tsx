import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { sellerName } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { validateEmail } from '@/lib/validation';

import { useCrm } from './crm-provider';
import { listGerman, privacyGaps, sameEmail } from './invite-logic';
import { CrmSetupNotice } from './ui';

/**
 * Neuen Kunden anlegen – aus Datenschutzgründen nur über den Kunden selbst:
 * Der Nutzer gibt die E-Mail-Adresse ein, Lunaxora schickt den Link zur
 * Datenschutzerklärung, der Kunde trägt dort seine Daten ein. Erst dann
 * entsteht der Kunde (supabase/migrations/20261119090000_customer_invites.sql).
 */
export function CustomerNewScreen() {
  const { customers, invites, invitesReady, inviteCustomer, resendInvite, error } = useCrm();
  const { seller } = useDocuments();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const gaps = privacyGaps(seller);
  const existing = email.trim() ? customers.find((c) => sameEmail(c.email, email)) : undefined;

  const submit = async () => {
    const problem = email.trim() ? validateEmail(email) : 'Bitte gib die E-Mail-Adresse deines Kunden ein.';
    setEmailError(problem || undefined);
    setFailure(null);
    setSentTo(null);
    if (problem || existing) return;
    if (gaps.length) {
      setFailure(`Für die Datenschutzerklärung fehlen noch deine Firmendaten: ${listGerman(gaps)}.`);
      return;
    }
    const sender = { fromName: sellerName(seller) || 'Lunaxora', replyTo: seller.email?.trim() || null };
    setSending(true);
    // Läuft für die Adresse schon ein Link? Dann den erneut schicken.
    const open = invites.find((i) => sameEmail(i.email, email));
    const { error: err } = open ? await resendInvite(open.id, sender) : await inviteCustomer(email, sender);
    setSending(false);
    if (err) setFailure(err);
    else {
      setSentTo(email.trim());
      setEmail('');
    }
  };

  return (
    <Screen maxWidth={720}>
      <PageHeader
        title="Neuer Kunde"
        subtitle="Du brauchst nur seine E-Mail – den Rest trägt er selbst ein."
        back={{ label: 'Kunden', onPress: () => router.navigate('/kunden') }}
      />
      <CrmSetupNotice error={error} />
      {!invitesReady && (
        <Notice tone="error">
          Für den Datenschutz-Link fehlt noch das Datenbank-Skript 20261119090000_customer_invites.sql (siehe
          supabase/README.md).
        </Notice>
      )}

      <Reveal delay={250}>
        <Card>
          <View style={styles.form}>
            <TextField
              label="E-Mail *"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (emailError) setEmailError(undefined);
                if (sentTo) setSentTo(null);
              }}
              error={emailError}
              placeholder="name@beispiel.de"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={160}
              onSubmitEditing={submit}
            />
            {existing && (
              <Notice
                tone="info"
                action={<TextLink label={`Zu ${existing.name}`} onPress={() => router.push(`/kunden/${existing.id}`)} />}
              >
                {existing.name} ist mit dieser E-Mail-Adresse schon dein Kunde.
              </Notice>
            )}
            {gaps.length > 0 && (
              <Notice tone="info" action={<TextLink label="Zu den Firmendaten" onPress={() => router.navigate('/firma')} />}>
                {`Dein Kunde bestätigt deine Datenschutzerklärung. Dafür fehlen noch: ${listGerman(gaps)} – oder trag unter Firma den Link zu deiner eigenen Datenschutzerklärung ein.`}
              </Notice>
            )}
            {failure && <Notice tone="error">{failure}</Notice>}
            {sentTo && (
              <Notice tone="success" action={<TextLink label="Zur Kundenliste" onPress={() => router.navigate('/kunden')} />}>
                {`Link an ${sentTo} verschickt. Sobald dein Kunde seine Daten eingetragen hat, erscheint er in deiner Kundenliste.`}
              </Notice>
            )}
            <Button label="Datenschutzerklärung schicken" onPress={submit} loading={sending} disabled={!!existing} />
          </View>
        </Card>
      </Reveal>

      <Reveal delay={330}>
        <View style={styles.steps}>
          <Text style={styles.stepsTitle}>So läuft es</Text>
          <Text style={styles.step}>1. Frag deinen Kunden nach seiner E-Mail-Adresse.</Text>
          <Text style={styles.step}>
            2. Trag sie hier ein – er bekommt den Link zu deiner Datenschutzerklärung.
          </Text>
          <Text style={styles.step}>
            3. Er trägt seine Daten ein und bestätigt die Datenschutzerklärung – erst dann wird er gespeichert.
          </Text>
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
  steps: { gap: Spacing.sm, paddingHorizontal: Spacing.xs },
  stepsTitle: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  step: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
});
