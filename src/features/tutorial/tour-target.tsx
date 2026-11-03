import { useFocusEffect } from 'expo-router';
import { CircleQuestionMark } from 'lucide-react-native';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle, type HostInstance } from 'react-native';

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
      <CircleQuestionMark size={18} color={hovered ? Colors.text : Colors.textMuted} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  help: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  helpHover: { borderColor: Colors.borderFocus, backgroundColor: Colors.surfaceRaised },
});
