import { Check, Sparkles, Ticket } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { GlassBackdrop, glassSurface, glassHover } from '@/components/ui/glass';
import { GradientFrame, GradientText } from '@/components/ui/gradient';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing } from '@/constants/theme';
import { BUSINESS_SEATS, formatPrice, LIMITS, PRICES } from '@/features/plan/plan-logic';
import { redeemVoucher } from '@/features/plan/voucher';
import { useHover } from '@/hooks/use-hover';

export type ChosenPlan = 'free' | 'pro' | 'business';

const PLANS: { key: ChosenPlan; name: string; price: number; tag?: string; points: string[] }[] = [
  {
    key: 'free',
    name: 'Gratis',
    price: 0,
    points: [
      'Kunden, Aufträge, Termine & Finanzen',
      'Angebote & Rechnungen als PDF',
      `${LIMITS.free.nexy} Nachrichten an Luna im Monat`,
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: PRICES.pro.month,
    tag: 'Beliebt',
    points: [
      'Alles aus Gratis',
      'E-Mails, Angebots-Links & Mahnungen',
      `${LIMITS.pro.nexy} Luna-Nachrichten & Steuer-Export`,
      'Design-Einstellungen, 1 Gerät gleichzeitig',
    ],
  },
  {
    key: 'business',
    name: 'Business',
    price: PRICES.business.month,
    tag: 'Für GbR & Teams',
    points: [
      'Alles aus Pro',
      `Bis zu ${BUSINESS_SEATS} Personen in einem Business`,
      `${LIMITS.business.nexy} Luna-Nachrichten fürs Team`,
      'Ideal für eine GbR',
    ],
  },
];

/**
 * Letzte Frage im Onboarding: Abo wählen (Gratis / Pro / Business) und darunter
 * ein Gutscheincode (z. B. 3 Monate Pro für die Warteliste).
 */
export function PlanStep({
  recommended,
  busy,
  onChoose,
  onVoucher,
}: {
  recommended: ChosenPlan;
  busy: ChosenPlan | null;
  onChoose: (plan: ChosenPlan) => void;
  onVoucher: (months: number) => void;
}) {
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redeem = async () => {
    setRedeeming(true);
    setError(null);
    const r = await redeemVoucher(code);
    setRedeeming(false);
    if (r.error) setError(r.error);
    else onVoucher(r.months ?? 3);
  };

  return (
    <View style={styles.wrap}>
      {PLANS.map((p, i) => (
        <Reveal key={p.key} delay={360 + i * 90}>
          <PlanCard plan={p} recommended={recommended === p.key} loading={busy === p.key} disabled={!!busy} onPress={() => onChoose(p.key)} />
        </Reveal>
      ))}

      <Reveal delay={680}>
        <View style={[styles.voucher, glassSurface]}>
          <GlassBackdrop radius={16} />
          <View style={styles.voucherHead}>
            <Ticket size={18} color={Colors.accent} />
            <Text style={styles.voucherTitle}>Du hast einen Gutscheincode?</Text>
          </View>
          <Text style={styles.voucherText}>Zum Beispiel von der Warteliste – jeder Code gilt einmal.</Text>
          <View style={styles.voucherRow}>
            <View style={styles.flex}>
              <TextField
                label="Gutscheincode"
                value={code}
                onChangeText={(v) => {
                  setCode(v.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="z. B. LUNA-7K2P"
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={() => void redeem()}
                maxLength={24}
              />
            </View>
          </View>
          <Button label="Einlösen" variant="secondary" loading={redeeming} disabled={!code.trim() || !!busy} onPress={() => void redeem()} />
          {error && <Notice tone="error">{error}</Notice>}
        </View>
      </Reveal>
    </View>
  );
}

function PlanCard({
  plan,
  recommended,
  loading,
  disabled,
  onPress,
}: {
  plan: (typeof PLANS)[number];
  recommended: boolean;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  const business = plan.key === 'business';
  const body = (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Lunaxora ${plan.name} wählen`}
      {...hoverProps}
      style={[styles.card, glassSurface, business && styles.cardBusiness, recommended && !business && styles.cardRecommended, hovered && [styles.cardHover, glassHover]]}>
      <GlassBackdrop radius={business ? 14.5 : 16} />
      <View style={styles.cardHead}>
        <Sparkles size={18} color={plan.key === 'pro' ? Colors.accent : business ? '#8B5CF6' : Colors.textMuted} />
        {business ? (
          <GradientText style={styles.name}>{`Lunaxora ${plan.name}`}</GradientText>
        ) : (
          <Text style={styles.name}>Lunaxora {plan.name}</Text>
        )}
        <View style={styles.flex} />
        {recommended ? (
          <Text style={styles.tagStrong}>Empfohlen</Text>
        ) : plan.tag ? (
          <Text style={styles.tag}>{plan.tag}</Text>
        ) : null}
      </View>
      <Text style={styles.price}>
        {plan.price === 0 ? '0 €' : formatPrice(plan.price)} <Text style={styles.per}>{plan.price === 0 ? 'für immer' : 'im Monat'}</Text>
      </Text>
      <View style={styles.points}>
        {plan.points.map((pt) => (
          <View key={pt} style={styles.point}>
            <Check size={15} color={plan.key === 'free' ? Colors.textMuted : Colors.accent} strokeWidth={2.6} />
            <Text style={styles.pointText}>{pt}</Text>
          </View>
        ))}
      </View>
      <Button
        label={plan.key === 'free' ? 'Kostenlos starten' : `${plan.name} wählen`}
        variant={plan.key === 'free' ? 'secondary' : 'primary'}
        loading={loading}
        disabled={disabled}
        onPress={onPress}
      />
    </Pressable>
  );
  return business ? <GradientFrame radius={16}>{body}</GradientFrame> : body;
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.lg },
  flex: { flex: 1 },
  card: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cardBusiness: { borderWidth: 0, borderRadius: 14.5, backgroundColor: Colors.surface },
  cardRecommended: { borderColor: 'rgba(47,227,154,0.5)' },
  cardHover: { backgroundColor: Colors.surfaceRaised },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  tag: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  tagStrong: { color: Colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  price: { color: Colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  per: { color: Colors.textMuted, fontSize: 14, fontWeight: '500' },
  points: { gap: 6 },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pointText: { color: Colors.text, fontSize: 14, lineHeight: 20, flex: 1 },
  voucher: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.surface,
  },
  voucherHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  voucherTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  voucherText: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  voucherRow: { flexDirection: 'row', gap: Spacing.md },
});
