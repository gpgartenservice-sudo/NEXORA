import { Platform } from 'react-native';

import type { IssuedDocument } from './pdf';

/**
 * PDF erzeugen und speichern. Mac/Web: Speichern-Dialog bzw. Download.
 * Auf dem Handy folgt das Teilen (z. B. per Mail oder WhatsApp) in einem
 * späteren Schritt.
 */
export async function savePdf(doc: IssuedDocument): Promise<{ error?: string }> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return { error: 'Das Speichern als PDF gibt es im Moment nur auf dem Mac. Am Handy folgt es bald.' };
  }
  try {
    // pdf-lib erst laden, wenn wirklich ein PDF gebraucht wird
    const { pdfFileName, renderDocumentPdf } = await import('./pdf');
    const bytes = await renderDocumentPdf(doc);
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfFileName(doc);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return {};
  } catch (e) {
    console.warn('[PDF]', e);
    return { error: `Das PDF konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}` };
  }
}
