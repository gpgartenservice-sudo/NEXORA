import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { MoneyBurst } from '@/components/motion/money-burst';
import { Button } from '@/components/ui/button';
import { GradientText } from '@/components/ui/gradient';
import { Colors, Spacing } from '@/constants/theme';
import { BUSINESS_SEATS, formatPrice, PRICES } from '@/features/plan/plan-logic';

import type { ChosenPlan } from './plan-step';

/**
 * „Kauf abgeschlossen“ nach der Abo-Wahl im Onboarding – mit Geldscheinen,
 * die durch den Bildschirm fliegen.
 *
 * Solange Stripe noch nicht eingerichtet ist, wird hier nichts abgebucht: die Wahl
 * wird nur im Profil gemerkt (chosen_plan). Vor dem Start: durch die echte
 * Bezahlseite ersetzen (startCheckout aus billing-api.ts).
 */
export function PurchaseDone({
  plan,
  voucherMonths,
  onContinue,
}: {
  plan: Exclude<ChosenPlan, 'free'>;
  voucherMonths?: number;
  onContinue: () => void;
}) {
  const [burst, setBurst] = useState(0);
  const pop = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    pop.set(withDelay(120, withSpring(1, { damping: 8, stiffness: 150 })));
    ring.set(withDelay(300, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1)));
    const first = setTimeout(() => setBurst(1), 250);
    const second = setTimeout(() => setBurst(2), 1500);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [pop, ring]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.get() * 1.5),
    transform: [{ scale: 0.3 + 0.7 * pop.get() }, { rotate: `${(1 - pop.get()) * -40}deg` }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - ring.get()),
    transform: [{ scale: 1 + ring.get() * 1.4 }],
  }));

  const name = plan === 'business' ? 'Business' : 'Pro';
  const gift = !!voucherMonths;

  return (
    <View style={styles.wrap}>
      <MoneyBurst trigger={burst} count={26} />
      <View style={styles.badgeWrap}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.badge, checkStyle]}>
          <Check size={46} color={Colors.onAccent} strokeWidth={3} />
        </Animated.View>
      </View>
      <AnimatedTitle text={gift ? 'Gutschein eingelöst!' : 'Kauf abgeschlossen!'} style={styles.title} delay={350} />
      <Reveal delay={700}>
        <View style={styles.planRow}>
          <Text style={styles.welcome}>Willkommen bei </Text>
          {plan === 'business' ? (
            <GradientText style={styles.welcome}>{`Lunaxora ${name}`}</GradientText>
          ) : (
            <Text style={[styles.welcome, styles.pro]}>Lunaxora {name}</Text>
          )}
        </View>
      </Reveal>
      <Reveal delay={850}>
        <Text style={styles.text}>
          {gift
            ? `Du nutzt alle Pro-Funktionen jetzt ${voucherMonths} Monate kostenlos. Danach entscheidest du selbst, ob es weitergeht.`
            : plan === 'business'
              ? `${formatPrice(PRICES.business.month)} im Monat – für bis zu ${BUSINESS_SEATS} Personen. Dein Team lädst du unter Profil → Team ein.`
              : `${formatPrice(PRICES.pro.month)} im Monat – alle Pro-Funktionen sind freigeschaltet.`}
        </Text>
      </Reveal>
      <Reveal delay={1100} style={styles.button}>
        <Button label="Weiter" onPress={onContinue} />
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.lg, paddingTop: Spacing.xl },
  badgeWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
  title: { color: Colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.6, lineHeight: 40, textAlign: 'center' },
  planRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  welcome: { color: Colors.text, fontSize: 19, fontWeight: '600' },
  pro: { color: Colors.accent },
  text: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
  button: { width: '100%', maxWidth: 320, marginTop: Spacing.md },
});
