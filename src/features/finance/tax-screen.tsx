import { router } from 'expo-router';
import { Archive, ChevronRight, Download, FileSpreadsheet, FileText, PiggyBank } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { ActionChip } from '@/components/ui/action-chip';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { formatEuro } from '@/features/crm/order-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { pdfSupported } from '@/features/documents/save-pdf';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';
import { useHover } from '@/hooks/use-hover';
import { fetchBytes, saveFile, savesViaShareSheet } from '@/lib/files';
import { useAuth } from '@/providers/auth-provider';

import { useFinance } from './finance-provider';
import { receiptUrl } from './receipt-file';
import {
  expenseOccurrences,
  expensesByCategory,
  expensesCsv,
  invoiceFigures,
  invoicesCsv,
  invoicesOfYear,
  RESERVE_CHOICES,
  receiptFileName,
  SMALL_BUSINESS_LIMIT,
  smallBusinessCheck,
  taxReserve,
  vatSummary,
  yearTotals,
} from './tax-logic';
import { useTaxReservePercent } from './tax-settings';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/finanzen'));

/** Datei speichern (Mac/Browser: Download, Handy: Teilen-Menü) */
const download = (bytes: Uint8Array | string, fileName: string, mime: string) => saveFile(bytes, fileName, mime);
const SAVED = savesViaShareSheet ? 'ZIP erstellt' : 'ZIP gespeichert';

/** Kategorien + Ausgaben, die direkt an Aufträgen eingetragen sind (Rest bis zur Summe) */
function withOrderExpenses(categories: { label: string; amount: number }[], total: number) {
  const rest = Math.round((total - categories.reduce((x, c) => x + c.amount, 0)) * 100) / 100;
  return rest > 0 ? [...categories, { label: 'Ausgaben bei Aufträgen', amount: rest }] : categories;
}

/** Zahlen für ein Jahr (geteilt von Seite und Finanzen-Karte) */
export function useTaxYear(year: number) {
  const { orders } = useCrm();
  const { expenses } = useFinance();
  const { documents, seller } = useDocuments();
  const { user } = useAuth();
  const { percent, save, missing } = useTaxReservePercent(user?.id);
  return useMemo(() => {
    const today = new Date();
    const totals = yearTotals(orders, expenses, year, today);
    const prev = yearTotals(orders, expenses, year - 1, today);
    const vat = vatSummary(documents, expenses, year, today);
    const reserve = taxReserve({
      profit: totals.profit,
      percent,
      smallBusiness: seller.small_business,
      vatPayable: vat.payable,
    });
    const limit = smallBusinessCheck(totals.income, prev.income, year);
    return { today, totals, prev, vat, reserve, limit, percent, save, missing, seller, documents, expenses };
  }, [orders, expenses, documents, seller, year, percent, save, missing]);
}

