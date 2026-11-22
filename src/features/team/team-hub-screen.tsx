import { router, useLocalSearchParams } from 'expo-router';
import { Settings2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Colors } from '@/constants/theme';
import { hasTeamPlan } from '@/features/plan/plan-logic';
import { openPlanScreen, usePlan } from '@/features/plan/plan-provider';
import { useHover } from '@/hooks/use-hover';

import { AbsencePanel } from './absence-panel';
import { GateNotice } from './area-gate';
import { ChatList } from './chat-list';
import { ROLE_LABEL } from './roles';
import { SchedulePanel } from './schedule-panel';
import { useTeamHub } from './team-hub-provider';
import { useAccess, useTeam } from './team-provider';

type Tab = 'chats' | 'plan' | 'urlaub';
const isTab = (v: unknown): v is Tab => v === 'chats' || v === 'plan' || v === 'urlaub';

/**
 * Team (Menü): Chats, Arbeitsplan und Urlaub – für alle im Team.
 * Mitglieder einladen und Rechte einstellen: Profil → Team.
 */
export function TeamHubScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [view, setView] = useState<Tab>(isTab(params.tab) ? params.tab : 'chats');
  // Link mit ?tab=… (Startseite, Mitteilung): dorthin wechseln
  const [seenTab, setSeenTab] = useState(params.tab);
  if (params.tab !== seenTab) {
    setSeenTab(params.tab);
    if (isTab(params.tab)) setView(params.tab);
  }
  const { team } = useTeam();
  const access = useAccess();
  const { info } = usePlan();
  const hub = useTeamHub();
  const teamPlan = hasTeamPlan(team?.plan ?? info?.plan);

  if (!access.inTeam) {
    if (!teamPlan)
      return (
        <GateNotice
          title="Team gibt es mit Business und Teams"
          text="Mit Lunaxora Business (bis 5 Personen) oder Teams (bis 30) habt ihr hier eure Chats – einen nur für die Leitung und einen für alle –, den Arbeitsplan und Urlaubsanträge."
          action={{ label: 'Abos ansehen', onPress: () => openPlanScreen('team') }}
        />
      );
    return (
      <GateNotice
        title="Lade dein Team ein"
        text="Sobald jemand dabei ist, habt ihr hier eure Chats, den Arbeitsplan und Urlaubsanträge. Einladen und Rechte einstellen kannst du unter Profil → Team."
        action={{ label: 'Team einladen', onPress: () => router.push('/profil/team') }}
      />
    );
  }

  const count = (n: number) => (n > 0 ? ` · ${n > 99 ? '99+' : n}` : '');
  return (
    <Screen maxWidth={860}>
      <PageHeader
        title="Team"
        subtitle={`${team?.owner_name ?? 'Euer Team'} · du bist ${ROLE_LABEL[access.role]}`}
        action={access.employer ? <ManageLink /> : undefined}
      />
      <Reveal delay={120}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'chats', label: `Chats${count(hub.unread)}` },
            { value: 'plan', label: 'Arbeitsplan' },
            { value: 'urlaub', label: `Urlaub${count(hub.openRequests)}` },
          ]}
        />
      </Reveal>
      <Reveal delay={180} key={view}>
        {view === 'chats' ? <ChatList /> : view === 'plan' ? <SchedulePanel /> : <AbsencePanel />}
      </Reveal>
    </Screen>
  );
}

function ManageLink() {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable onPress={() => router.push('/profil/team')} accessibilityRole="link" style={styles.manage} {...hoverProps}>
      <Settings2 size={15} color={hovered ? Colors.text : Colors.textMuted} />
      <Text style={[styles.manageText, hovered && styles.manageHover]}>Mitglieder & Rechte</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  manage: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  manageText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  manageHover: { color: Colors.text },
});

