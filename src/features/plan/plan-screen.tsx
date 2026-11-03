import { router, useLocalSearchParams } from 'expo-router';
import { Check, Minus, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Colors, Spacing } from '@/constants/theme';
import { formatDay } from '@/features/documents/document-logic';

import {
  COMPARISON,
  FEATURE_LABEL,
  formatPrice,
  planLabel,
  PRICE_MONTH,
  PRICE_YEAR,
  PRO_LIMITS,
  type ProFeature,
  type QuotaKind,
} from './plan-logic';
import { usePlan } from './plan-provider';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/profil'));

/** Abo: aktueller Stand, Verbrauch, Vergleich Gratis/Pro, Pro holen. */
export function PlanScreen() {
  const { funktion } = useLocalSearchParams<{ funktion?: string }>();
  const feature = funktion && funktion in FEATURE_LABEL ? (funktion as ProFeature) : null;
  const { info, missing } = usePlan();
  const [now] = useState(() => new Date());
  const [asked, setAsked] = useState(false);

  return (
    <Screen maxWidth={760}>
      <PageHeader
        title="Dein Abo"
        subtitle="NEXORA Gratis oder Pro – was drin ist."
        back={{ label: 'Profil', onPress: back }}
      />
      {feature && (
        <View testID="plan-feature">
          <Notice>„{FEATURE_LABEL[feature]}“ gibt es mit NEXORA Pro.</Notice>
        </View>
      )}
      {missing && (
        <Notice>
          Das Abo ist in der Datenbank noch nicht eingerichtet (Skript 20261116090000_plans.sql) – bis dahin ist alles
          freigeschaltet.
        </Notice>
      )}

      {info && (
        <Reveal delay={120}>
          <Card>
            <Text style={styles.eyebrow}>DEIN STAND</Text>
            <Text style={styles.big} testID="plan-label">
              {planLabel(info, now)}
            </Text>
            <Text style={styles.body}>
              {info.plan === 'trial' && info.trial_ends_at
                ? `Du testest alle Pro-Funktionen bis zum ${formatDay(info.trial_ends_at.slice(0, 10))}. Danach geht es mit Gratis weiter – deine Daten bleiben.`
                : info.plan === 'pro'
                  ? info.current_period_end
                    ? `Läuft bis zum ${formatDay(info.current_period_end.slice(0, 10))} und verlängert sich automatisch.`
                    : 'Alle Funktionen freigeschaltet. Danke für deine Unterstützung!'
                  : 'Die wichtigsten Funktionen bleiben kostenlos. Mit Pro sparst du dir Arbeit.'}
            </Text>
            <UsageRow
              kind="nexy"
              label="Nexy-Nachrichten diesen Monat"
              used={info.usage.nexy.used}
              limit={info.usage.nexy.limit}
            />
            <UsageRow
              kind="receipt"
              label="Belege ausgelesen diesen Monat"
              used={info.usage.receipt.used}
              limit={info.usage.receipt.limit}
            />
          </Card>
        </Reveal>
      )}

      <Reveal delay={180}>
        <Card>
          <View style={styles.head}>
            <View style={[styles.col, styles.colLabel]} />
            <Text style={[styles.col, styles.colHead]}>Gratis</Text>
            <Text style={[styles.col, styles.colHead, styles.proHead]}>Pro</Text>
          </View>
          {COMPARISON.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={[styles.col, styles.colLabel, styles.rowLabel]}>{row.label}</Text>
              <Cell value={row.free} />
              <Cell value={row.pro} pro />
            </View>
          ))}
          <Text style={styles.hint}>
            * faire Nutzung: bis {PRO_LIMITS.nexy} Nexy-Nachrichten und {PRO_LIMITS.receipt} Belege im Monat.
          </Text>
        </Card>
      </Reveal>

      <Reveal delay={240}>
        <Card style={styles.offer}>
          <View style={styles.offerHead}>
            <Sparkles size={20} color={Colors.accent} />
            <Text style={styles.offerTitle}>NEXORA Pro</Text>
          </View>
          <Text style={styles.price}>
            {formatPrice(PRICE_MONTH)} <Text style={styles.per}>im Monat</Text>
          </Text>
          <Text style={styles.body}>
            oder {formatPrice(PRICE_YEAR)} im Jahr – zwei Monate geschenkt. Jederzeit kündbar, deine Daten bleiben immer
            deine.
          </Text>
          {info?.plan !== 'pro' && <Button label="Pro holen" onPress={() => setAsked(true)} />}
          {asked && (
            <View testID="plan-soon">
              <Notice>
                Bezahlen geht bald direkt hier – über App Store, Google Play oder Karte. Bis dahin kannst du alles in
                der Testphase nutzen.
              </Notice>
            </View>
          )}
        </Card>
      </Reveal>
    </Screen>
  );
}

function UsageRow({ label, used, limit }: { kind: QuotaKind; label: string; used: number; limit: number }) {
  return (
    <View style={styles.usage}>
      <View style={styles.usageHead}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={styles.usageValue}>
          {used} von {limit}
        </Text>
      </View>
      <ProgressBar value={limit ? used / limit : 0} height={5} />
    </View>
  );
}

function Cell({ value, pro }: { value: string | boolean; pro?: boolean }) {
  if (value === true)
    return (
      <View style={styles.col} accessibilityLabel="enthalten">
        <Check size={17} color={pro ? Colors.accent : Colors.text} strokeWidth={2.4} />
      </View>
    );
  if (value === false)
    return (
      <View style={styles.col} accessibilityLabel="nicht enthalten">
        <Minus size={16} color={Colors.textFaint} />
      </View>
    );
  return <Text style={[styles.col, styles.cellText, pro && styles.proText]}>{value}</Text>;
}

const styles = StyleSheet.create({
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  big: { color: Colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21 },
  hint: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18, marginTop: Spacing.xs },
  usage: { gap: 6 },
  usageHead: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  usageLabel: { color: Colors.textMuted, fontSize: 13.5 },
  usageValue: { color: Colors.text, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  head: { flexDirection: 'row', alignItems: 'center', paddingBottom: Spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  col: { width: 64, alignItems: 'center', textAlign: 'center' },
  colLabel: { flex: 1, width: undefined, alignItems: 'flex-start', textAlign: 'left' },
  colHead: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  proHead: { color: Colors.accent },
  rowLabel: { color: Colors.text, fontSize: 14, lineHeight: 19, paddingRight: Spacing.sm },
  cellText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  proText: { color: Colors.text },
  offer: { borderColor: 'rgba(47,227,154,0.35)' },
  offerHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  offerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  price: { color: Colors.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  per: { color: Colors.textMuted, fontSize: 15, fontWeight: '500' },
});
