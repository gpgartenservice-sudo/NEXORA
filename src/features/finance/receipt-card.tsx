import { Image } from 'expo-image';
import { Camera, FileText, Paperclip, ScanLine } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { ActionChip } from '@/components/ui/action-chip';
import { Card } from '@/components/ui/card';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { receiptSupported, receiptUrl, type PreparedReceipt } from './receipt-file';

/** Beleg einer Ausgabe: noch nicht gespeichert (neu) oder schon im Speicher */
export type ReceiptState =
  | { kind: 'new'; file: PreparedReceipt }
  | { kind: 'saved'; path: string; mime: string }
  | null;

type Props = {
  receipt: ReceiptState;
  /** Nexy liest gerade */
  reading: boolean;
  /** Beleg-Modus: groß oben, mit Erklärung */
  prominent?: boolean;
  onPick: (camera: boolean) => void;
  onRemove: () => void;
  onView: () => void;
};

// Handy-App oder Gerät mit Touchscreen: Kamera-Knopf zeigen
const app = Platform.OS !== 'web';
const touch = app || (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0);

/** Beleg auswählen, ansehen, ersetzen, entfernen. */
export function ReceiptCard({ receipt, reading, prominent, onPick, onRemove, onView }: Props) {
  const [thumb, setThumb] = useState<string | null>(null);
  const savedPath = receipt?.kind === 'saved' && receipt.mime !== 'application/pdf' ? receipt.path : null;

  // Vorschau eines gespeicherten Fotos (zeitlich begrenzter Link)
  useEffect(() => {
    if (!savedPath) return;
    let active = true;
    receiptUrl(savedPath).then(({ url }) => {
      if (active) setThumb(url ?? null);
    });
    return () => {
      active = false;
    };
  }, [savedPath]);

  if (!receiptSupported) {
    return prominent ? (
      <Card>
        <Text style={styles.body}>Belege erfassen geht hier gerade nicht.</Text>
      </Card>
    ) : null;
  }

  const preview = receipt?.kind === 'new' ? receipt.file.previewUrl : receipt?.kind === 'saved' ? thumb : null;
  const isPdf = receipt?.kind === 'new' ? receipt.file.mime === 'application/pdf' : receipt?.mime === 'application/pdf';
  const name = receipt?.kind === 'new' ? receipt.file.name : isPdf ? 'Beleg (PDF)' : 'Beleg (Foto)';

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.icon}>
          <ScanLine size={18} color={Colors.text} strokeWidth={1.8} />
        </View>
        <View style={styles.headTexts}>
          <Text style={styles.title}>Beleg</Text>
          <Text style={styles.body}>
            {receipt
              ? receipt.kind === 'new'
                ? 'Wird beim Speichern sicher abgelegt – nur du kannst ihn sehen.'
                : 'Sicher abgelegt – nur du kannst ihn sehen.'
              : prominent
                ? 'Foto oder PDF – Nexy liest Betrag, Datum und Kategorie aus. Du prüfst und speicherst.'
                : 'Foto oder PDF zur Ausgabe ablegen – praktisch für die Steuer.'}
          </Text>
        </View>
      </View>

      {receipt && (
        <View style={styles.file} testID="receipt-file">
          {preview && !isPdf ? (
            <Image
              source={{ uri: preview }}
              style={styles.thumb}
              contentFit="cover"
              accessibilityLabel="Vorschau des Belegs"
            />
          ) : (
            <View style={[styles.thumb, styles.pdf]}>
              <FileText size={26} color={Colors.textMuted} strokeWidth={1.6} />
            </View>
          )}
          <View style={styles.fileTexts}>
            <Text style={styles.fileName} numberOfLines={1}>
              {name}
            </Text>
            {reading ? (
              <View style={styles.reading}>
                <ActivityIndicator size="small" color={Colors.accent} />
                <Text style={styles.readingText}>Nexy liest den Beleg …</Text>
              </View>
            ) : (
              <View style={styles.chips}>
                {receipt.kind === 'saved' && <ActionChip icon={FileText} label="Ansehen" onPress={onView} />}
                <ActionChip icon={Paperclip} label="Anderer Beleg" onPress={() => onPick(false)} />
                <ActionChip label="Entfernen" onPress={onRemove} accessibilityLabel="Beleg entfernen" />
              </View>
            )}
          </View>
        </View>
      )}

      {!receipt && (
        <View style={styles.chips}>
          {touch && <ActionChip icon={Camera} label="Foto aufnehmen" onPress={() => onPick(true)} />}
          <ActionChip
            icon={Paperclip}
            label={app ? 'Aus Fotos oder Dateien' : touch ? 'Datei wählen' : 'Foto oder PDF wählen'}
            onPress={() => onPick(false)}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTexts: { flex: 1, gap: 2 },
  title: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  file: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  thumb: { width: 72, height: 96, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised },
  pdf: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  fileTexts: { flex: 1, gap: Spacing.sm },
  fileName: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  reading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  readingText: { color: Colors.textMuted, fontSize: 13.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
