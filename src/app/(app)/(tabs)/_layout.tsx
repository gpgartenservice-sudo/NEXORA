import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { Colors } from '@/constants/theme';
import { NavBar, NavButton } from '@/features/navigation/nav-bar';
import { NAV_ITEMS, SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { CrmProvider } from '@/features/crm/crm-provider';
import { DocumentsProvider } from '@/features/documents/documents-provider';
import { FollowupsProvider } from '@/features/dunning/followups-provider';
import { FinanceProvider } from '@/features/finance/finance-provider';
import { InventoryProvider } from '@/features/inventory/inventory-provider';
import { GoalsProvider } from '@/features/goals/goals-provider';
import { RoadmapProvider } from '@/features/roadmap/roadmap-provider';
import { SocialConnectProvider } from '@/features/social/connect-provider';
import { SocialProvider } from '@/features/social/social-provider';
import { GuideProvider } from '@/features/assistant/nexy-guide';
import { NexyProvider } from '@/features/assistant/nexy-provider';
import { AppointmentsProvider } from '@/features/appointments/appointments-provider';
import { PlanProvider } from '@/features/plan/plan-provider';
import { TutorialProvider } from '@/features/tutorial/tutorial-provider';
import { TeamProvider, useWorkspaceId } from '@/features/team/team-provider';
import { DeviceGate } from '@/features/team/device-gate';
import { AppExtras } from '@/features/dashboard/app-extras';
import { DesignProvider, isBackgroundKey } from '@/features/design/backgrounds';
import { usePlan } from '@/features/plan/plan-provider';
import { useProfile } from '@/providers/profile-provider';
import { useAuth } from '@/providers/auth-provider';

/**
 * App-Rahmen: breites Fenster (Mac) = Seitenleiste links,
 * schmal (Handy) = Seitenmenü über den ☰-Knopf oben links. Der Aufbau bleibt gleich, damit beim
 * Verändern der Fenstergröße nichts neu geladen wird – nur die Anordnung
 * (Zeile vs. Spalte) wechselt.
 */
export default function TabsLayout() {
  const { user } = useAuth();
  return (
    <PlanProvider userId={user?.id ?? ''}>
      <TeamProvider userId={user?.id ?? ''}>
        <DeviceGate>
          <Workspace />
        </DeviceGate>
      </TeamProvider>
    </PlanProvider>
  );
}

/**
 * Alle Business-Daten. Im Business-Team gehören sie dem Inhaber (workspace) – wechselt das
 * (Team beitreten/verlassen), wird alles neu geladen (key).
 */
function Workspace() {
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const { user } = useAuth();
  const ws = useWorkspaceId();
  const { profile } = useProfile();
  const { pro } = usePlan();
  const chosen = profile?.design?.background;
  const background = pro && isBackgroundKey(chosen) ? chosen : 'none';

  return (
    <DesignProvider background={background}>
    <RoadmapProvider userId={user?.id ?? ''} key={ws}>
        <CrmProvider userId={ws}>
          <DocumentsProvider userId={ws}>
            <FollowupsProvider userId={ws}>
              <FinanceProvider userId={ws}>
                <InventoryProvider userId={ws}>
                <SocialProvider userId={ws}>
                  <SocialConnectProvider userId={user?.id ?? ''}>
                    <AppointmentsProvider userId={ws}>
                      <GoalsProvider userId={ws}>
                        <NexyProvider key={user?.id ?? ''}>
                          <TutorialProvider>
                            <GuideProvider>
                              <Tabs style={[styles.root, wide ? styles.row : styles.columnReverse]}>
                                <TabList asChild>
                                  <NavBar wide={wide}>
                                    {NAV_ITEMS.map((item) => (
                                      <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
                                        <NavButton item={item} />
                                      </TabTrigger>
                                    ))}
                                  </NavBar>
                                </TabList>
                                <TabSlot style={styles.slot} />
                              </Tabs>
                              <AppExtras />
                            </GuideProvider>
                          </TutorialProvider>
                        </NexyProvider>
                      </GoalsProvider>
                    </AppointmentsProvider>
                  </SocialConnectProvider>
                </SocialProvider>
                </InventoryProvider>
              </FinanceProvider>
            </FollowupsProvider>
          </DocumentsProvider>
        </CrmProvider>
      </RoadmapProvider>
    </DesignProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  row: { flexDirection: 'row' },
  columnReverse: { flexDirection: 'column-reverse' },
  slot: { flex: 1 },
});

/** Fehler in diesem Bereich: Fehlerseite statt Absturz */
export { AppError as ErrorBoundary } from '@/components/app-error';
