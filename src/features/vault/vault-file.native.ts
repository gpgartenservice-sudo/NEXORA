/**
 * Dokumente in der Handy-App (iPhone/Android): Foto mit der Kamera, aus den Fotos oder
 * eine Datei aus „Dateien“ (PDF, ELSTER-Zertifikat, Word, Excel). Fotos werden verkleinert.
 * Mac/Browser: vault-file.ts.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

import type { PreparedVaultFile } from './vault-api';
import { vaultUrl } from './vault-api';
import { kindExt, MAX_VAULT_BYTES, VAULT_MIMES, VAULT_TOO_BIG, VAULT_UNSUPPORTED, VaultError, vaultKind } from './vault-logic';

export const vaultSupported = true;

/** Ausgewählte Datei: Adresse auf dem Gerät + Typ */
export type PickedVaultFile = { uri: string; mime: string; name: string; size: number | null };

const MAX_SIDE = 2400;
const JPEG_QUALITY = 0.85;

function chooseSource(): Promise<'photos' | 'files' | null> {
  return new Promise((resolve) => {
    Alert.alert('Dokument wählen', 'Foto aus deiner Mediathek oder Datei aus „Dateien“ (PDF, ELSTER-Zertifikat …)?', [
      { text: 'Aus Fotos', onPress: () => resolve('photos') },
      { text: 'Aus Dateien', onPress: () => resolve('files') },
      { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

const fromAsset = (a: ImagePicker.ImagePickerAsset): PickedVaultFile => ({
  uri: a.uri,
  mime: a.mimeType ?? 'image/jpeg',
  name: a.fileName ?? 'Foto.jpg',
  size: a.fileSize ?? null,
});

/** Kamera bzw. Auswahl öffnen. null = abgebrochen (oder Kamera nicht erlaubt – dann mit Hinweis). */
export async function pickVaultFile(camera = false): Promise<PickedVaultFile | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Kamera nicht erlaubt', 'Damit du Dokumente fotografieren kannst, erlaube Lunaxora die Kamera in den Einstellungen deines Handys.');
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
    // alle Dateien zulassen – .pfx kennt nicht jedes Handy als eigenen Typ; geprüft wird danach
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    const a = r.canceled ? null : r.assets[0];
    return a ? { uri: a.uri, mime: a.mimeType ?? '', name: a.name, size: a.size ?? null } : null;
  }
  return null;
}

/** Datei prüfen und fürs Hochladen vorbereiten */
export async function prepareVaultFile(file: PickedVaultFile): Promise<PreparedVaultFile> {
  const kind = vaultKind(file.name, file.mime);
  if (!kind) throw new VaultError(VAULT_UNSUPPORTED);
  if (kind === 'image') {
    if ((file.size ?? 0) > 40 * 1024 * 1024) throw new VaultError('Das Bild ist zu groß (höchstens 40 MB).');
    let image;
    try {
      image = await ImageManipulator.manipulate(file.uri).renderAsync();
    } catch {
      throw new VaultError('Dieses Bild kann ich nicht öffnen. Bitte als Foto (JPG/PNG) oder PDF wählen.');
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    if (scale < 1)
      image = await ImageManipulator.manipulate(file.uri)
        .resize({ width: Math.round(image.width * scale) })
        .renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    const bytes = await new File(saved.uri).bytes();
    if (bytes.length > MAX_VAULT_BYTES) throw new VaultError(VAULT_TOO_BIG);
    return { body: bytes, ext: 'jpg', mime: 'image/jpeg', size: bytes.length, name: file.name, previewUrl: saved.uri };
  }
  const f = new File(file.uri);
  if ((file.size ?? f.size ?? 0) > MAX_VAULT_BYTES) throw new VaultError(VAULT_TOO_BIG);
  const bytes = await f.bytes();
  if (bytes.length > MAX_VAULT_BYTES) throw new VaultError(VAULT_TOO_BIG);
  if (bytes.length === 0) throw new VaultError('Die Datei ist leer.');
  const ext = kindExt(kind);
  return { body: bytes, ext, mime: VAULT_MIMES[ext], size: bytes.length, name: file.name, previewUrl: null };
}

/** PDF/Foto im App-Browser ansehen */
export async function viewVaultFile(path: string): Promise<string | null> {
  const { url, error } = await vaultUrl(path);
  if (!url) return error ?? 'Das Dokument konnte nicht geöffnet werden.';
  await WebBrowser.openBrowserAsync(url);
  return null;
}
