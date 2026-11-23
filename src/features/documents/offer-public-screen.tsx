import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';

import {
  earlyStartHint,
  formatDay,
  formatMoney,
  isPrivateBuyer,
  sellerName,
  SMALL_BUSINESS_OFFER_NOTE,
  todayIso,
  withdrawalContract,
  withdrawalForm,
  withdrawalNotice,
  withdrawalStatement,
  type DocumentData,
} from './document-logic';
import type { LogoImage } from './logo-logic';
import { offerAnswer, validOfferToken } from './offer-link';
import { downloadPdf, pdfSupported, preparePdf } from './save-pdf';

/**
 * Öffentliche Angebotsseite (ohne Anmeldung): Kunde sieht das Angebot über
 * den geheimen Link, lädt das PDF und nimmt an oder lehnt ab. Privatkunden können
 * danach online widerrufen (§ 356a BGB, Skript 20261203090000_widerruf_online.sql).
 * Gleicher Ablauf und Wortlaut wie web-angebot/index.html (die Seite auf lunaxora.de).
 * Bewusst hell und neutral – es ist das Angebot des Selbstständigen, nicht Lunaxora.
 */

type OfferView = {
  number: string;
  issued_on: string;
  valid_until: string | null;
  total: number;
  data: DocumentData;
  accepted_at: string | null;
  accepted_name: string | null;
  declined_at: string | null;
  decline_note: string | null;
  /** Online-Widerruf (fehlt bei altem Datenbank-Stand) */
  withdrawn_at?: string | null;
  withdrawal?: { name?: string; contract?: string; email?: string } | null;
  withdrawal_mailed_at?: string | null;
  withdrawal_open?: boolean;
  logo: LogoImage | null;
};

const ACCENT = '#2FE39A';
const INK = '#111214';
const MUTED = '#5C6066';
const LINE = '#E4E6E9';

