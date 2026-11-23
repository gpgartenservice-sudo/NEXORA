import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { usePlan } from '@/features/plan/plan-provider';
import { hasTeamPlan } from '@/features/plan/plan-logic';

import { AREA_LABEL, ROLE_LABEL, navArea, type Area } from './roles';
import { useAccess } from './team-provider';

/**
 * Welche Menüpunkte jemand sieht: Bereiche, die seine Rolle ausschaltet, verschwinden.
 * „Team“ (Chats, Arbeitsplan, Urlaub) gibt es mit Business/Teams oder als Teammitglied.
 */
export function useNavVisible(): (name: string) => boolean {
  const access = useAccess();
  const { info } = usePlan();
  const teamPlan = hasTeamPlan(info?.plan ?? 'free');
  return useCallback(
    (name: string) => {
      if (name === 'team') return access.inTeam || teamPlan;
      // Dokumente (ELSTER-Zertifikat, Verträge …): nur Inhaber und Mitgründer
      if (name === 'dokumente') return access.employer;
      const area = navArea(name);
      return !area || access.can(area);
    },
    [access, teamPlan],
  );
}

/**
 * Seite eines Bereichs: ohne Recht (direkter Link, Mitteilung, alter Tab) ein freundlicher
 * Hinweis statt der Seite. Die Daten schützt ohnehin die Datenbank.
 */
export function AreaGate({ area, children }: { area: Area; children: ReactNode }) {
  const access = useAccess();
  if (access.can(area)) return <>{children}</>;
  return <NoAccess area={area} role={ROLE_LABEL[access.role]} />;
}

function NoAccess({ area, role }: { area: Area; role: string }) {
  return (
    <GateNotice
      title={`Kein Zugriff auf „${AREA_LABEL[area]}“`}
      text={`In deiner Rolle (${role}) ist dieser Bereich ausgeschaltet. Wenn du ihn brauchst, kann die Leitung ihn unter Profil → Team freischalten.`}
    />
  );
}

/** Hinweisseite mit Schloss (kein Zugriff, Chat gibt es nicht, kein Team-Abo) */
export function GateNotice({
  title,
  text,
  action = { label: 'Zum Start', onPress: () => router.navigate('/home') },
}: {
  title: string;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Screen maxWidth={560}>
      <Card>
        <View style={styles.wrap}>
          <View style={styles.icon}>
            <Lock size={22} color={Colors.text} strokeWidth={1.8} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{text}</Text>
          <Button label={action.label} variant="secondary" onPress={action.onPress} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 420 },
});
