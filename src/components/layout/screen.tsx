import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { AppBackdrop, useBackground } from '@/features/design/backgrounds';
import { SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { useScreenTop } from '@/features/navigation/use-screen-top';

type Props = { children: ReactNode; maxWidth?: number };

/** Scrollbarer Inhaltsbereich einer Seite im App-Rahmen. */
export function Screen({ children, maxWidth = 1080 }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  // Mac: Platz für die Fensterknöpfe oben; Handy: Statusleiste + Menü-Knopf
  const top = useScreenTop();
  // Handy: unten keine Leiste mehr – Platz für den Home-Balken lassen
  const bottom = Spacing.xxxl + (wide ? 0 : insets.bottom);
  // Pro/Business: bewegter Hintergrund (Profil → Design) hinter dem Inhalt
  const background = useBackground();

  return (
    <View style={styles.root}>
      {background !== 'none' && <AppBackdrop />}
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }}>
        <View style={[styles.inner, { maxWidth, paddingHorizontal: wide ? Spacing.xxxl : Spacing.xl }]}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  inner: { width: '100%', alignSelf: 'center', gap: Spacing.xl },
});
