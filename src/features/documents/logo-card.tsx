import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { sampleInvoice, sellerName, type Seller } from './document-logic';
import { useDocuments } from './documents-provider';
import { logoErrorText, logoUploadSupported, pickImageFile, processLogo } from './logo-image';
import { fitInto } from './logo-logic';
import { savePdf } from './save-pdf';

type Message = { tone: 'info' | 'success' | 'error'; text: string };

/**
 * Logo hochladen, ersetzen, entfernen – mit Vorschau des Briefkopfs, wie er
 * oben auf Angeboten und Rechnungen steht.
 */
export function LogoCard({ preview }: { preview: Seller }) {
  const { logo, uploadLogo, removeLogo } = useDocuments();
  const [busy, setBusy] = useState<'upload' | 'remove' | 'sample' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const upload = async () => {
    const file = await pickImageFile();
    if (!file) return;
    setBusy('upload');
    setMessage(null);
    try {
      const { error } = await uploadLogo(await processLogo(file));
      setMessage(
        error
          ? { tone: 'error', text: error }
          : { tone: 'success', text: 'Logo gespeichert – es steht ab jetzt auf allen neuen Angeboten und Rechnungen.' },
      );
    } catch (e) {
      setMessage({ tone: 'error', text: logoErrorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setMessage(null);
    const { error } = await removeLogo();
    setBusy(null);
    setMessage(error ? { tone: 'error', text: error } : { tone: 'info', text: 'Logo entfernt.' });
  };

  const sample = async () => {
    setBusy('sample');
    setMessage(null);
    const { error } = await savePdf(sampleInvoice(preview), logo);
    setBusy(null);
    if (error) setMessage({ tone: 'error', text: error });
  };

  const name = sellerName(preview);
  const lines = [
    preview.owner_name && preview.company_name ? preview.owner_name : null,
    preview.street,
    [preview.zip, preview.city].filter(Boolean).join(' '),
  ].filter(Boolean) as string[];
  const size = logo ? fitInto(logo.width, logo.height, 180, 48) : null;

  return (
    <Card>
      <Text style={styles.cardTitle}>Logo & Briefkopf</Text>

      {/* So sieht der Kopf deiner Rechnungen aus */}
      <View style={styles.paper} accessibilityLabel="Vorschau des Briefkopfs">
        <View style={styles.bar} />
        {/* Titel zuerst + row-reverse: rechts oben; bei wenig Platz rutscht der Absender darunter */}
        <View style={styles.head}>
          <Text style={styles.paperTitle}>RECHNUNG</Text>
          <View style={styles.sender}>
            {logo && size ? (
              <Image
                source={{ uri: `data:${logo.mime};base64,${logo.data}` }}
                style={{ width: size.width, height: size.height }}
                contentFit="contain"
                accessibilityLabel="Dein Logo"
              />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>Dein Logo</Text>
              </View>
            )}
            <Text style={[styles.paperName, !logo && styles.paperNameLarge]} numberOfLines={1}>
              {name || 'Dein Firmenname'}
            </Text>
            {lines.map((l) => (
              <Text key={l} style={styles.paperLine} numberOfLines={1}>
                {l}
              </Text>
            ))}
          </View>
        </View>
      </View>

      {logoUploadSupported ? (
        <>
          <View style={styles.actions}>
            <Button
              label={logo ? 'Anderes Logo wählen' : 'Logo hochladen'}
              variant={logo ? 'secondary' : 'primary'}
              onPress={upload}
              loading={busy === 'upload'}
              disabled={!!busy}
              style={styles.flex}
            />
            <Button
              label="Muster-Rechnung als PDF"
              variant="secondary"
              onPress={sample}
              loading={busy === 'sample'}
              disabled={!!busy}
              style={styles.flex}
            />
          </View>
          <Text style={styles.hint}>
            PNG, JPG, SVG oder WebP – am besten mit durchsichtigem Hintergrund. Leere Ränder schneidet Lunaxora automatisch
            ab. Bereits erstellte Angebote und Rechnungen behalten ihr bisheriges Logo.
          </Text>
          {logo && <TextLink label={busy === 'remove' ? 'Wird entfernt …' : 'Logo entfernen'} onPress={remove} />}
        </>
      ) : (
        <Notice>Logo hochladen geht hier gerade nicht.</Notice>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </Card>
  );
}

const INK = '#141417';
const GREY = '#6B6B73';

const styles = StyleSheet.create({
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  paper: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    overflow: 'hidden',
    boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
  },
  bar: { height: 5, backgroundColor: Colors.accent },
  head: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.md,
    padding: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  sender: { flexGrow: 1, flexBasis: 220, minWidth: 0, gap: 3, alignItems: 'flex-start' },
  placeholder: {
    width: 120,
    height: 40,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9C9CF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  placeholderText: { color: '#9A9AA2', fontSize: 12, fontWeight: '600' },
  paperName: { color: INK, fontSize: 14, fontWeight: '700', marginTop: 6 },
  paperNameLarge: { fontSize: 18 },
  paperLine: { color: GREY, fontSize: 11.5 },
  paperTitle: { color: INK, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  flex: { flex: 1, minWidth: 200 },
  hint: { color: Colors.textFaint, fontSize: 13, lineHeight: 18 },
});
