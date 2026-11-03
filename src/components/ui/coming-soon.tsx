import { Check, ShieldCheck } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { Button } from './button';
import { Card } from './card';

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** Knopf für eine Funktion, die noch kommt – mit "bald"-Markierung. */
export function SoonButton({
  icon: Icon,
  label,
  open,
  onPress,
}: {
  icon: Icon;
  label: string;
  open: boolean;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} (kommt bald)`}
      aria-expanded={open}
      {...hoverProps}
      style={[styles.button, (hovered || open) && styles.buttonHover]}>
      <Icon size={17} color={Colors.text} strokeWidth={1.9} />
      <Text style={styles.buttonText}>{label}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>bald</Text>
      </View>
    </Pressable>
  );
}

type PanelProps = {
  icon: Icon;
  title: string;
  intro: string;
  points: string[];
  /** Hinweis zur Sicherheit/zum Datenschutz */
  safety?: string;
  onClose: () => void;
};

/** Erklärung zu einer Funktion, die bald kommt. */
export function ComingSoonPanel({ icon: Icon, title, intro, points, safety, onClose }: PanelProps) {
  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Icon size={22} color={Colors.accent} strokeWidth={1.8} />
        </View>
        <View style={styles.headTexts}>
          <Text style={styles.kicker}>KOMMT BALD</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
      <Text style={styles.text}>{intro}</Text>
      {points.map((p) => (
        <View key={p} style={styles.row}>
          <View style={styles.check}>
            <Check size={12} color={Colors.onAccent} strokeWidth={3} />
          </View>
          <Text style={styles.rowText}>{p}</Text>
        </View>
      ))}
      {!!safety && (
        <View style={styles.safe}>
          <ShieldCheck size={18} color={Colors.textMuted} strokeWidth={1.8} />
          <Text style={styles.safeText}>{safety}</Text>
        </View>
      )}
      <Button label="Alles klar" variant="secondary" onPress={onClose} />
    </Card>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
  },
  buttonHover: { borderColor: Colors.borderFocus },
  buttonText: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTexts: { gap: 2 },
  kicker: { color: Colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { color: Colors.text, fontSize: 14.5, flex: 1, lineHeight: 20 },
  safe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    padding: Spacing.md,
  },
  safeText: { color: Colors.textMuted, fontSize: 13, lineHeight: 18, flex: 1 },
});
