import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';

type Props = { children: ReactNode; maxWidth?: number };

/** Scrollbarer Inhaltsbereich einer Seite im App-Rahmen. */
export function Screen({ children, maxWidth = 1080 }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  // Mac: Platz für die Fensterknöpfe oben; Handy: Statusleiste
  const top = wide ? (Platform.OS === 'web' ? 56 : insets.top + Spacing.xxl) : insets.top + Spacing.xl;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={{ paddingTop: top, paddingBottom: Spacing.xxxl }}>
      <View style={[styles.inner, { maxWidth, paddingHorizontal: wide ? Spacing.xxxl : Spacing.xl }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  inner: { width: '100%', alignSelf: 'center', gap: Spacing.xl },
});
