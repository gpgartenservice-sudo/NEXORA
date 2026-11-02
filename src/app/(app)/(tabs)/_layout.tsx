import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { Colors } from '@/constants/theme';
import { NavBar, NavButton } from '@/features/navigation/nav-bar';
import { NAV_ITEMS, SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { RoadmapProvider } from '@/features/roadmap/roadmap-provider';
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
    </RoadmapProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  row: { flexDirection: 'row' },
  columnReverse: { flexDirection: 'column-reverse' },
  slot: { flex: 1 },
});
