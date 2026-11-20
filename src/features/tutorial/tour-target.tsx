import { useFocusEffect } from 'expo-router';
import { CircleQuestionMark } from 'lucide-react-native';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle, type HostInstance } from 'react-native';

import { GlassBackdrop } from '@/components/ui/glass';
import { Colors } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { TUTORIALS, type TutorialId } from './tutorial-content';
import { useOptionalTutorial } from './tutorial-provider';

/** Markiert eine Stelle, die eine Einführung hervorheben kann. Ändert das Layout nicht. */
export function TourTarget({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tutorial = useOptionalTutorial();
  const register = tutorial?.register;
  const ref = useRef<HostInstance>(null);
  useEffect(() => register?.(id, ref), [id, register]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

/** Beim ersten Besuch eines Bereichs die Einführung zeigen (kurz nach dem Einblenden der Seite). */
export function useAreaTutorial(id: TutorialId) {
  const tutorial = useOptionalTutorial();
  const autoStart = tutorial?.autoStart;
  const ready = tutorial?.ready ?? false;
  useFocusEffect(
    useCallback(() => {
      if (!autoStart || !ready) return;
      const timer = setTimeout(() => autoStart(id), 800);
      return () => clearTimeout(timer);
    }, [autoStart, ready, id]),
  );
}

/** „?“ – Einführung des Bereichs jederzeit wieder ansehen */
export function TutorialButton({ id }: { id: TutorialId }) {
  const tutorial = useOptionalTutorial();
  const { hovered, hoverProps } = useHover();
  if (!tutorial) return null;
  return (
    <Pressable
      onPress={() => tutorial.start(id)}
      accessibilityRole="button"
      accessibilityLabel={`Einführung: ${TUTORIALS[id].label}`}
      hitSlop={8}
      {...hoverProps}
      style={[styles.help, hovered && styles.helpHover]}>
      <GlassBackdrop radius={17} />
      <CircleQuestionMark size={19} color={hovered ? Colors.accent : Colors.text} strokeWidth={2.1} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // gut sichtbar auf jedem Hintergrund: helle Schrift, leichte Fläche und sichtbarer Rand (auch auf Glas)
  help: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  helpHover: { borderColor: 'rgba(47,227,154,0.7)', backgroundColor: 'rgba(47,227,154,0.14)' },
});
