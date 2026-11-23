import { router, useLocalSearchParams } from 'expo-router';
import { Check, Minus, Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Segmented } from '@/components/ui/segmented';
import { GradientFrame, GradientText } from '@/components/ui/gradient';
import { Colors, Spacing, accentAlpha } from '@/constants/theme';
import { formatDay } from '@/features/documents/document-logic';
import { cancelPageUrl } from '@/features/legal/legal-logic';
import { useAuth } from '@/providers/auth-provider';

import { type BillingInterval, openBillingPortal, startCheckout } from './billing-api';
import {
  BUSINESS_SEATS,
  COMPARISON,
  FEATURE_LABEL,
  formatPrice,
  LIMITS,
  type PaidTier,
  planLabel,
  PRICES,
  type ProFeature,
  type QuotaKind,
  TEAMS_SEATS,
  TRIAL_DAYS,
} from './plan-logic';
import { usePlan } from './plan-provider';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/profil'));

/**
 * Bezahlt wird über Stripe im Browser (Web-App, Mac-App). In den Handy-Apps müssen digitale
 * Abos über App Store / Google Play laufen – das kommt mit deren Veröffentlichung.
 */
const CAN_PAY = Platform.OS === 'web';

/**
 * Zurück aus dem Browser (Bezahlseite/Kundenportal): Abo neu laden – und nach ein paar
 * Sekunden noch einmal, falls Stripes Meldung an den Server gerade erst unterwegs ist.
 */
function useRefreshOnReturn(refresh: () => Promise<void>) {
  const last = useRef(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = () => {
      if (Date.now() - last.current < 1500) return;
      last.current = Date.now();
      void refresh();
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 5000);
    };
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const onVisible = () => document.visibilityState === 'visible' && again();
      window.addEventListener('focus', again);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        window.removeEventListener('focus', again);
        document.removeEventListener('visibilitychange', onVisible);
        clearTimeout(timer);
      };
    }
    const sub = AppState.addEventListener('change', (state) => state === 'active' && again());
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [refresh]);
}