/** Steuern: Steuer-Topf, Kleinunternehmer-Grenze/Umsatzsteuer, Unterlagen für die Steuerberatung */
export function TaxScreen() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const t = useTaxYear(year);
  const { logoFor, logo } = useDocuments();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null);
  const partial = year === thisYear;
  useAreaTutorial('steuern');
  const invoices = invoicesOfYear(t.documents, year);
  const withReceipt = t.expenses.filter((e) => e.receipt_path && expenseOccurrences(e, year, t.today).length > 0);
  const yearExpenses = t.expenses.filter((e) => expenseOccurrences(e, year, t.today).length > 0);
  const receiptNames = new Map(withReceipt.map((e, i) => [e.id, receiptFileName(e, i)]));

  const pdfBytes = async () => {
    const { renderTaxYearPdf } = await import('./tax-pdf');
    return renderTaxYearPdf({
      seller: t.seller,
      logo: logo ?? (await logoFor({ data: { seller: t.seller } as never })),
      year,
      partial,
      totals: t.totals,
      categories: withOrderExpenses(expensesByCategory(t.expenses, year, t.today), t.totals.expenses),
      vat: t.seller.small_business ? null : t.vat,
      invoices: invoices.map((d) => {
        const f = invoiceFigures(d);
        return {
          number: d.number,
          issued_on: d.issued_on,
          customer: f.customer,
          net: f.net,
          vat: f.vat,
          gross: f.gross,
          paid_at: d.paid_at,
        };
      }),
      receipts: withReceipt.length,
    });
  };
  const csvIncome = () => invoicesCsv(t.documents, year);
  const csvExpenses = () =>
    expensesCsv(t.expenses, year, t.today, (e) => receiptNames.get((e as { id: string }).id) ?? 'ja');

  const run = async (what: string, task: () => Promise<void>) => {
    setBusy(what);
    setMessage(null);
    try {
      await task();
    } catch (e) {
      setMessage({ tone: 'error', text: `Das hat nicht geklappt.\n\nTechnische Details: ${String(e)}` });
    }
    setBusy(null);
  };

  const zip = () =>
    run('zip', async () => {
      const { zipSync, strToU8 } = await import('fflate');
      const files: Record<string, Uint8Array> = {
        [`Jahresuebersicht_${year}.pdf`]: await pdfBytes(),
        [`Rechnungen_${year}.csv`]: strToU8(csvIncome()),
        [`Ausgaben_${year}.csv`]: strToU8(csvExpenses()),
      };
      let failed = 0;
      for (let i = 0; i < withReceipt.length; i++) {
        const e = withReceipt[i];
        setMessage({ tone: 'info', text: `Belege werden geladen … ${i + 1} von ${withReceipt.length}` });
        const { url } = await receiptUrl(e.receipt_path!);
        const bytes = url ? await fetchBytes(url) : null;
        if (!bytes) {
          failed++;
          continue;
        }
        files[`Belege/${receiptNames.get(e.id)}`] = bytes;
      }
      await download(zipSync(files, { level: 6 }), `NEXORA_Steuer_${year}.zip`, 'application/zip');
      setMessage({
        tone: failed ? 'error' : 'success',
        text: failed
          ? `${SAVED} – aber ${failed} ${failed === 1 ? 'Beleg konnte' : 'Belege konnten'} nicht geladen werden.`
          : `${SAVED}: Übersicht, Rechnungen, Ausgaben${withReceipt.length ? ` und ${withReceipt.length} ${withReceipt.length === 1 ? 'Beleg' : 'Belege'}` : ''}.`,
      });
    });

  const s = t.seller.small_business;
  const statusColor =
    t.limit.status === 'ok' ? Colors.textMuted : t.limit.status === 'near' ? Colors.text : Colors.danger;

  return (
    <Screen maxWidth={820}>
      <PageHeader
        title="Steuern"
        subtitle="Rücklage, Grenzen und Unterlagen für die Steuerberatung – als grobe Orientierung."
        back={{ label: 'Finanzen', onPress: back }}
        help={<TutorialButton id="steuern" />}
      />
      <Reveal delay={120}>
        <Segmented
          value={String(year)}
          onChange={(v) => setYear(Number(v))}
          options={[
            { value: String(thisYear), label: String(thisYear) },
            { value: String(thisYear - 1), label: String(thisYear - 1) },
          ]}
        />
      </Reveal>

      {/* Steuer-Topf */}
      <TourTarget id="steuern.topf">
        <Reveal delay={180}>
          <Card>
            <Text style={styles.eyebrow}>STEUER-TOPF {year}</Text>
            <Text style={styles.big} testID="tax-reserve">
              {formatEuro(t.reserve.total)}
            </Text>
            <Text style={styles.body}>
              So viel solltest du für {year} ungefähr zurücklegen: {t.reserve.percent} % von{' '}
              {formatEuro(Math.max(0, t.totals.profit))} Gewinn
              {!s && t.reserve.vat > 0 ? ` plus ${formatEuro(t.reserve.vat)} Umsatzsteuer, die ans Finanzamt geht` : ''}
              {partial ? ' (Stand heute).' : '.'}
            </Text>
            <Text style={styles.label}>Wie viel Prozent vom Gewinn?</Text>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Rücklage in Prozent">
              {RESERVE_CHOICES.map((p) => {
                const active = p === t.percent;
                return (
                  <Pressable
                    key={p}
                    onPress={async () => {
                      const err = await t.save(p);
                      if (err) setMessage({ tone: 'info', text: err });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    aria-checked={active}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{p} %</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Faustregel für den Anfang: 25–30 % vom Gewinn auf ein eigenes Konto. Die echte Einkommensteuer hängt von
              deinem gesamten Einkommen ab – deine Steuerberatung rechnet es genau aus.
            </Text>
          </Card>
        </Reveal>
      </TourTarget>

      {/* Kleinunternehmer-Grenze bzw. Umsatzsteuer */}
      <TourTarget id="steuern.grenze">
        <Reveal delay={240}>
          <Card>
            {s ? (
              <>
                <Text style={styles.eyebrow}>KLEINUNTERNEHMER-GRENZE</Text>
                <Text style={styles.title} testID="limit-summary">
                  {formatEuro(t.totals.income)} von {formatEuro(SMALL_BUSINESS_LIMIT)} Umsatz {year}
                </Text>
                <ProgressBar value={t.limit.ratio} />
                <Text style={[styles.body, { color: statusColor }]} testID="limit-message">
                  {t.limit.message}
                </Text>
                <Text style={styles.hint}>
                  Seit 2025 gilt: Umsatz im Vorjahr höchstens 25.000 €, im laufenden Jahr höchstens 100.000 € (§ 19
                  UStG). Gezählt werden deine Einnahmen aus abgeschlossenen Aufträgen.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.eyebrow}>UMSATZSTEUER {year}</Text>
                <Row label="Auf deinen Rechnungen ausgewiesen" value={formatEuro(t.vat.collected)} />
                <Row label="Vorsteuer aus Ausgaben (soweit eingetragen)" value={formatEuro(t.vat.input)} />
                <Row label="Ans Finanzamt (geschätzt)" value={formatEuro(t.vat.payable)} strong />
                <Text style={styles.hint}>
                  Damit die Vorsteuer stimmt, trag bei Ausgaben die enthaltene Umsatzsteuer ein – bei Belegen füllt Nexy
                  das aus. Voranmeldungen macht deine Steuerberatung bzw. ELSTER.
                </Text>
              </>
            )}
          </Card>
        </Reveal>
      </TourTarget>

      {/* Unterlagen */}
      <TourTarget id="steuern.export">
        <Reveal delay={300}>
          <Card>
            <Text style={styles.eyebrow}>FÜR DIE STEUERBERATUNG</Text>
            <Text style={styles.body}>
              {invoices.length} {invoices.length === 1 ? 'Rechnung' : 'Rechnungen'} · {yearExpenses.length}{' '}
              {yearExpenses.length === 1 ? 'Ausgabe' : 'Ausgaben'} · {withReceipt.length}{' '}
              {withReceipt.length === 1 ? 'Beleg' : 'Belege'} in {year}
            </Text>
            {pdfSupported ? (
              <View style={styles.chips}>
                <ActionChip
                  icon={Archive}
                  label={busy === 'zip' ? 'Wird erstellt …' : 'Alles als ZIP'}
                  accessibilityLabel={`Alles für ${year} als ZIP`}
                  onPress={() => void zip()}
                  disabled={!!busy}
                />
                <ActionChip
                  icon={FileText}
                  label="Jahresübersicht (PDF)"
                  onPress={() =>
                    void run('pdf', async () =>
                      download(await pdfBytes(), `Jahresuebersicht_${year}.pdf`, 'application/pdf'),
                    )
                  }
                  disabled={!!busy}
                />
                <ActionChip
                  icon={FileSpreadsheet}
                  label="Rechnungen (CSV)"
                  onPress={() => void download(csvIncome(), `Rechnungen_${year}.csv`, 'text/csv;charset=utf-8')}
                  disabled={!!busy}
                />
                <ActionChip
                  icon={Download}
                  label="Ausgaben (CSV)"
                  onPress={() => void download(csvExpenses(), `Ausgaben_${year}.csv`, 'text/csv;charset=utf-8')}
                  disabled={!!busy}
                />
              </View>
            ) : (
              <Notice>Die Unterlagen gehen hier gerade nicht.</Notice>
            )}
            <Text style={styles.hint}>
              Das ZIP enthält die Jahresübersicht, Listen für Excel und alle Belege – zum Weiterleiten an deine
              Steuerberatung.
            </Text>
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
          </Card>
        </Reveal>
      </TourTarget>
    </Screen>
  );
}

/** Kurzkarte in Finanzen: Steuer-Topf + Grenze, führt zur Steuer-Seite */
export function TaxSummaryCard() {
  const [year] = useState(() => new Date().getFullYear());
  const t = useTaxYear(year);
  const { hovered, hoverProps } = useHover();
  const s = t.seller.small_business;
  const warn = s && t.limit.status !== 'ok';
  return (
    <Pressable
      onPress={() => router.push('/finanzen/steuern')}
      accessibilityRole="link"
      accessibilityLabel="Steuern und Unterlagen öffnen"
      testID="tax-summary"
      {...hoverProps}>
      <Card style={hovered ? styles.cardHover : undefined}>
        <View style={styles.summary}>
          <View style={styles.summaryIcon}>
            <PiggyBank size={20} color={Colors.accent} />
          </View>
          <View style={styles.summaryTexts}>
            <Text style={styles.summaryTitle}>
              Steuer-Topf {year}: {formatEuro(t.reserve.total)} zurücklegen
            </Text>
            <Text
              style={[styles.summaryMeta, warn && { color: t.limit.status === 'near' ? Colors.text : Colors.danger }]}>
              {s
                ? warn
                  ? t.limit.message
                  : `Kleinunternehmer-Grenze: ${formatEuro(t.totals.income)} von ${formatEuro(SMALL_BUSINESS_LIMIT)} · Unterlagen für die Steuerberatung`
                : `Umsatzsteuer ans Finanzamt (geschätzt): ${formatEuro(t.vat.payable)} · Unterlagen für die Steuerberatung`}
            </Text>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.body, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.body, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  big: { color: Colors.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.6 },
  title: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21, flexShrink: 1 },
  strong: { color: Colors.text, fontWeight: '700' },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500', marginTop: Spacing.xs },
  hint: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { borderColor: 'rgba(47,227,154,0.5)', backgroundColor: Colors.accentSoft },
  chipText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
  chipTextActive: { color: Colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  cardHover: { borderColor: Colors.borderFocus },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTexts: { flex: 1, gap: 3 },
  summaryTitle: { color: Colors.text, fontSize: 15.5, fontWeight: '700' },
  summaryMeta: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
});
