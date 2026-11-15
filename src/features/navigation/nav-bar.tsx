import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Menu, X } from 'lucide-react-native';
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewProps,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand/wordmark';
import { EASE_OUT_EXPO } from '@/components/motion/reveal';
import { Glass } from '@/components/ui/glass';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/providers/profile-provider';

import { SIDEBAR_WIDTH, type NavItem } from './nav-items';
import { MENU_BUTTON_SIZE, MENU_TOP, useMenuButtonShown } from './use-screen-top';

type NavBarProps = { wide: boolean; children?: ReactNode };

/** Offenes Seitenmenü am Handy – ein Eintrag schließt es nach dem Antippen */
const DrawerContext = createContext<{ close: () => void } | null>(null);

// federt wie bei iOS, ohne weit überzuschwingen
const DRAWER_SPRING = { damping: 24, stiffness: 240, mass: 0.9 };

/**
 * Navigation der App: auf dem Mac (breites Fenster) eine Seitenleiste
 * links, auf dem Handy ein Seitenmenü, das der ☰-Knopf oben links öffnet.
 * Die Einträge (TabTrigger) kommen als children und werden hier nur angeordnet.
 */
export function NavBar({ wide, children, ...rest }: NavBarProps) {
  const insets = useSafeAreaInsets();
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{ name: string }>[];
  const main = items.filter((c) => c.props.name !== 'profil');
  const footer = items.filter((c) => c.props.name === 'profil');

  if (!wide) return <MenuDrawer {...rest} main={main} footer={footer} />;

  return (
    <View {...rest} style={[styles.sidebar, { paddingTop: Platform.OS === 'web' ? 52 : insets.top + Spacing.lg }]}>
      <View style={styles.brand}>
        <Wordmark width={132} />
      </View>
      <View style={styles.sideList}>{main}</View>
      <View style={styles.sideFooter}>{footer}</View>
    </View>
  );
}

/**
 * Handy: ☰-Knopf oben links (Liquid Glass) öffnet ein schwebendes Glas-Menü
 * von links mit allen Bereichen – wie die Seitenleiste auf dem Mac.
 */
function MenuDrawer({ main, footer, ...rest }: ViewProps & { main: ReactElement[]; footer: ReactElement[] }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const showButton = useMenuButtonShown();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);
  const panelW = Math.min(310, width - 64);
  const drawer = useMemo(() => ({ close: () => setOpen(false) }), []);

  useEffect(() => {
    progress.set(withSpring(open ? 1 : 0, DRAWER_SPRING));
    if (!open) return;
    // Android: Zurück-Taste schließt erst das Menü
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [open, progress]);

  const dimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.get() - 1) * (panelW + 24) }],
  }));

  return (
    <View {...rest} style={styles.drawerRoot} pointerEvents="box-none">
      {showButton && (
        <Glass interactive style={[styles.menuButton, { top: insets.top + MENU_TOP }]}>
          <Pressable
            onPress={() => setOpen(true)}
            style={styles.menuPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Menü öffnen">
            <Menu size={21} color={Colors.text} strokeWidth={2} />
          </Pressable>
        </Glass>
      )}
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={drawer.close} accessibilityLabel="Menü schließen" />
      </Animated.View>
      <Animated.View
        pointerEvents={open ? 'box-none' : 'none'}
        accessibilityViewIsModal={open}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.panel,
          { width: panelW, top: insets.top + MENU_TOP, bottom: Math.max(insets.bottom, Spacing.sm) },
          panelStyle,
        ]}>
        <Glass style={styles.panelGlass}>
          <View style={styles.panelHead}>
            <Wordmark width={116} />
            <Pressable
              onPress={drawer.close}
              style={styles.closeButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Menü schließen">
              <X size={18} color={Colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>
          <DrawerContext value={drawer}>
            <ScrollView style={styles.panelList} contentContainerStyle={styles.sideList} showsVerticalScrollIndicator={false}>
              {main}
            </ScrollView>
            <View style={styles.panelFooter}>{footer}</View>
          </DrawerContext>
        </Glass>
      </Animated.View>
    </View>
  );
}

/** Props, die TabTrigger (asChild) weiterreicht – ohne ref, das hier nicht gebraucht wird. */
type TriggerSlotProps = Omit<TabTriggerSlotProps, 'ref'>;

type NavButtonProps = TriggerSlotProps & { item: NavItem };

/** Ein Eintrag der Navigation – in der Seitenleiste (Mac) und im Seitenmenü (Handy) gleich. */
export function NavButton({ item, isFocused = false, onPress, ...pressable }: NavButtonProps) {
  const drawer = useContext(DrawerContext);
  // "Mehr" brauchte nur die alte Tab-Leiste – das Menü zeigt alle Bereiche direkt
  if (item.mobileOnly || item.hidden) return null;

  const press: TriggerSlotProps['onPress'] = (e) => {
    onPress?.(e);
    drawer?.close();
  };
  if (item.name === 'profil') return <UserChip isFocused={isFocused} {...pressable} onPress={press} />;
  return <SidebarItem item={item} isFocused={isFocused} {...pressable} onPress={press} />;
}