/** Abo: aktueller Stand, Verbrauch, Vergleich Gratis/Pro/Business/Teams, Abo holen. */
export function PlanScreen() {
  const { funktion } = useLocalSearchParams<{ funktion?: string }>();
  const feature = funktion && funktion in FEATURE_LABEL ? (funktion as ProFeature) : null;
  const { info, missing, admin, refresh } = usePlan();
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const [interval, setBillingInterval] = useState<BillingInterval>('year');
  const [busy, setBusy] = useState<PaidTier | 'portal' | null>(null);
  const [failed, setFailed] = useState<{ key: PaidTier | 'portal'; text: string } | null>(null);
  useRefreshOnReturn(refresh);
  const paid = info?.plan === 'pro' || info?.plan === 'business' || info?.plan === 'teams';

  const run = async (key: PaidTier | 'portal') => {
    setBusy(key);
    setFailed(null);
    const { error } = key === 'portal' ? await openBillingPortal() : await startCheckout(key, interval);
    setBusy(null);
    if (error) setFailed({ key, text: error });
  };
  // Handy: schmalere Spalten, damit lange Wörter in der ersten Spalte nicht mitten im Wort umbrechen
  const narrow = useWindowDimensions().width < 480;
  const col = [styles.col, narrow && styles.colNarrow];

  return (
    <Screen maxWidth={760}>
      <PageHeader
        title="Dein Abo"
        subtitle="Gratis, Pro, Business und Teams im Vergleich."
        back={{ label: 'Profil', onPress: back }}
      />
      {feature && (
        <View testID="plan-feature">
          <Notice>„{FEATURE_LABEL[feature]}“ gibt es mit Lunaxora Pro.</Notice>
        </View>
      )}
      {missing && (
        <Notice>
          Abo-Skript fehlt noch (20261116090000_plans.sql) – bis dahin ist alles frei.
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
              {admin
                ? 'Admin-Zugang: alles freigeschaltet, kostenlos – es wird nichts abgebucht.'
                : info.plan === 'trial' && info.trial_ends_at
                ? `Alle Pro-Funktionen bis zum ${formatDay(info.trial_ends_at.slice(0, 10))}. Danach Gratis – deine Daten bleiben.`
                : paid
                  ? info.current_period_end
                    ? info.status === 'canceled'
                      ? `Gekündigt – läuft bis zum ${formatDay(info.current_period_end.slice(0, 10))}. Danach Gratis, deine Daten bleiben.`
                      : `Verlängert sich am ${formatDay(info.current_period_end.slice(0, 10))} automatisch.`
                    : 'Alles freigeschaltet – danke! 💚'
                  : 'Das Wichtigste bleibt kostenlos. Pro spart dir Arbeit.'}
            </Text>
            <UsageRow
              kind="nexy"
              label="Luna-Nachrichten diesen Monat"
              used={info.usage.nexy.used}
              limit={info.usage.nexy.limit}
            />
            <UsageRow
              kind="receipt"
              label="Belege ausgelesen diesen Monat"
              used={info.usage.receipt.used}
              limit={info.usage.receipt.limit}
            />
            <UsageRow
              kind="voice"
              label="Vorgelesen diesen Monat"
              used={info.usage.voice.used}
              limit={info.usage.voice.limit}
            />
            {paid && CAN_PAY && !admin && (
              <Button
                label="Abo verwalten oder kündigen"
                variant="secondary"
                loading={busy === 'portal'}
                onPress={() => void run('portal')}
              />
            )}
            {failed?.key === 'portal' && <Notice tone="error">{failed.text}</Notice>}
          </Card>
        </Reveal>
      )}

      <Reveal delay={180}>
        <Card>
          <View style={styles.head}>
            <View style={[styles.col, styles.colLabel]} />
            <Text style={[col, styles.colHead, narrow && styles.colHeadNarrow]}>Gratis</Text>
            <Text style={[col, styles.colHead, narrow && styles.colHeadNarrow, styles.proHead]}>Pro</Text>
            <View style={col}>
              <GradientText style={[styles.colHead, narrow && styles.colHeadNarrow]}>Business</GradientText>
            </View>
            <View style={col}>
              <GradientText style={[styles.colHead, narrow && styles.colHeadNarrow]}>Teams</GradientText>
            </View>
          </View>
          {COMPARISON.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={[styles.col, styles.colLabel, styles.rowLabel, narrow && styles.rowLabelNarrow]}>{row.label}</Text>
              <Cell value={row.free} narrow={narrow} />
              <Cell value={row.pro} pro narrow={narrow} />
              <Cell value={row.business} pro narrow={narrow} />
              <Cell value={row.teams} pro narrow={narrow} />
            </View>
          ))}
          <Text style={styles.hint}>
            Pro Kalendermonat · 1× Vorlesen = bis 400 Zeichen. Testphase ({TRIAL_DAYS} Tage): alles aus Pro mit {LIMITS.trial.nexy} Nachrichten, {LIMITS.trial.receipt} Belegen, {LIMITS.trial.voice}× Vorlesen.
          </Text>
        </Card>
      </Reveal>

      <Reveal delay={220}>
        <View style={styles.billing}>
          <Segmented
            value={interval}
            onChange={setBillingInterval}
            options={[
              { value: 'month', label: 'Monatlich' },
              { value: 'year', label: 'Jährlich · −17 %' },
            ]}
          />
          <Text style={styles.hint}>Endpreise · keine Umsatzsteuer (§ 19 UStG)</Text>
        </View>
      </Reveal>

      <Reveal delay={240}>
        <Card>
          <View style={styles.offerHead}>
            <Sparkles size={20} color={Colors.textMuted} />
            <Text style={styles.offerTitle}>Lunaxora Gratis</Text>
            {info?.plan === 'free' && <Text style={styles.current}>Dein Abo</Text>}
          </View>
          <Text style={styles.price}>
            0 € <Text style={styles.per}>für immer</Text>
          </Text>
          <Text style={styles.body}>
            Alles Wichtige plus {LIMITS.free.nexy} Luna-Nachrichten im Monat. Ohne Kündigung.
          </Text>
        </Card>
      </Reveal>

      {TIERS.map((tier, i) => {
        const price = PRICES[tier.key];
        const current = info?.plan === tier.key;
        const business = tier.key === 'business' || tier.key === 'teams';
        const card = (
            <Card style={tier.key === 'pro' ? styles.offer : business ? styles.offerBusiness : undefined}>
              <View style={styles.offerHead}>
                <Sparkles size={20} color={tier.key === 'pro' ? Colors.accent : '#8B5CF6'} />
                {business ? (
                  <View style={styles.flex}>
                    <GradientText style={styles.offerTitle}>{`Lunaxora ${tier.name}`}</GradientText>
                  </View>
                ) : (
                  <Text style={styles.offerTitle}>Lunaxora {tier.name}</Text>
                )}
                {current && <Text style={styles.current}>Dein Abo</Text>}
              </View>
              <Text style={styles.price} testID={`price-${tier.key}`}>
                {formatPrice(interval === 'year' ? price.year : price.month)}{' '}
                <Text style={styles.per}>{interval === 'year' ? 'im Jahr' : 'im Monat'}</Text>
              </Text>
              <Text style={styles.body}>
                {interval === 'year'
                  ? `= ${formatPrice(price.year / 12)} im Monat, 2 Monate geschenkt.`
                  : `Jährlich ${formatPrice(price.year)} – 2 Monate geschenkt.`}{' '}
                {tier.text} {interval === 'year' ? 'Zum Jahresende kündbar.' : 'Monatlich kündbar.'}
              </Text>
              {!current && CAN_PAY && !admin && (
                <Button
                  label={paid ? `Zu ${tier.name} wechseln` : `${tier.name} holen`}
                  loading={busy === tier.key}
                  disabled={!!busy}
                  onPress={() => void run(tier.key)}
                />
              )}
              {failed?.key === tier.key && <Notice tone="error">{failed.text}</Notice>}
            </Card>
        );
        return (
          <Reveal key={tier.key} delay={260 + i * 60}>
            {business ? <GradientFrame radius={16}>{card}</GradientFrame> : card}
          </Reveal>
        );
      })}
      {/* Kündigungsbutton nach § 312k BGB: immer sichtbar, führt zu lunaxora.de/kuendigen/ */}
      <Reveal delay={260 + TIERS.length * 60}>
        <View style={styles.cancel} testID="plan-cancel">
          <Button label="Verträge hier kündigen" variant="secondary" onPress={() => void Linking.openURL(cancelPageUrl(user?.email))} />
          <Button
            label="Vertrag widerrufen"
            variant="secondary"
            onPress={() => void Linking.openURL(cancelPageUrl(user?.email, null, 'widerrufen'))}
          />
          <Text style={styles.hint}>
            Kündigen geht jederzeit online, ohne Anmeldung, mit Bestätigung per E-Mail. Dein Abo läuft bis zum Ende des bezahlten Zeitraums, danach geht es mit Gratis weiter. Als Verbraucher kannst du ein neues Abo innerhalb von 14 Tagen auch widerrufen.
          </Text>
        </View>
      </Reveal>
      {!CAN_PAY && !paid && (
        <View testID="plan-soon">
          <Notice>
            Bezahlen in der App kommt bald – bis dahin Testphase und Gratis.
          </Notice>
        </View>
      )}
    </Screen>
  );
}

