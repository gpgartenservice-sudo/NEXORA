import type { TabTriggerSlotProps } from 'expo-router/ui';
import { Children, isValidElement, useEffect, type ReactElement, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/providers/profile-provider';

import { SIDEBAR_WIDTH, type NavItem } from './nav-items';

type NavBarProps = { wide: boolean; children?: ReactNode };

/**
 * Navigation der App: auf dem Mac (breites Fenster) eine Seitenleiste
 * links, auf dem Handy eine Tab-Leiste unten. Die Einträge (TabTrigger)
 * kommen als children und werden hier nur angeordnet.
 */
export function NavBar({ wide, children, ...rest }: NavBarProps) {
  const insets = useSafeAreaInsets();
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{ name: string }>[];

  if (!wide) {
    return (
      <View {...rest} style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {items}
      </View>
    );
  }

  const main = items.filter((c) => c.props.name !== 'profil');
  const footer = items.filter((c) => c.props.name === 'profil');
  return (
    <View {...rest} style={[styles.sidebar, { paddingTop: Platform.OS === 'web' ? 52 : insets.top + Spacing.lg }]}>
      <View style={styles.brand}>
        <Wordmark width={116} />
      </View>
      <View style={styles.sideList}>{main}</View>
      <View style={styles.sideFooter}>{footer}</View>
    </View>
  );
}

/** Props, die TabTrigger (asChild) weiterreicht – ohne ref, das hier nicht gebraucht wird. */
type TriggerSlotProps = Omit<TabTriggerSlotProps, 'ref'>;

type NavButtonProps = TriggerSlotProps & { item: NavItem; wide: boolean };

/** Ein Eintrag der Navigation – Darstellung je nach Seitenleiste oder Tab-Leiste. */
export function NavButton({ item, wide, isFocused = false, ...pressable }: NavButtonProps) {
  // Einträge, die in dieser Ansicht nicht direkt angezeigt werden
  if (wide && item.mobileOnly) return null;
  if (!wide && !item.mobileTab) return null;

  if (!wide) return <TabItem item={item} isFocused={isFocused} {...pressable} />;
  if (item.name === 'profil') return <UserChip isFocused={isFocused} {...pressable} />;
  return <SidebarItem item={item} isFocused={isFocused} {...pressable} />;
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

function TabItem({ item, isFocused, ...pressable }: ItemProps & { item: NavItem }) {
  const { active, press, handlers } = useNavAnimation(isFocused);
  const Icon = item.icon;
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 * active.get() }, { scale: (1 + 0.08 * active.get()) * (1 - 0.08 * press.get()) }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: active.get(), transform: [{ scale: active.get() }] }));

  return (
    <Pressable {...pressable} {...handlers} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: isFocused }}>
      <Animated.View style={iconStyle}>
        <Icon size={22} strokeWidth={isFocused ? 2.2 : 1.7} color={isFocused ? Colors.text : Colors.textFaint} />
      </Animated.View>
      <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]} numberOfLines={1}>
        {item.label}
      </Text>
      <Animated.View style={[styles.tabDot, dotStyle]} />
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
  // Tab-Leiste unten
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#050505',
    borderTopWidth: 1,
    borderTopColor: '#161618',
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  tabLabel: { color: Colors.textFaint, fontSize: 11, fontWeight: '500' },
  tabLabelActive: { color: Colors.text },
  tabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.accent, marginTop: 1 },
});
