import { CalendarSync } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { usePlan, useProGate } from '@/features/plan/plan-provider';
import { copyText } from '@/features/social/copy-text';
import { SUPABASE_URL } from '@/lib/supabase';

import { feedUrls } from './appointment-logic';
import { useAppointments } from './appointments-provider';

type Check = { tone: 'success' | 'error' | 'info'; text: string } | null;

/**
 * Kalender-Abo: Ein geheimer Link, den Apple Kalender, Google Kalender oder
 * Outlook abonnieren – dann erscheinen alle Termine dort automatisch.
 */
export function CalendarSubscription({ onClose }: { onClose: () => void }) {
  const { feed, createFeed, renewFeed, deleteFeed, error: setupError } = useAppointments();
  const { pro } = usePlan();
  const gate = useProGate();
  const [busy, setBusy] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>(null);
  const [confirm, setConfirm] = useState<'renew' | 'delete' | null>(null);
  const urls = feed ? feedUrls(SUPABASE_URL, feed) : null;

  const run = async (name: string, fn: () => Promise<{ error?: string; success?: string }>, ok?: string) => {
    setBusy(name);
    setCheck(null);
    const r = await fn();
    setBusy(null);
    setConfirm(null);
    const success = r.success ?? ok;
    setCheck(r.error ? { tone: 'error', text: r.error } : success ? { tone: 'success', text: success } : null);
  };

  /** Prüfen, ob die Server-Funktion den Kalender liefert */
  const test = () =>
    run('test', async () => {
      if (!urls) return {};
      try {
        const res = await fetch(urls.https);
        const body = await res.text();
        if (res.status === 404 && !body.includes('BEGIN:VCALENDAR')) {
          return {
            error:
              'Die Server-Funktion „calendar“ fehlt noch in Supabase (Anleitung: supabase/README.md, Abschnitt „Termine & Kalender-Abo“).',
          };
        }
        if (res.status === 401)
          return {
            error:
              'Die Server-Funktion „calendar“ verlangt eine Anmeldung. Schalte bei der Funktion „Verify JWT“ aus – Kalender-Apps melden sich nicht an.',
          };
        if (!res.ok || !body.includes('BEGIN:VCALENDAR'))
          return { error: `Der Kalender kam nicht an (${res.status}). ${body.slice(0, 200)}` };
        const count = (body.match(/BEGIN:VEVENT/g) ?? []).length;
        return { success: `Funktioniert – ${count} ${count === 1 ? 'Termin' : 'Termine'} im Abo.` };
      } catch (e) {
        return {
          error: `Keine Antwort von der Server-Funktion. Ist „calendar“ in Supabase angelegt und „Verify JWT“ ausgeschaltet?\n\nTechnische Details: ${String(e)}`,
        };
      }
    });

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.icon}>
          <CalendarSync size={20} color={Colors.text} strokeWidth={1.8} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>Kalender-Abo</Text>
          <Text style={styles.text}>
            Alle Termine automatisch in Apple Kalender, Google Kalender oder Outlook – auch auf dem Handy. Neue und
            geänderte Termine kommen von selbst nach (Apple: je nach Einstellung, Google: alle paar Stunden).
          </Text>
        </View>
      </View>

      {setupError === 'setup' && (
        <Notice tone="error">Das Datenbank-Skript für Termine fehlt noch (siehe supabase/README.md).</Notice>
      )}

      {!urls ? (
        <Button
          label={pro ? 'Abo-Link erstellen' : 'Abo-Link erstellen · Pro'}
          onPress={() => gate('calendar_feed') && void run('create', createFeed)}
          loading={busy === 'create'}
          disabled={setupError === 'setup'}
        />
      ) : (
        <View style={styles.box}>
          <Text style={styles.label}>Dein Abo-Link</Text>
          <Text style={styles.url} selectable numberOfLines={2} testID="feed-url">
            {urls.webcal}
          </Text>
          <View style={styles.buttons}>
            <Button
              label="In Apple Kalender öffnen"
              onPress={() => void Linking.openURL(urls.webcal)}
              style={styles.button}
            />
            <Button
              label="Zu Google Kalender"
              variant="secondary"
              onPress={() => void Linking.openURL(urls.google)}
              style={styles.button}
            />
          </View>
          <View style={styles.links}>
            <SmallLink
              label="Link kopieren"
              onPress={async () =>
                setCheck(
                  (await copyText(urls.webcal))
                    ? { tone: 'success', text: 'Link kopiert.' }
                    : { tone: 'error', text: 'Kopieren ging nicht – bitte den Link oben markieren.' },
                )
              }
            />
            <SmallLink label={busy === 'test' ? 'Prüfe …' : 'Abo testen'} onPress={() => void test()} />
            <SmallLink label="Neuen Link erzeugen" onPress={() => setConfirm('renew')} />
            <SmallLink label="Abo beenden" onPress={() => setConfirm('delete')} />
          </View>
          <Text style={styles.hint}>
            Wer diesen Link kennt, sieht deine Termine (mit Kunden und Adressen). Gib ihn nicht weiter – im Zweifel
            einen neuen Link erzeugen.
          </Text>
          {confirm && (
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>
                {confirm === 'renew'
                  ? 'Neuen Link erzeugen? Der alte hört sofort auf zu funktionieren – den neuen musst du in deinem Kalender neu abonnieren.'
                  : 'Abo beenden? Der Link hört sofort auf zu funktionieren; in deinem Kalender kannst du das Abo dann entfernen.'}
              </Text>
              <View style={styles.buttons}>
                <Button label="Abbrechen" variant="secondary" onPress={() => setConfirm(null)} style={styles.button} />
                <Button
                  label={confirm === 'renew' ? 'Ja, neuer Link' : 'Ja, beenden'}
                  loading={busy === confirm}
                  onPress={() =>
                    void (confirm === 'renew'
                      ? run('renew', renewFeed, 'Neuer Link erstellt – bitte im Kalender neu abonnieren.')
                      : run('delete', deleteFeed, 'Abo beendet.'))
                  }
                  style={styles.button}
                />
              </View>
            </View>
          )}
        </View>
      )}
      {check && <Notice tone={check.tone}>{check.text}</Notice>}
      <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
        <Text style={styles.closeText}>Schließen</Text>
      </Pressable>
    </Card>
  );
}

function SmallLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  box: { gap: Spacing.sm },
  label: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  url: {
    color: Colors.text,
    fontSize: 12.5,
    fontFamily: 'monospace',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    padding: Spacing.md,
  },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  button: { flexGrow: 1, flexBasis: 200 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.lg, rowGap: Spacing.sm },
  link: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  hint: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18 },
  confirm: { gap: Spacing.sm, paddingTop: Spacing.xs },
  confirmText: { color: Colors.text, fontSize: 13.5, lineHeight: 19 },
  close: { alignSelf: 'flex-start' },
  closeText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
