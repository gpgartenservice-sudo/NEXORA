import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { Colors } from '@/constants/theme';
import { NavBar, NavButton } from '@/features/navigation/nav-bar';
import { NAV_ITEMS, SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { CrmProvider } from '@/features/crm/crm-provider';
import { DocumentsProvider } from '@/features/documents/documents-provider';
import { FinanceProvider } from '@/features/finance/finance-provider';
import { RoadmapProvider } from '@/features/roadmap/roadmap-provider';
import { SocialConnectProvider } from '@/features/social/connect-provider';
import { SocialProvider } from '@/features/social/social-provider';
import { NexyProvider } from '@/features/assistant/nexy-provider';
import { AppointmentsProvider } from '@/features/appointments/appointments-provider';
import { useAuth } from '@/providers/auth-provider';

/**
 * App-Rahmen: breites Fenster (Mac) = Seitenleiste links,
 * schmal (Handy) = Tab-Leiste unten. Der Aufbau bleibt gleich, damit beim
 * Verändern der Fenstergröße nichts neu geladen wird – nur die Anordnung
 * (Zeile vs. Spalte) wechselt.
 */
export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const { user } = useAuth();

  return (
    <RoadmapProvider userId={user?.id ?? ''}>
      <CrmProvider userId={user?.id ?? ''}>
        <DocumentsProvider userId={user?.id ?? ''}>
          <FinanceProvider userId={user?.id ?? ''}>
            <SocialProvider userId={user?.id ?? ''}>
              <SocialConnectProvider userId={user?.id ?? ''}>
                <AppointmentsProvider userId={user?.id ?? ''}>
                  <NexyProvider key={user?.id ?? ''}>
                    <Tabs style={[styles.root, wide ? styles.row : styles.columnReverse]}>
                      <TabList asChild>
                        <NavBar wide={wide}>
                          {NAV_ITEMS.map((item) => (
                            <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
                              <NavButton item={item} wide={wide} />
                            </TabTrigger>
                          ))}
                        </NavBar>
                      </TabList>
                      <TabSlot style={styles.slot} />
                    </Tabs>
                  </NexyProvider>
                </AppointmentsProvider>
              </SocialConnectProvider>
            </SocialProvider>
          </FinanceProvider>
        </DocumentsProvider>
      </CrmProvider>
    </RoadmapProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  row: { flexDirection: 'row' },
  columnReverse: { flexDirection: 'column-reverse' },
  slot: { flex: 1 },
});
