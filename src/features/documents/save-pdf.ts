import { Platform } from 'react-native';

import type { IssuedDocument } from './pdf';

/** Erzeugtes PDF: Inhalt + Dateiname (z. B. Rechnung_RE-2026-0001_Peter_Mueller.pdf) */
export type PreparedPdf = { bytes: Uint8Array; fileName: string };

/** PDFs gibt es im Moment nur auf dem Mac bzw. im Browser – am Handy folgt das Teilen später. */
export const pdfSupported = Platform.OS === 'web' && typeof document !== 'undefined';

export const PDF_UNSUPPORTED = 'Das Speichern als PDF gibt es im Moment nur auf dem Mac. Am Handy folgt es bald.';

/** PDF erzeugen (pdf-lib wird erst geladen, wenn wirklich ein PDF gebraucht wird). */
export async function preparePdf(doc: IssuedDocument): Promise<PreparedPdf> {
  const { pdfFileName, renderDocumentPdf } = await import('./pdf');
  return { bytes: await renderDocumentPdf(doc), fileName: pdfFileName(doc) };
}

/** Als Datei herunterladen – im Mac-Fenster erscheint der Speichern-Dialog. */
export function downloadPdf(pdf: PreparedPdf) {
  const blob = new Blob([pdf.bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdf.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** PDF erzeugen und speichern (Mac/Web: Speichern-Dialog bzw. Download). */
export async function savePdf(doc: IssuedDocument): Promise<{ error?: string }> {
  if (!pdfSupported) return { error: PDF_UNSUPPORTED };
  try {
    downloadPdf(await preparePdf(doc));
    return {};
  } catch (e) {
    console.warn('[PDF]', e);
    return { error: `Das PDF konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}` };
  }
}
