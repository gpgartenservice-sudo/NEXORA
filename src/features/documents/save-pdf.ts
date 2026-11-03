import { Platform } from 'react-native';

import { saveFile, savesViaShareSheet } from '@/lib/files';

import type { LogoImage } from './logo-logic';
import type { IssuedDocument } from './pdf';

/** Erzeugtes PDF: Inhalt + Dateiname (z. B. Rechnung_RE-2026-0001_Peter_Mueller.pdf) */
export type PreparedPdf = { bytes: Uint8Array; fileName: string };

/** PDFs: Mac/Browser (Download) und Handy (Teilen-Menü) */
export const pdfSupported = Platform.OS !== 'web' || typeof document !== 'undefined';

export const PDF_UNSUPPORTED = 'Das Speichern als PDF geht hier gerade nicht.';

/** Kurzer Hinweis nach dem Speichern (Handy: Teilen-Menü statt Download) */
export const PDF_SAVED = savesViaShareSheet
  ? 'PDF erstellt – im Teilen-Menü sichern oder verschicken.'
  : 'PDF gespeichert.';

/** PDF erzeugen (pdf-lib wird erst geladen, wenn wirklich ein PDF gebraucht wird). */
export async function preparePdf(doc: IssuedDocument, logo?: LogoImage | null): Promise<PreparedPdf> {
  const { pdfFileName, renderDocumentPdf } = await import('./pdf');
  return { bytes: await renderDocumentPdf(doc, logo), fileName: pdfFileName(doc) };
}

/** Als Datei speichern – Mac: Speichern-Dialog, Browser: Download, Handy: Teilen-Menü. */
export function downloadPdf(pdf: PreparedPdf): Promise<void> {
  return saveFile(pdf.bytes, pdf.fileName, 'application/pdf').catch((e) => console.warn('[PDF speichern]', e));
}

/** PDF erzeugen und speichern (Mac/Web: Speichern-Dialog bzw. Download, Handy: Teilen-Menü). */
export async function savePdf(doc: IssuedDocument, logo?: LogoImage | null): Promise<{ error?: string }> {
  if (!pdfSupported) return { error: PDF_UNSUPPORTED };
  try {
    const pdf = await preparePdf(doc, logo);
    await saveFile(pdf.bytes, pdf.fileName, 'application/pdf');
    return {};
  } catch (e) {
    console.warn('[PDF]', e);
    return { error: `Das PDF konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}` };
  }
}
