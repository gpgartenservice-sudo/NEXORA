import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';

import {
  BUSINESS_ONLY,
  BUSINESS_SEATS,
  FEATURE_LABEL,
  formatPrice,
  PRICES,
  type ProFeature,
  type QuotaKind,
} from './plan-logic';

/**
 * Abo-Fenster: erscheint, wenn man eine gesperrte Funktion antippt oder eine Monatsgrenze
 * erreicht ist – mit dem Weg zum passenden Abo. Wird von überall per showPlanWall() geöffnet
 * (Knöpfe über useProGate, Server-Antworten „nur mit Pro“, „Kontingent aufgebraucht“).
 */
export type Wall = {
  feature?: ProFeature;
  quota?: QuotaKind;
  /** fertiger Text (z. B. „Deine 15 Nachrichten an Luna sind aufgebraucht …“) */
  text?: string;
};

type State = { open: boolean; wall: Wall | null };

let state: State = { open: false, wall: null };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const last = new Map<string, number>();

/** Gleiche Meldung kurz hintereinander (Knopf + Server) nur einmal; Vorlesen höchstens alle 10 Minuten */
const COOLDOWN: Partial<Record<string, number>> = { voice: 10 * 60_000 };

export function showPlanWall(wall: Wall, now = Date.now()) {
  const key = wall.feature ?? wall.quota ?? 'abo';
  if (now - (last.get(key) ?? -Infinity) < (COOLDOWN[key] ?? 1500)) return;
  last.set(key, now);
  state = { open: true, wall };
  notify();
}

export function closePlanWall() {
  if (!state.open) return;
  state = { ...state, open: false };
  notify();
}

/** Was gerade angezeigt würde (für Tests) */
export const peekPlanWall = () => state;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Überschrift und Text des Fensters */
export function wallText(wall: Wall): { title: string; text: string; business: boolean } {
  if (wall.quota) {
    return { title: 'Monatsgrenze erreicht', text: wall.text ?? 'Für diesen Monat ist dein Kontingent aufgebraucht.', business: false };
  }
  const f = wall.feature;
  const business = !!f && BUSINESS_ONLY.includes(f);
  const label = f ? `„${FEATURE_LABEL[f]}“` : 'Diese Funktion';
  if (business) {
    return {
      title: 'Das gibt es mit Lunaxora Business',
      text: `${label} ist in deinem Abo gesperrt. Mit Business arbeitet ihr mit bis zu ${BUSINESS_SEATS} Personen in einem Konto (${formatPrice(PRICES.business.month)} im Monat).`,
      business,
    };
  }
  return {
    title: 'Das gibt es mit Lunaxora Pro',
    text: `${label} ist in deinem Abo gesperrt. Mit Pro ist es sofort freigeschaltet – ab ${formatPrice(PRICES.pro.month)} im Monat.`,
    business,
  };
}

export function PlanWall() {
  const { open, wall } = useSyncExternalStore(subscribe, () => state, () => state);
  if (!wall) return null;
  const { title, text, business } = wallText(wall);

  const showPlans = () => {
    closePlanWall();
    router.push(wall.feature ? { pathname: '/profil/abo', params: { funktion: wall.feature } } : '/profil/abo');
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={closePlanWall} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.dim]} onPress={closePlanWall} accessibilityLabel="Schließen" />
        <Glass style={styles.card} accessibilityViewIsModal testID="plan-wall">
          <View style={[styles.icon, business && styles.iconBusiness]}>
            <Lock size={26} color={business ? '#C4B5FD' : Colors.accent} strokeWidth={2} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{text}</Text>
          <Button label={business ? 'Business ansehen' : 'Abo ansehen'} onPress={showPlans} />
          <View style={styles.later}>
            <TextLink label="Später" onPress={closePlanWall} />
          </View>
        </Glass>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  dim: { backgroundColor: 'rgba(0,0,0,0.55)' },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 28,
    padding: Spacing.xl,
    gap: Spacing.md,
    alignItems: 'stretch',
  },
  icon: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  iconBusiness: { backgroundColor: 'rgba(139,92,246,0.18)' },
  title: { color: Colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  text: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: Spacing.sm },
  later: { alignItems: 'center' },
});