const TIERS: { key: PaidTier; name: string; text: string }[] = [
  {
    key: 'pro',
    name: 'Pro',
    text: `Alles inklusive Design, ${LIMITS.pro.nexy} Luna-Nachrichten und ${LIMITS.pro.receipt} Belege im Monat.`,
  },
  {
    key: 'business',
    name: 'Business',
    text: `Alles aus Pro für bis zu ${BUSINESS_SEATS} Personen – ideal für eine GbR. Mit Team-Chats, Rollen und Arbeitsplan. ${LIMITS.business.nexy} Nachrichten und ${LIMITS.business.receipt} Belege fürs Team.`,
  },
  {
    key: 'teams',
    name: 'Teams',
    text: `Für Firmen mit Mitarbeitern: bis zu ${TEAMS_SEATS} Personen mit Rollen und Rechten, Chats für Leitung und Team, Arbeitsplan, Urlaubsanträgen und Krankmeldungen. ${LIMITS.teams.nexy} Nachrichten und ${LIMITS.teams.receipt} Belege fürs Team.`,
  },
];

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

function Cell({ value, pro, narrow }: { value: string | boolean; pro?: boolean; narrow?: boolean }) {
  const col = [styles.col, narrow && styles.colNarrow];
  if (value === true)
    return (
      <View style={col} accessibilityLabel="enthalten">
        <Check size={17} color={pro ? Colors.accent : Colors.text} strokeWidth={2.4} />
      </View>
    );
  if (value === false)
    return (
      <View style={col} accessibilityLabel="nicht enthalten">
        <Minus size={16} color={Colors.textFaint} />
      </View>
    );
  return <Text style={[col, styles.cellText, pro && styles.proText]}>{value}</Text>;
}

const styles = StyleSheet.create({
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  big: { color: Colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21 },
  hint: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18, marginTop: Spacing.xs },
  cancel: { gap: Spacing.sm },
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
  colNarrow: { width: 47 },
  colLabel: { flex: 1, width: undefined, alignItems: 'flex-start', textAlign: 'left' },
  colHead: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  colHeadNarrow: { fontSize: 11, letterSpacing: -0.2 },
  proHead: { color: Colors.accent },
  rowLabel: { color: Colors.text, fontSize: 14, lineHeight: 19, paddingRight: Spacing.sm },
  rowLabelNarrow: { fontSize: 13, lineHeight: 18, paddingRight: Spacing.xs },
  cellText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  proText: { color: Colors.text },
  offer: { borderColor: accentAlpha(0.35) },
  offerBusiness: { borderWidth: 0 },
  flex: { flex: 1 },
  offerHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  offerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
  current: { color: Colors.accent, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.3 },
  billing: { gap: Spacing.sm },
  price: { color: Colors.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  per: { color: Colors.textMuted, fontSize: 15, fontWeight: '500' },
});
