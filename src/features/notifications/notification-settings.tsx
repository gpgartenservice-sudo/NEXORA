import { router } from 'expo-router';
import { BellRing } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';

import { replanNotifications } from './notification-scheduler';
import { NOTIFY_OPTIONS } from './notify-logic';
import { permission, requestPermission, sendTest, type Permission } from './notify-platform';
import { useNotifyPrefs } from './notify-prefs';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/profil'));

/** Profil → Benachrichtigungen: erlauben, Arten an/aus, testen. */
export function NotificationSettings() {
  const { prefs, set } = useNotifyPrefs();
  const [state, setState] = useState<Permission | null>(null);
  const [info, setInfo] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void permission().then(setState);
  }, []);

  const allow = async () => {
    const p = await requestPermission();
    setState(p);
    if (p === 'granted') {
      replanNotifications();
      setInfo({ tone: 'success', text: 'Benachrichtigungen sind an.' });
    } else if (p === 'denied') {
      setInfo({
        tone: 'error',
        text:
          Platform.OS === 'web'
            ? 'Benachrichtigungen sind blockiert. Erlaube sie in den Systemeinstellungen → Mitteilungen → Lunaxora.'
            : 'Benachrichtigungen sind blockiert. Erlaube sie in den Einstellungen deines Handys → Mitteilungen → Lunaxora.',
      });
    }
  };

  return (
    <Screen maxWidth={640}>
      <PageHeader
        title="Benachrichtigungen"
        subtitle="Lunaxora erinnert dich an Termine, fällige Rechnungen, To-dos und deine Ziele – und motiviert dich zwischendurch."
        back={{ label: 'Profil', onPress: back }}
      />
      {info && <Notice tone={info.tone}>{info.text}</Notice>}

      <Reveal delay={120}>
        <Card>
          <View style={styles.head}>
            <BellRing size={20} color={state === 'granted' ? Colors.accent : Colors.textMuted} />
            <Text style={styles.title}>
              {state === 'granted'
                ? 'Benachrichtigungen sind an'
                : state === 'unsupported'
                  ? 'Auf diesem Gerät nicht verfügbar'
                  : 'Benachrichtigungen erlauben'}
            </Text>
          </View>
          <Text style={styles.body}>
            {state === 'unsupported'
              ? 'Diese Version der App kann noch keine Benachrichtigungen. Mit dem nächsten Update geht es.'
              : Platform.OS === 'web'
                ? 'Am Mac kommen die Hinweise, solange Lunaxora geöffnet ist (auch im Hintergrund).'
                : 'Die Hinweise kommen auch, wenn die App geschlossen ist.'}
          </Text>
          {state !== 'granted' && state !== 'unsupported' && <Button label="Erlauben" onPress={() => void allow()} />}
          {state === 'granted' && (
            <Button
              label="Test-Benachrichtigung"
              variant="secondary"
              onPress={async () => {
                const ok = await sendTest('Hallo von Luna 👋', 'So sehen Benachrichtigungen von Lunaxora aus.');
                if (!ok) setInfo({ tone: 'error', text: 'Das hat nicht geklappt.' });
              }}
            />
          )}
        </Card>
      </Reveal>

      <Reveal delay={180}>
        <Card>
          <Text style={styles.title}>Woran soll ich dich erinnern?</Text>
          {NOTIFY_OPTIONS.map((o) => (
            <ToggleRow key={o.key} label={o.title} hint={o.text} value={prefs[o.key]} onChange={(v) => void set(o.key, v)} />
          ))}
          <Text style={styles.hint}>Die Auswahl gilt für dieses Gerät.</Text>
        </Card>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21 },
  hint: { color: Colors.textFaint, fontSize: 12.5 },
});
