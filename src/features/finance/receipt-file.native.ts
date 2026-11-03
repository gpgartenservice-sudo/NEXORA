/**
 * Belege in der Handy-App (iPhone/Android): Foto mit der Kamera, aus den
 * Fotos oder als PDF aus „Dateien“ – Fotos werden verkleinert, dann liest
 * Nexy den Beleg und er landet im privaten Speicher. Mac/Browser: receipt-file.ts.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

import { MAX_RECEIPT_BYTES, type ReceiptMime } from './receipt-logic';
import { ReceiptError, receiptUrl } from './receipt-storage';

export { deleteReceipt, receiptErrorText, receiptUrl, uploadReceipt } from './receipt-storage';

export const receiptSupported = true;

const MAX_SIDE = 2000; // Fotos: längste Seite in Pixeln – Text bleibt gut lesbar
const JPEG_QUALITY = 0.82;

/** Ausgewählte Datei: Adresse auf dem Gerät + Typ */
export type PickedReceipt = { uri: string; mime: string; name: string; size: number | null };

export type PreparedReceipt = {
  /** Inhalt zum Hochladen */
  body: Blob | Uint8Array;
  mime: ReceiptMime;
  /** Inhalt als Base64 (für das Lesen durch Nexy) */
  base64: string;
  /** Vorschau (nur Bilder) */
  previewUrl: string | null;
  name: string;
};

/** Woher soll der Beleg kommen? */
function chooseSource(): Promise<'photos' | 'files' | null> {
  return new Promise((resolve) => {
    Alert.alert('Beleg wählen', 'Foto aus deiner Mediathek oder PDF aus „Dateien“?', [
      { text: 'Aus Fotos', onPress: () => resolve('photos') },
      { text: 'PDF aus Dateien', onPress: () => resolve('files') },
      { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

const fromAsset = (a: ImagePicker.ImagePickerAsset): PickedReceipt => ({
  uri: a.uri,
  mime: a.mimeType ?? 'image/jpeg',
  name: a.fileName ?? 'Beleg.jpg',
  size: a.fileSize ?? null,
});

/** Kamera bzw. Auswahl öffnen. null = abgebrochen (oder Kamera nicht erlaubt – dann mit Hinweis). */
export async function pickReceiptFile(camera = false): Promise<PickedReceipt | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Kamera nicht erlaubt',
        'Damit du Belege fotografieren kannst, erlaube NEXORA die Kamera in den Einstellungen deines Handys.',
      );
      return null;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    return r.canceled || !r.assets[0] ? null : fromAsset(r.assets[0]);
  }
  const source = await chooseSource();
  if (source === 'photos') {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    return r.canceled || !r.assets[0] ? null : fromAsset(r.assets[0]);
  }
  if (source === 'files') {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    const a = r.canceled ? null : r.assets[0];
    return a ? { uri: a.uri, mime: a.mimeType ?? 'application/pdf', name: a.name, size: a.size ?? null } : null;
  }
  return null;
}

/** Datei prüfen und fürs Lesen/Speichern vorbereiten (Fotos werden verkleinert). */
export async function prepareReceipt(file: PickedReceipt): Promise<PreparedReceipt> {
  const type = file.mime.toLowerCase();
  if (type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const f = new File(file.uri);
    const size = file.size ?? f.size ?? 0;
    if (size > MAX_RECEIPT_BYTES) throw new ReceiptError('Die PDF ist zu groß (höchstens 6 MB).');
    const bytes = await f.bytes();
    if (bytes.length > MAX_RECEIPT_BYTES) throw new ReceiptError('Die PDF ist zu groß (höchstens 6 MB).');
    return { body: bytes, mime: 'application/pdf', base64: await f.base64(), previewUrl: null, name: file.name };
  }
  if (!type.startsWith('image/')) throw new ReceiptError('Bitte ein Foto oder eine PDF wählen.');
  if ((file.size ?? 0) > 25 * 1024 * 1024) throw new ReceiptError('Das Bild ist zu groß (höchstens 25 MB).');
  let image;
  try {
    image = await ImageManipulator.manipulate(file.uri).renderAsync();
  } catch {
    throw new ReceiptError('Dieses Bild kann ich nicht öffnen. Bitte als Foto (JPG/PNG) oder PDF wählen.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  if (scale < 1)
    image = await ImageManipulator.manipulate(file.uri)
      .resize({ width: Math.round(image.width * scale) })
      .renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  if (!saved.base64) throw new ReceiptError('Das Bild konnte nicht verarbeitet werden.');
  const bytes = await new File(saved.uri).bytes();
  if (bytes.length > MAX_RECEIPT_BYTES) throw new ReceiptError('Das Bild ist zu groß.');
  return {
    body: bytes,
    mime: 'image/jpeg',
    base64: saved.base64,
    previewUrl: saved.uri,
    name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
  };
}

/** Beleg ansehen (im App-Browser) */
export async function openReceipt(path: string): Promise<string | null> {
  const { url, error } = await receiptUrl(path);
  if (error || !url) return error ?? 'Der Beleg konnte nicht geöffnet werden.';
  await WebBrowser.openBrowserAsync(url);
  return null;
}
