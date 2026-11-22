import { ChevronRight } from 'lucide-react-native';
import { Children, isValidElement, type ComponentType, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';

import { Card } from './card';

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * Einstellungen als kompakte Liste (wie in den iPhone-Einstellungen): eine Karte je Gruppe,
 * darin Zeilen mit Symbol, Name, kurzem Wert und Pfeil.
 */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  if (!rows.length) return null;
  return (
    <View style={styles.group}>
      {!!title && <Text style={styles.groupTitle}>{title.toUpperCase()}</Text>}
      <Card style={styles.card}>
        {rows.map((row, i) => (
          <View key={row.key ?? i} style={i > 0 ? styles.divider : undefined}>
            {row}
          </View>
        ))}
      </Card>
    </View>
  );
}

type RowProps = {
  icon: Icon;
  label: string;
  /** Kurzer Wert rechts bzw. unter dem Namen (z. B. „Lunaxora Teams“) */
  value?: string | null;
  /** Hinweis in Orange/Rot statt grau (z. B. „Angaben fehlen“) */
  warn?: boolean;
  /** z. B. <ProBadge /> */
  badge?: ReactNode;
  /** Zahl im grünen Kreis (z. B. ungelesene Nachrichten) */
  count?: number;
  onPress?: () => void;
  /** Statt des Pfeils, z. B. ein Schalter */
  trailing?: ReactNode;
  testID?: string;
};

export function SettingsRow({ icon: Icon, label, value, warn, badge, count, onPress, trailing, testID }: RowProps) {
  const { hovered, hoverProps } = useHover();
  const body = (
    <>
      <View style={styles.icon}>
        <Icon size={17} color={Colors.text} strokeWidth={1.9} />
      </View>
      <View style={styles.texts}>
        <View style={styles.labelRow}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {badge}
        </View>
        {!!value && (
          <Text style={[styles.value, warn && styles.warn]} numberOfLines={2} testID={testID}>
            {value}
          </Text>
        )}
      </View>
      {!!count && count > 0 && (
        <View style={styles.count}>
          <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
      {trailing ?? (onPress ? <ChevronRight size={17} color={Colors.textFaint} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        playSound('tick');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      {...hoverProps}
      style={({ pressed }) => [styles.row, styles.press, hovered && styles.hover, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  groupTitle: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginLeft: Spacing.xs },
  card: { paddingVertical: Spacing.xs, gap: 0 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 11 },
  press: { marginHorizontal: -Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: 12 },
  hover: { backgroundColor: 'rgba(255,255,255,0.045)' },
  pressed: { opacity: 0.7 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { color: Colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  value: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  warn: { color: '#FBBF24' },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  countText: { color: Colors.onAccent, fontSize: 11.5, fontWeight: '800' },
});
