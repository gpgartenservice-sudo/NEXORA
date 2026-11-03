import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Colors, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

type Props = {
  title: string;
  subtitle?: string;
  /** Zurück-Link über der Überschrift */
  back?: { label: string; onPress: () => void };
  /** Rechts neben der Überschrift, z. B. "Neuer Kunde" */
  action?: ReactNode;
  /** Kleines Element unter der Überschrift (z. B. Status) */
  meta?: ReactNode;
};

/** Seitenkopf mit optionalem Zurück-Link und Aktion rechts. */
export function PageHeader({ title, subtitle, back, action, meta }: Props) {
  const { hovered, hoverProps } = useHover();
  return (
    <View style={styles.wrap}>
      {back && (
        <Pressable onPress={back.onPress} accessibilityRole="link" style={styles.back} {...hoverProps}>
          <ChevronLeft size={16} color={hovered ? Colors.text : Colors.textMuted} />
          <Text style={[styles.backText, hovered && styles.backHover]}>{back.label}</Text>
        </Pressable>
      )}
      <View style={styles.row}>
        <View style={styles.texts}>
          <AnimatedTitle text={title} style={styles.title} align="left" />
          {!!subtitle && (
            <Reveal delay={180}>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </Reveal>
          )}
          {meta && <Reveal delay={220}>{meta}</Reveal>}
        </View>
        {action && (
          <Reveal delay={150} style={styles.action}>
            {action}
          </Reveal>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { color: Colors.textMuted, fontSize: 14, fontWeight: '500' },
  backHover: { color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.lg, flexWrap: 'wrap' },
  texts: { flex: 1, minWidth: 220, gap: Spacing.xs },
  // schmaler Bildschirm: Knöpfe dürfen umbrechen statt über den Rand zu ragen
  action: { maxWidth: '100%', flexShrink: 1 },
  title: { color: Colors.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.6, lineHeight: 40 },
  subtitle: { color: Colors.textMuted, fontSize: 15.5, lineHeight: 22 },
});
