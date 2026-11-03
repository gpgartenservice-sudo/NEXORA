import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { formatEuro } from '@/features/crm/order-logic';
import { sellerName } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { downloadPdf, PDF_UNSUPPORTED, pdfSupported } from '@/features/documents/save-pdf';

import { incomeProofMonths, monthLabel, summarize, sumUp } from './finance-logic';
import { useFinance } from './finance-provider';

type Preset = '3' | '6' | '12' | 'year';

/** Einkommensnachweis: Monatsübersicht als PDF, z. B. für Versicherung oder Vermieter. */
export function IncomeProofCard() {
  const { orders } = useCrm();
  const { expenses } = useFinance();
  const { seller, logo } = useDocuments();
  const [preset, setPreset] = useState<Preset>('3');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const months = incomeProofMonths(preset);
  const rows = summarize(orders, expenses, months);
  const sum = sumUp(rows);
  const average = rows.length ? sum.profit / rows.length : 0;
  const hasName = !!sellerName(seller);
  const lastYear = new Date().getFullYear() - 1;

  const create = async () => {
    if (!pdfSupported) return setError(PDF_UNSUPPORTED);
    setBusy(true);
    setError(null);
    try {
      const { renderIncomeProofPdf, incomeProofFileName } = await import('./income-pdf');
      downloadPdf({ bytes: await renderIncomeProofPdf({ seller, logo, rows }), fileName: incomeProofFileName(rows) });
    } catch (e) {
      console.warn('[Einkommensnachweis]', e);
      setError(`Das PDF konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={styles.title}>Einkommensnachweis</Text>
      <Text style={styles.text}>
        Deine Einnahmen, Ausgaben und dein Einkommen pro Monat als PDF – z. B. für Versicherung, Vermieter oder Bank.
      </Text>
      <Segmented
        label="Zeitraum"
        value={preset}
        onChange={setPreset}
        options={[
          { value: '3', label: '3 Monate' },
          { value: '6', label: '6 Monate' },
          { value: '12', label: '12 Monate' },
          { value: 'year', label: String(lastYear) },
        ]}
      />
      <View style={styles.summary}>
        <Text style={styles.range}>
          {monthLabel(months[0])} bis {monthLabel(months[months.length - 1])}
        </Text>
        <Text style={styles.avg}>
          Ø {formatEuro(average)} Einkommen pro Monat · gesamt {formatEuro(sum.profit)}
        </Text>
      </View>
      {hasName ? (
        <Button label="Als PDF speichern" onPress={create} loading={busy} />
      ) : (
        <View style={styles.missing}>
          <Notice>Für den Nachweis fehlt noch dein Name bzw. Firmenname.</Notice>
          <TextLink label="Im Bereich Firma eintragen →" emphasis onPress={() => router.navigate('/firma')} />
        </View>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  summary: { gap: 2 },
  range: { color: Colors.text, fontSize: 14.5, fontWeight: '600' },
  avg: { color: Colors.textMuted, fontSize: 13.5 },
  missing: { gap: Spacing.sm },
});
