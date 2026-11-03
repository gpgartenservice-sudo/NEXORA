/**
 * Hilfen fürs Teilen am Handy (ohne App/Netz, mit Unit-Tests): Aus den
 * mailto:- bzw. WhatsApp-Links, die Mac/Browser öffnen, werden Empfänger,
 * Betreff und Text für die Mail-App bzw. die Zwischenablage.
 */

function params(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const key = decodeURIComponent(i < 0 ? part : part.slice(0, i));
    const value = i < 0 ? '' : decodeURIComponent(part.slice(i + 1).replace(/\+/g, '%20'));
    out[key] = value;
  }
  return out;
}

/** mailto:adresse?subject=…&body=… -> Teile (Zeilenumbrüche als \n) */
export function parseMailto(url: string): { to: string[]; subject: string; body: string } | null {
  const m = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(url.trim());
  if (!m) return null;
  const p = params(m[2] ?? '');
  const to = decodeURIComponent(m[1])
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { to, subject: p.subject ?? '', body: (p.body ?? '').replace(/\r\n/g, '\n') };
}

/** https://wa.me/49171…?text=… -> Text (für die Zwischenablage) */
export function whatsappText(url: string): string | null {
  const m = /^https:\/\/wa\.me\/[^?]*\?(.*)$/i.exec(url.trim());
  if (!m) return null;
  return params(m[1]).text ?? null;
}