export function OfferPublicScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [offer, setOffer] = useState<OfferView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [mode, setMode] = useState<'none' | 'accept' | 'decline' | 'withdraw'>('none');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [wName, setWName] = useState('');
  const [wContract, setWContract] = useState('');
  const [wEmail, setWEmail] = useState('');
  const [receipt, setReceipt] = useState<'sending' | 'sent' | 'failed' | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'Angebot';
    if (!validOfferToken(token)) return;
    let active = true;
    supabase.rpc('offer_view', { p_token: token }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.warn('[Angebot]', error);
        return setState('failed');
      }
      if (!data) return setState('missing');
      setOffer({ ...(data as OfferView), total: Number((data as OfferView).total) });
      setState('ready');
    });
    return () => {
      active = false;
    };
  }, [token]);

  const shownState = !validOfferToken(token) ? 'missing' : state;
  const today = todayIso();

  if (shownState !== 'ready' || !offer) {
    return (
      <Page>
        {shownState === 'loading' ? (
          <ActivityIndicator color={INK} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.h1}>{shownState === 'missing' ? 'Link ungültig' : 'Gerade nicht erreichbar'}</Text>
            <Text style={styles.text}>
              {shownState === 'missing'
                ? 'Dieses Angebot gibt es nicht (mehr) oder der Link ist unvollständig. Bitte fragen Sie direkt nach einem neuen Link.'
                : 'Das Angebot konnte gerade nicht geladen werden. Bitte versuchen Sie es in ein paar Minuten noch einmal.'}
            </Text>
          </View>
        )}
      </Page>
    );
  }

  const d = offer.data;
  const s = d.seller;
  const company = sellerName(s);
  const answer = offerAnswer(offer, today);
  const t = d.totals;
  // Privatkunde nimmt online an = Fernabsatzvertrag: Widerrufsbelehrung vor der Annahme (§ 312d BGB, Art. 246a EGBGB)
  const withdrawal = isPrivateBuyer(d.buyer) && !offer.withdrawn_at && (answer.state === 'open' || answer.state === 'accepted');

  const reload = async () => {
    const { data } = await supabase.rpc('offer_view', { p_token: token });
    if (data) setOffer({ ...(data as OfferView), total: Number((data as OfferView).total) });
  };

  const accept = async () => {
    if (name.trim().length < 2) return setProblem('Bitte geben Sie Ihren Namen ein.');
    if (!confirm) return setProblem('Bitte bestätigen Sie, dass Sie das Angebot verbindlich annehmen.');
    setBusy(true);
    setProblem(null);
    const { data, error } = await supabase.rpc('offer_accept', { p_token: token, p_name: name.trim() });
    setBusy(false);
    const err = error ? 'failed' : (data as { error?: string } | null)?.error;
    if (err) return setProblem(ERRORS[err] ?? ERRORS.failed);
    setMode('none');
    await reload();
  };

  const decline = async () => {
    setBusy(true);
    setProblem(null);
    const { data, error } = await supabase.rpc('offer_decline', { p_token: token, p_note: note.trim() });
    setBusy(false);
    const err = error ? 'failed' : (data as { error?: string } | null)?.error;
    if (err) return setProblem(ERRORS[err] ?? ERRORS.failed);
    setMode('none');
    await reload();
  };

  // Eingangsbestätigung per E-Mail (Funktion "mail", ohne Anmeldung)
  const sendReceipt = async () => {
    setReceipt('sending');
    const { error } = await supabase.functions.invoke('mail', { body: { kind: 'withdrawal', token } });
    let sent = !error;
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      sent = (body as { error?: string } | null)?.error === 'already_sent';
    }
    setReceipt(sent ? 'sent' : 'failed');
    if (sent) await reload();
  };

  const startWithdraw = () => {
    if (!wName) setWName(offer.accepted_name || d.buyer.name || '');
    if (!wContract) setWContract(withdrawalContract(offer.number, offer.issued_on));
    if (!wEmail) setWEmail(d.buyer.email ?? '');
    setProblem(null);
    setMode('withdraw');
  };

  const withdraw = async () => {
    const n = wName.trim();
    const c = wContract.trim();
    const e = wEmail.trim();
    if (n.length < 2) return setProblem('Bitte geben Sie Ihren Namen ein.');
    if (!c) return setProblem(ERRORS.invalid_contract);
    if (!EMAIL.test(e)) return setProblem(ERRORS.invalid_email);
    setBusy(true);
    setProblem(null);
    const { data, error } = await supabase.rpc('offer_withdraw', { p_token: token, p_name: n, p_contract: c, p_email: e });
    setBusy(false);
    const err = error ? 'failed' : (data as { error?: string } | null)?.error;
    if (err && err !== 'already_withdrawn') return setProblem(ERRORS[err] ?? ERRORS.failed);
    setMode('none');
    await reload();
    await sendReceipt();
  };

  const pdf = async () => {
    try {
      const file = await preparePdf(
        { kind: 'offer', number: offer.number, issued_on: offer.issued_on, due_on: offer.valid_until, data: d },
        offer.logo,
      );
      downloadPdf(file);
    } catch (e) {
      setProblem(`Das PDF konnte nicht erstellt werden. (${String(e)})`);
    }
  };

  return (
    <Page>
      <View style={styles.card}>
        {/* Absender */}
        <View style={styles.sellerRow}>
          {offer.logo ? (
            <Image
              source={{ uri: `data:${offer.logo.mime};base64,${offer.logo.data}` }}
              style={[styles.logo, { aspectRatio: offer.logo.width / offer.logo.height }]}
              contentFit="contain"
              accessibilityLabel={`Logo ${company}`}
            />
          ) : (
            <Text style={styles.company}>{company}</Text>
          )}
        </View>
        <Text style={styles.small}>
          {[company, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>ANGEBOT</Text>
          <Text style={styles.h1}>{offer.number}</Text>
          <Text style={styles.text}>
            vom {formatDay(offer.issued_on)}
            {offer.valid_until ? ` · gültig bis ${formatDay(offer.valid_until)}` : ''}
          </Text>
          <Text style={styles.text}>für {d.buyer.company || d.buyer.name}</Text>
        </View>

        {/* Positionen */}
        <View style={styles.items}>
          {d.items.map((it, i) => (
            <View key={i} style={styles.item}>
              <View style={styles.itemTexts}>
                <Text style={styles.itemTitle}>{it.description}</Text>
                {!!it.details && <Text style={styles.small}>{it.details}</Text>}
                <Text style={styles.small}>
                  {it.quantity.toLocaleString('de-DE')} {it.unit} × {formatMoney(it.unit_price)}
                </Text>
              </View>
              <Text style={styles.itemSum}>{formatMoney(it.quantity * it.unit_price)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          {t.discount_amount > 0 && (
            <Line
              label={`Rabatt ${t.discount_percent.toLocaleString('de-DE')} %`}
              value={`– ${formatMoney(t.discount_amount)}`}
            />
          )}
          {!d.small_business && <Line label="Netto" value={formatMoney(t.net)} />}
          {!d.small_business && <Line label={`zzgl. ${t.vat_rate} % USt`} value={formatMoney(t.vat_amount)} />}
          <Line label={d.monthly ? 'Gesamt pro Monat' : 'Gesamt'} value={formatMoney(t.gross)} strong />
          {d.small_business && (
            <Text style={styles.small}>{SMALL_BUSINESS_OFFER_NOTE}</Text>
          )}
        </View>

        {withdrawal && (
          <View style={styles.box} testID="offer-public-withdrawal">
            <Text style={styles.boxTitle}>Widerrufsrecht</Text>
            <Text style={styles.text}>
              Als Privatkunde können Sie diesen Vertrag nach der Annahme 14 Tage lang ohne Angabe von Gründen widerrufen –
              auch online hier auf dieser Seite.
            </Text>
            <Link
              label={showWithdrawal ? 'Widerrufsbelehrung ausblenden' : 'Widerrufsbelehrung und Muster-Widerrufsformular anzeigen'}
              onPress={() => setShowWithdrawal((v) => !v)}
            />
            {showWithdrawal && (
              <View style={styles.legal}>
                <Text style={styles.legalTitle}>Widerrufsbelehrung</Text>
                {withdrawalNotice(s).map((sec) => (
                  <View key={sec.heading} style={styles.legalSection}>
                    <Text style={styles.legalHeading}>{sec.heading}</Text>
                    {sec.paragraphs.map((p, i) => (
                      <Text key={i} style={styles.small}>
                        {p}
                      </Text>
                    ))}
                  </View>
                ))}
                <Text style={styles.small}>{earlyStartHint(s)}</Text>
                <Text style={styles.legalTitle}>Muster-Widerrufsformular</Text>
                <View style={styles.legalSection}>
                  {withdrawalForm(s).map((line, i) => (
                    <Text key={i} style={styles.small}>
                      {line}
                    </Text>
                  ))}
                </View>
              </View>
            )}
            {/* Widerrufsfunktion (§ 356a BGB): während der Frist immer sichtbar */}
            {!!offer.withdrawal_open && mode !== 'withdraw' && (
              <View style={[styles.actions, styles.withdrawTop]}>
                <Btn label="Vertrag widerrufen" dark onPress={startWithdraw} testID="offer-public-withdraw" />
              </View>
            )}
            {!!offer.withdrawal_open && mode === 'withdraw' && (
              <View style={[styles.form, styles.withdrawForm]}>
                <Text style={styles.boxTitle}>Vertrag widerrufen</Text>
                <Text style={styles.small}>
                  Bitte prüfen Sie Ihre Angaben und tippen Sie dann auf „Widerruf bestätigen“. Die Eingangsbestätigung
                  bekommen Sie sofort per E-Mail.
                </Text>
                <Text style={styles.label}>Ihr Name</Text>
                <TextInput value={wName} onChangeText={setWName} style={styles.input} accessibilityLabel="Ihr Name" maxLength={100} />
                <Text style={styles.label}>Welcher Vertrag?</Text>
                <TextInput
                  value={wContract}
                  onChangeText={setWContract}
                  style={styles.input}
                  accessibilityLabel="Welcher Vertrag?"
                  maxLength={200}
                />
                <Text style={styles.label}>E-Mail für die Eingangsbestätigung</Text>
                <TextInput
                  value={wEmail}
                  onChangeText={setWEmail}
                  style={styles.input}
                  accessibilityLabel="E-Mail für die Eingangsbestätigung"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  maxLength={254}
                />
                <Text style={styles.small}>Ihre Erklärung:</Text>
                <Text style={[styles.small, styles.statement]}>„{withdrawalStatement(wContract.trim())}“</Text>
                {problem && <Text style={styles.problem}>{problem}</Text>}
                <View style={styles.actions}>
                  <Btn
                    label={busy ? 'Wird gesendet …' : 'Widerruf bestätigen'}
                    dark
                    onPress={() => void withdraw()}
                    disabled={busy}
                  />
                  <Btn label="Zurück" onPress={() => setMode('none')} disabled={busy} />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Antwort */}
        {!!offer.withdrawn_at && (
          <View style={styles.box} testID="offer-public-withdrawn">
            <Text style={styles.boxTitle}>✓ Widerruf eingegangen</Text>
            <Text style={styles.text}>am {dayTime(offer.withdrawn_at)}.</Text>
            <Text style={styles.small}>Ihre Erklärung:</Text>
            <Text style={[styles.small, styles.statement]}>„{withdrawalStatement(offer.withdrawal?.contract ?? '')}“</Text>
            <Text style={styles.small}>
              Name: {offer.withdrawal?.name ?? ''} · E-Mail: {offer.withdrawal?.email ?? ''}
            </Text>
            {offer.withdrawal_mailed_at || receipt === 'sent' ? (
              <Text style={styles.text}>
                Die Eingangsbestätigung haben wir an {offer.withdrawal?.email || 'Ihre E-Mail-Adresse'} geschickt.
              </Text>
            ) : receipt === 'sending' ? (
              <Text style={styles.text}>Die Eingangsbestätigung wird gerade per E-Mail verschickt …</Text>
            ) : (
              <>
                <Text style={styles.problem}>
                  Die Eingangsbestätigung per E-Mail hat noch nicht geklappt. Ihr Widerruf ist trotzdem eingegangen. Bitte
                  speichern oder drucken Sie diese Seite als Nachweis.
                </Text>
                <View style={styles.actions}>
                  <Btn label="Bestätigung erneut senden" onPress={() => void sendReceipt()} />
                  {Platform.OS === 'web' && typeof window !== 'undefined' && (
                    <Btn label="Seite drucken" onPress={() => window.print()} />
                  )}
                </View>
              </>
            )}
          </View>
        )}
        {answer.state === 'accepted' && !offer.withdrawn_at && (
          <View style={[styles.box, styles.boxOk]} testID="offer-public-accepted">
            <Text style={styles.boxTitle}>✓ Angenommen</Text>
            <Text style={styles.text}>
              am {formatDay(answer.at.slice(0, 10))}
              {answer.name ? ` von ${answer.name}` : ''}. Vielen Dank! {s.owner_name || company} meldet sich bei Ihnen.
            </Text>
          </View>
        )}
        {answer.state === 'declined' && (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Abgelehnt</Text>
            <Text style={styles.text}>am {formatDay(answer.at.slice(0, 10))}. Danke für Ihre Rückmeldung.</Text>
          </View>
        )}
        {answer.state === 'expired' && (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Abgelaufen</Text>
            <Text style={styles.text}>
              Dieses Angebot ist nicht mehr gültig. Bitte melden Sie sich für ein neues Angebot.
            </Text>
          </View>
        )}

        {answer.state === 'open' && mode === 'none' && (
          <View style={styles.actions}>
            <Btn label="Angebot annehmen" primary onPress={() => setMode('accept')} />
            <Btn label="Ablehnen oder Rückfrage" onPress={() => setMode('decline')} />
          </View>
        )}

        {answer.state === 'open' && mode === 'accept' && (
          <View style={styles.form}>
            <Text style={styles.label}>Ihr Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Vor- und Nachname"
              style={styles.input}
              accessibilityLabel="Ihr Name"
              maxLength={100}
            />
            <Pressable
              onPress={() => setConfirm((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirm }}
              aria-checked={confirm}
              accessibilityLabel="Ich nehme das Angebot verbindlich an"
              style={styles.confirm}>
              <View style={[styles.checkbox, confirm && styles.checkboxOn]}>
                {confirm && <Text style={styles.tick}>✓</Text>}
              </View>
              <Text style={styles.text}>
                Ich nehme das Angebot {offer.number} über {formatMoney(t.gross)}
                {d.monthly ? ' pro Monat' : ''} verbindlich an.
              </Text>
            </Pressable>
            {withdrawal && (
              <Text style={styles.small}>
                Ihr Widerrufsrecht bleibt bestehen. Die Widerrufsbelehrung finden Sie oben im Kasten „Widerrufsrecht“.
              </Text>
            )}
            <View style={styles.actions}>
              <Btn
                label={busy ? 'Wird gesendet …' : 'Verbindlich annehmen'}
                primary
                onPress={() => void accept()}
                disabled={busy}
              />
              <Btn label="Zurück" onPress={() => setMode('none')} />
            </View>
          </View>
        )}

        {answer.state === 'open' && mode === 'decline' && (
          <View style={styles.form}>
            <Text style={styles.label}>Nachricht (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="z. B. Frage zum Termin oder warum es nicht passt"
              style={[styles.input, styles.multiline]}
              multiline
              accessibilityLabel="Nachricht"
              maxLength={1000}
            />
            <View style={styles.actions}>
              <Btn
                label={busy ? 'Wird gesendet …' : 'Angebot ablehnen'}
                onPress={() => void decline()}
                disabled={busy}
              />
              <Btn label="Zurück" onPress={() => setMode('none')} />
            </View>
            <Text style={styles.small}>
              Nur eine Frage? Dann melden Sie sich lieber direkt
              {s.phone ? ` (Tel. ${s.phone})` : ''}
              {s.email ? ` oder per E-Mail an ${s.email}` : ''}.
            </Text>
          </View>
        )}

        {problem && mode !== 'withdraw' && <Text style={styles.problem}>{problem}</Text>}

        <View style={styles.footerLinks}>
          {pdfSupported && <Link label="Angebot als PDF herunterladen" onPress={() => void pdf()} />}
          {!!s.email && <Link label={s.email} onPress={() => void Linking.openURL(`mailto:${s.email}`)} />}
          {!!s.phone && (
            <Link
              label={`Tel. ${s.phone}`}
              onPress={() => void Linking.openURL(`tel:${(s.phone ?? '').replace(/[^\d+]/g, '')}`)}
            />
          )}
        </View>
      </View>
      <Text style={styles.madeWith}>Erstellt mit Lunaxora</Text>
    </Page>
  );
}

const ERRORS: Record<string, string> = {
  invalid_name: 'Bitte geben Sie Ihren vollständigen Namen ein.',
  expired: 'Dieses Angebot ist leider abgelaufen.',
  already_accepted: 'Dieses Angebot wurde bereits angenommen.',
  already_declined: 'Dieses Angebot wurde bereits abgelehnt.',
  not_found: 'Dieses Angebot gibt es nicht mehr.',
  failed: 'Das hat gerade nicht geklappt. Bitte versuchen Sie es noch einmal.',
  already_withdrawn: 'Sie haben diesen Vertrag bereits widerrufen.',
  not_accepted: 'Dieses Angebot wurde noch nicht angenommen.',
  not_private: 'Der Online-Widerruf ist nur für Privatkunden.',
  too_late: 'Die Widerrufsfrist ist abgelaufen. Bitte melden Sie sich direkt.',
  invalid_contract: 'Bitte geben Sie an, welchen Vertrag Sie widerrufen.',
  invalid_email: 'Bitte geben Sie eine gültige E-Mail-Adresse für die Eingangsbestätigung ein.',
};

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

/** Zeitpunkt -> "23.11.2026 um 14:05 Uhr" (deutsche Zeit) */
function dayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return `${day} um ${time} Uhr`;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageInner}>
      {children}
    </ScrollView>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.text, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.text, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function Btn({
  label,
  onPress,
  primary,
  dark,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  dark?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
      style={[
        styles.btn,
        primary ? styles.btnPrimary : dark ? styles.btnDark : styles.btnSecondary,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary, dark && styles.btnTextDark]}>{label}</Text>
    </Pressable>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link">
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F5F7' },
  pageInner: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 16, minHeight: '100%' },
  card: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    padding: 24,
    gap: 16,
  },
  sellerRow: { minHeight: 32 },
  logo: { height: 56, maxWidth: 260 },
  company: { color: INK, fontSize: 20, fontWeight: '700' },
  titleBlock: { gap: 4, paddingTop: 8 },
  eyebrow: { color: MUTED, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  h1: { color: INK, fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  text: { color: INK, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  small: { color: MUTED, fontSize: 13, lineHeight: 19 },
  strong: { fontWeight: '700', fontSize: 17 },
  items: { borderTopWidth: 1, borderTopColor: LINE },
  item: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: LINE },
  itemTexts: { flex: 1, gap: 2 },
  itemTitle: { color: INK, fontSize: 15, fontWeight: '600' },
  itemSum: { color: INK, fontSize: 15, fontWeight: '600' },
  totals: { gap: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  box: { borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#F7F8F9', padding: 16, gap: 4 },
  boxOk: { borderColor: 'rgba(47,227,154,0.6)', backgroundColor: 'rgba(47,227,154,0.12)' },
  boxTitle: { color: INK, fontSize: 16, fontWeight: '700' },
  legal: { gap: 10, paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: LINE },
  legalTitle: { color: INK, fontSize: 15, fontWeight: '700', marginTop: 4 },
  legalSection: { gap: 6 },
  legalHeading: { color: INK, fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center', flexGrow: 1 },
  btnPrimary: { backgroundColor: ACCENT },
  btnSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  btnText: { color: INK, fontSize: 15, fontWeight: '600' },
  btnTextPrimary: { color: '#000000', fontWeight: '700' },
  btnDark: { backgroundColor: INK },
  btnTextDark: { color: '#FFFFFF', fontWeight: '700' },
  withdrawTop: { marginTop: 10 },
  withdrawForm: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE },
  statement: { borderLeftWidth: 3, borderLeftColor: LINE, paddingLeft: 10 },
  disabled: { opacity: 0.5 },
  form: { gap: 10 },
  label: { color: MUTED, fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: INK,
    backgroundColor: '#FFFFFF',
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  confirm: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#9AA0A6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  tick: { color: '#000000', fontSize: 14, fontWeight: '800' },
  problem: { color: '#C0392B', fontSize: 14 },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 14,
  },
  link: { color: INK, fontSize: 14, textDecorationLine: 'underline' },
  madeWith: { color: '#9AA0A6', fontSize: 12 },
});