type ItemProps = Omit<TriggerSlotProps, 'isFocused'> & { isFocused: boolean };

function useNavAnimation(isFocused: boolean) {
  const active = useSharedValue(isFocused ? 1 : 0);
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  useEffect(() => {
    active.set(withTiming(isFocused ? 1 : 0, { duration: 320, easing: EASE_OUT_EXPO }));
  }, [isFocused, active]);
  const handlers = {
    onHoverIn: () => hover.set(withTiming(1, { duration: 160 })),
    onHoverOut: () => hover.set(withTiming(0, { duration: 220 })),
    onPressIn: () => press.set(withSpring(1, { damping: 18, stiffness: 420 })),
    onPressOut: () => press.set(withSpring(0, { damping: 18, stiffness: 420 })),
  };
  return { active, hover, press, handlers };
}

function SidebarItem({ item, isFocused, ...pressable }: ItemProps & { item: NavItem }) {
  const { active, hover, press, handlers } = useNavAnimation(isFocused);
  const Icon = item.icon;

  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.max(active.get(), hover.get() * 0.55), [0, 1], ['rgba(255,255,255,0)', 'rgba(255,255,255,0.075)']),
    transform: [{ scale: 1 - 0.02 * press.get() }],
  }));
  const barStyle = useAnimatedStyle(() => ({ opacity: active.get(), transform: [{ scaleY: 0.3 + 0.7 * active.get() }] }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(Math.max(active.get(), hover.get() * 0.7), [0, 1], [Colors.textMuted, Colors.text]),
  }));

  return (
    <Pressable {...pressable} {...handlers} accessibilityRole="link" accessibilityState={{ selected: isFocused }} aria-current={isFocused ? 'page' : undefined}>
      <Animated.View style={[styles.sideItem, rowStyle]}>
        <Animated.View style={[styles.activeBar, barStyle]} />
        <Icon size={18} strokeWidth={isFocused ? 2.2 : 1.8} color={isFocused ? Colors.text : Colors.textMuted} />
        <Animated.Text style={[styles.sideLabel, labelStyle]} numberOfLines={1}>
          {item.label}
        </Animated.Text>
        {item.soon && (
          <View style={styles.soon}>
            <Text style={styles.soonText}>bald</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function UserChip({ isFocused, ...pressable }: ItemProps) {
  const { profile } = useProfile();
  const { active, hover, press, handlers } = useNavAnimation(isFocused);
  const name = profile?.display_name?.trim() || 'Dein Profil';

  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.max(active.get(), hover.get() * 0.55), [0, 1], ['rgba(255,255,255,0)', 'rgba(255,255,255,0.075)']),
    transform: [{ scale: 1 - 0.02 * press.get() }],
  }));

  return (
    <Pressable {...pressable} {...handlers} accessibilityRole="link" accessibilityLabel="Profil" aria-current={isFocused ? 'page' : undefined}>
      <Animated.View style={[styles.userChip, rowStyle]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.userTexts}>
          <Text style={styles.userName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.userSub} numberOfLines={1}>
            {profile?.business_name || 'Profil & Einstellungen'}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Seitenleiste
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#050505',
    borderRightWidth: 1,
    borderRightColor: '#161618',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  brand: { paddingHorizontal: Spacing.md, marginBottom: Spacing.xxl },
  sideList: { gap: 2, flex: 1 },
  sideFooter: { borderTopWidth: 1, borderTopColor: '#161618', paddingTop: Spacing.md },
  sideItem: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    height: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: 10,
  },
  activeBar: {
    position: 'absolute',
    left: -Spacing.md + 1,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.accent,
    boxShadow: `0 0 10px ${Colors.accentGlow}`,
  },
  sideLabel: { flex: 1, fontSize: 14.5, fontWeight: '500' },
  soon: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  soonText: { color: Colors.textFaint, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.3 },
  userChip: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm, borderRadius: Radius.md },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.background, fontSize: 15, fontWeight: '800' },
  userTexts: { flex: 1 },
  userName: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  userSub: { color: Colors.textFaint, fontSize: 12 },
  // Seitenmenü am Handy
  drawerRoot: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, elevation: 50 },
  menuButton: {
    position: 'absolute',
    left: Spacing.lg,
    width: MENU_BUTTON_SIZE,
    height: MENU_BUTTON_SIZE,
    borderRadius: MENU_BUTTON_SIZE / 2,
  },
  menuPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { position: 'absolute', left: 10 },
  panelGlass: {
    flex: 1,
    borderRadius: 30,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.md,
    marginBottom: Spacing.lg,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  panelList: { flex: 1 },
  panelFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)', paddingTop: Spacing.sm },
});
