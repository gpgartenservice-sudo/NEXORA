import { randomUUID } from 'expo-crypto';

import { supabase } from '@/lib/supabase';

import { receiptPath, type ReceiptMime } from './receipt-logic';

/**
 * Belege im privaten Speicher „receipts“: hochladen, Link zum Ansehen,
 * löschen – gleich für Mac/Browser und Handy-App.
 */

const BUCKET = 'receipts';

/** Fehler mit Text für die Anzeige */
export class ReceiptError extends Error {}

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
  receipt: { body: Blob | Uint8Array; mime: ReceiptMime },
): Promise<{ path?: string; error?: string }> {
  const path = receiptPath(userId, randomUUID(), receipt.mime);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, receipt.body, { contentType: receipt.mime, upsert: false });
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
