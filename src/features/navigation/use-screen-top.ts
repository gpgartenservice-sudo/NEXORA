import { usePathname } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

import { NAV_ITEMS, SIDEBAR_BREAKPOINT } from './nav-items';

/** Menü-Knopf (☰) am Handy: Abstand von oben und Größe */
export const MENU_TOP = 6;
export const MENU_BUTTON_SIZE = 44;

/**
 * Am Handy steht oben links der Menü-Knopf – aber nur auf den Hauptseiten.
 * Unterseiten (z. B. ein Kunde) haben dort ihren Zurück-Knopf.
 */
export function useMenuButtonShown() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  return width < SIDEBAR_BREAKPOINT && NAV_ITEMS.some((i) => i.href === pathname);
}

/** Abstand des Seiteninhalts nach oben: Statusleiste, Mac-Fensterknöpfe oder Menü-Knopf */
export function useScreenTop() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const menu = useMenuButtonShown();
  if (width >= SIDEBAR_BREAKPOINT) return Platform.OS === 'web' ? 56 : insets.top + Spacing.xxl;
  return insets.top + (menu ? MENU_TOP + MENU_BUTTON_SIZE + Spacing.lg : Spacing.xl);
}
