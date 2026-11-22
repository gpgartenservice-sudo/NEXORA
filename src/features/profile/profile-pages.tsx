import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { TextLink } from '@/components/ui/text-link';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { CompaniesCard } from '@/features/companies/companies-card';
import { goalLabel, industryLabel, legalFormLabel, stageLabel } from '@/features/onboarding/options';
import { DevicesCard } from '@/features/team/devices-card';
import { TUTORIALS } from '@/features/tutorial/tutorial-content';
import { useTutorial } from '@/features/tutorial/tutorial-provider';
import { useAuth } from '@/providers/auth-provider';
import { useProfile } from '@/providers/profile-provider';

/**
 * Unterseiten von Profil – was früher als eigene Karte auf der Profilseite stand
 * (Angaben, Geräte, Firmen, Einführungen). Die Profilseite zeigt nur noch eine Zeile dazu.
 */

const back = { label: 'Profil', onPress: () => (router.canGoBack() ? router.back() : router.navigate('/profil')) };

/** Profil → Angaben: Antworten aus dem Onboarding */
export function AnswersPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const rows: [string, string | undefined][] = [
    ['Name', profile?.display_name ?? undefined],
    ['E-Mail', user?.email],
    ['Phase', stageLabel(profile?.stage)],
    ['Business', profile?.business_name ?? undefined],
    ['Branche', industryLabel(profile?.industry, profile?.industry_other)],
    ['Rechtsform', legalFormLabel(profile?.legal_form)],
    ['Schwerpunkte', profile?.goals?.length ? profile.goals.map(goalLabel).join(' · ') : undefined],
  ];
  return (
    <Screen maxWidth={640}>
      <PageHeader title="Deine Angaben" subtitle="Danach richten sich Start, Fahrplan und Luna." back={back} />
      <Reveal delay={120}>
        <Card>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value ?? '–'}</Text>
            </View>
          ))}
          <View style={styles.editRow}>
            <TextLink label="Antworten ändern" emphasis onPress={() => router.push('/onboarding')} />
          </View>
        </Card>
      </Reveal>
    </Screen>
  );
}

/** Profil → Geräte */
export function DevicesPage() {
  return (
    <Screen maxWidth={640}>
      <PageHeader title="Geräte" back={back} />
      <Reveal delay={120}>
        <DevicesCard showFree />
      </Reveal>
    </Screen>
  );
}

/** Profil → Firmen: wechseln und hinzufügen */
export function CompaniesPage() {
  return (
    <Screen maxWidth={640}>
      <PageHeader title="Firmen" subtitle="Jede Firma mit eigenen Kunden, Rechnungen und eigenem Team." back={back} />
      <Reveal delay={120}>
        <CompaniesCard />
      </Reveal>
    </Screen>
  );
}

/** Profil → Einführungen */
export function TutorialsPage() {
  const tutorial = useTutorial();
  const [resetDone, setResetDone] = useState(false);
  const seen = tutorial.done.length;
  const total = Object.keys(TUTORIALS).length;
  return (
    <Screen maxWidth={640}>
      <PageHeader title="Einführungen" subtitle={`Gesehen: ${seen} von ${total}`} back={back} />
      <Reveal delay={120}>
        <Card>
          <Text style={styles.text}>Luna erklärt jeden Bereich beim ersten Besuch – nochmal über das ? oben auf jeder Seite.</Text>
          <ToggleRow
            label="Beim ersten Besuch automatisch zeigen"
            value={!tutorial.off}
            onChange={(v) => {
              setResetDone(false);
              tutorial.setOff(!v);
            }}
          />
          <View style={styles.actions}>
            <Button
              label="Rundgang starten"
              variant="secondary"
              onPress={() => {
                tutorial.start('home', { tour: true });
                router.navigate('/home');
              }}
            />
            <TextLink
              label="Alle wieder als neu markieren"
              onPress={() => {
                tutorial.reset();
                setResetDone(true);
              }}
            />
          </View>
          {resetDone && <Text style={styles.text}>Erledigt – Luna zeigt jeden Bereich wieder.</Text>}
        </Card>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.lg },
  rowLabel: { color: Colors.textFaint, fontSize: 14 },
  rowValue: { color: Colors.text, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  editRow: { alignItems: 'flex-end', marginTop: Spacing.xs },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.lg },
});
