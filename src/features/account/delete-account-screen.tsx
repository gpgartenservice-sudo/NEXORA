import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { LEGAL_URLS, cancelPageUrl } from '@/features/legal/legal-logic';
import { openBillingPortal } from '@/features/plan/billing-api';
import { signOutHere } from '@/lib/device';
import { useAuth } from '@/providers/auth-provider';
import { useProfile } from '@/providers/profile-provider';

import { deleteMyAccount, loadDeletionInfo } from './account-api';
import { CONFIRM_WORD, confirmOk, deletedItems, deletionNotes, type DeletionInfo } from './account-delete-logic';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/profil'));

/**
 * Profil → Konto → „Konto löschen“ (App Store 5.1.1(v)): zeigt, was gelöscht wird und was vorher
 * zu tun ist (Export, laufendes Abo kündigen, Team), verlangt die E-Mail-Adresse als Bestätigung,
 * löscht über die Server-Funktion "account" und meldet ab.
 */
export function DeleteAccountScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const email = user?.email ?? null;
  const [info, setInfo] = useState<DeletionInfo | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const [portalError, setPortalError] = useState<string>();
  const [portalBusy, setPortalBusy] = useState(false);
  const deleting = useRef(false);

  const load = useCallback(async () => {
    if (deleting.current) return;
    setLoading(true);
    const r = await loadDeletionInfo();
    setLoading(false);
    if (r.error || !r.data) {
      setLoadError(r.error ?? 'Das hat gerade nicht geklappt.');
      return;
    }
    setLoadError(undefined);
    setInfo(r.data);
  }, []);

  // auch nach dem Kündigen im Kundenportal (Rückkehr in die App) neu prüfen
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const notes = deletionNotes(info);
  const blocked = !!info?.subscription?.running;
  const matches = confirmOk(typed, email);

  const remove = async () => {
    setError(undefined);
    deleting.current = true;
    const r = await deleteMyAccount(typed);
    if (r.error || !r.data?.deleted) {
      deleting.current = false;
      setError(r.error ?? 'Das Löschen hat gerade nicht geklappt. Versuch es gleich noch einmal.');
      if (r.code === 'subscription_active') void load();
      return;
    }
    // Konto ist weg: hier abmelden (ist noch ein weiteres Konto angemeldet, geht es mit dem weiter)
    const result = await signOutHere().catch(() => 'signed-out' as const);
    if (result === 'switched') router.replace('/home');
    else router.replace({ pathname: '/', params: { konto: 'geloescht' } });
  };

  const portal = async () => {
    setPortalBusy(true);
    setPortalError(undefined);
    const { error: e } = await openBillingPortal();
    setPortalBusy(false);
    if (e) setPortalError(e);
  };

  return (
    <Screen maxWidth={640}>
      <PageHeader
        title="Konto löschen"
        subtitle={email ? `Dein LUNAXORA-Konto ${email} endgültig löschen.` : 'Dein LUNAXORA-Konto endgültig löschen.'}
        back={{ label: 'Profil', onPress: back }}
      />

      <Reveal delay={60}>
        <Card>
          <Text style={styles.heading}>Das wird endgültig gelöscht</Text>
          {deletedItems(info).map((p) => (
            <View key={p} style={styles.point}>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.body}>{p}</Text>
            </View>
          ))}
          <Text style={styles.strong}>Das lässt sich nicht rückgängig machen – auch wir können nichts wiederherstellen.</Text>
          <Text style={styles.small}>
            Unsere Rechnungen an dich bewahren wir auf, solange das Gesetz es verlangt (Datenschutz § 19).
          </Text>
        </Card>
      </Reveal>

      <Reveal delay={120}>
        <Card>
          <Text style={styles.heading}>Vorher sichern</Text>
          <Text style={styles.body}>
            Rechnungen, Ausgaben und Belege musst du als Unternehmer meist jahrelang aufbewahren. Lade vorher herunter, was du
            behalten willst: unter Finanzen → Steuern „Alles als ZIP“ (Rechnungen und Ausgaben als Listen und alle Belege) oder
            einzeln als PDF bzw. CSV.
          </Text>
          <View style={styles.actions}>
            <Button label="Zum Export" variant="secondary" onPress={() => router.navigate('/finanzen/steuern')} />
          </View>
        </Card>
      </Reveal>

      {loading && !info && !loadError && <Text style={styles.small}>Wird geprüft …</Text>}

      {!!loadError && (
        <Notice tone="error" action={<TextLink label="Noch einmal prüfen" emphasis onPress={() => void load()} />}>
          {loadError}
        </Notice>
      )}

      {notes.map((n) => (
        <Notice
          key={n.key}
          tone={n.tone}
          action={
            n.key === 'subscription' ? (
              <View style={styles.noteActions}>
                <Button label="Im Kundenportal kündigen" loading={portalBusy} onPress={() => void portal()} />
                <TextLink
                  label="Verträge hier kündigen"
                  onPress={() => void Linking.openURL(cancelPageUrl(email, profile?.display_name))}
                />
                <TextLink label="Neu prüfen" onPress={() => void load()} />
              </View>
            ) : undefined
          }>
          {`${n.title}\n${n.text}`}
        </Notice>
      ))}
      {!!portalError && <Notice tone="error">{portalError}</Notice>}

      <Reveal delay={180}>
        <View style={styles.form}>
          <TextField
            label={email ? 'Zur Bestätigung deine E-Mail-Adresse' : `Zur Bestätigung „${CONFIRM_WORD}“ eintippen`}
            value={typed}
            onChangeText={(v) => {
              setTyped(v);
              if (error) setError(undefined);
            }}
            placeholder={email ?? CONFIRM_WORD}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType={email ? 'email-address' : 'default'}
            textContentType="none"
            error={error}
            testID="delete-account-confirm"
          />
          <ConfirmDelete
            label="Konto endgültig löschen"
            question={`Wirklich löschen? Dein Konto${info && info.companies.length > 1 ? ` und alle ${info.companies.length} Firmen` : ''} sind danach für immer weg.`}
            disabled={!matches || blocked || !info}
            disabledHint={
              blocked
                ? 'Erst das laufende Abo kündigen.'
                : !info
                  ? 'Wird geprüft …'
                  : 'Tippe zuerst deine E-Mail-Adresse ein.'
            }
            onConfirm={remove}
          />
          <Text style={styles.small}>
            Lieber nicht in der App? Schreib an kontakt@lunaxora.de oder wähle auf lunaxora.de/kuendigen/ „Mein ganzes LUNAXORA-Konto“.
          </Text>
          <TextLink label="Datenschutzerklärung" onPress={() => void Linking.openURL(LEGAL_URLS.datenschutz)} />
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  point: { flexDirection: 'row', gap: Spacing.sm },
  dot: { color: '#FF6B6B', fontSize: 15, lineHeight: 21 },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21, flex: 1 },
  strong: { color: Colors.text, fontSize: 14.5, lineHeight: 21, fontWeight: '600' },
  small: { color: Colors.textFaint, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  noteActions: { gap: Spacing.sm, alignItems: 'flex-start' },
  form: { gap: Spacing.md },
});
