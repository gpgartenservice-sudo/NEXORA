import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { MAX_RECEIPT_BYTES, receiptPath, type ReceiptMime } from './receipt-logic';

/**
 * Belege auswählen, verkleinern und im privaten Speicher ablegen (Mac/Browser,
 * auch im Handy-Browser mit Kamera).
 */

export const receiptSupported = Platform.OS === 'web' && typeof document !== 'undefined';

const MAX_SIDE = 2000; // Fotos: längste Seite in Pixeln – Text bleibt gut lesbar
const JPEG_QUALITY = 0.82;
const BUCKET = 'receipts';

export type PreparedReceipt = {
  blob: Blob;
  mime: ReceiptMime;
  /** Inhalt als Base64 (für das Lesen durch Nexy) */
  base64: string;
  /** Vorschau (nur Bilder) */
  previewUrl: string | null;
  name: string;
};

class ReceiptError extends Error {}

/** Dateiauswahl öffnen; `camera`: am Handy direkt die Kamera. null = abgebrochen. */
export function pickReceiptFile(camera = false): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = camera ? 'image/*' : 'image/*,application/pdf';
    if (camera) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new ReceiptError('Die Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(blob);
  });
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new ReceiptError(
      'Dieses Bild kann ich nicht öffnen. Bitte als JPG, PNG oder PDF speichern (iPhone: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“).',
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Datei prüfen und fürs Lesen/Speichern vorbereiten (Fotos werden verkleinert). */
export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  const type = file.type.toLowerCase();
  if (type === 'application/pdf') {
    if (file.size > MAX_RECEIPT_BYTES) throw new ReceiptError('Die PDF ist zu groß (höchstens 6 MB).');
    return { blob: file, mime: 'application/pdf', base64: await toBase64(file), previewUrl: null, name: file.name };
  }
  if (!type.startsWith('image/')) throw new ReceiptError('Bitte ein Foto (JPG, PNG) oder eine PDF wählen.');
  if (file.size > 25 * 1024 * 1024) throw new ReceiptError('Das Bild ist zu groß (höchstens 25 MB).');
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ReceiptError('Dein Gerät kann das Bild gerade nicht bearbeiten.');
  ctx.fillStyle = '#ffffff'; // transparente PNGs: weißer Hintergrund
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new ReceiptError('Das Bild konnte nicht verarbeitet werden.');
  if (blob.size > MAX_RECEIPT_BYTES) throw new ReceiptError('Das Bild ist zu groß.');
  return {
    blob,
    mime: 'image/jpeg',
    base64: await toBase64(blob),
    previewUrl: URL.createObjectURL(blob),
    name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
  };
}

/** Fehlertext für die Anzeige */
export function receiptErrorText(e: unknown): string {
  if (e instanceof ReceiptError) return e.message;
  console.warn('[Beleg]', e);
  return `Der Beleg konnte nicht verarbeitet werden.\n\nTechnische Details: ${String(e)}`;
}

const SETUP =
  'Belege können noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (20261112090000_receipts.sql, siehe supabase/README.md).';

/** Beleg in den privaten Speicher hochladen -> Pfad */
export async function uploadReceipt(
  userId: string,
  receipt: PreparedReceipt,
): Promise<{ path?: string; error?: string }> {
  const path = receiptPath(userId, crypto.randomUUID(), receipt.mime);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, receipt.blob, { contentType: receipt.mime, upsert: false });
  if (error) {
    const msg = String(error.message ?? '');
    if (/bucket not found/i.test(msg)) return { error: SETUP };
    if (/row-level security|unauthorized|403/i.test(msg)) return { error: `${SETUP}\n\nTechnische Details: ${msg}` };
    return { error: `Der Beleg konnte nicht hochgeladen werden.\n\nTechnische Details: ${msg}` };
  }
  return { path };
}

/** Zeitlich begrenzter Link zum Ansehen (1 Stunde) */
export async function receiptUrl(path: string): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl)
    return { error: `Der Beleg konnte nicht geöffnet werden.\n\nTechnische Details: ${error?.message ?? ''}` };
  return { url: data.signedUrl };
}

/** Beleg löschen (Fehler werden nur protokolliert – die Ausgabe zählt) */
export async function deleteReceipt(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('[Beleg löschen]', error);
}

/** Beleg in neuem Tab/Fenster öffnen */
export async function openReceipt(path: string): Promise<string | null> {
  const { url, error } = await receiptUrl(path);
  if (error || !url) return error ?? 'Der Beleg konnte nicht geöffnet werden.';
  window.open(url, '_blank', 'noopener');
  return null;
}
