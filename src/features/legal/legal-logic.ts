/**
 * Rechtstexte der App und der Kündigungsbutton „Verträge hier kündigen“ (§ 312k BGB).
 * Die Seiten liegen auf lunaxora.de (Quellen: web-recht/ und web-kuendigen/,
 * hochladen mit scripts/web-hochladen.sh recht bzw. kuendigen).
 */
export const LEGAL_URLS = {
  agb: 'https://lunaxora.de/App/agb.html',
  datenschutz: 'https://lunaxora.de/App/datenschutz.html',
  avv: 'https://lunaxora.de/App/avv.html',
  impressum: 'https://lunaxora.de/impressum.html',
  kuendigen: 'https://lunaxora.de/kuendigen/',
  /** Widerrufsfunktion nach § 356a BGB (dieselbe Seite) */
  widerrufen: 'https://lunaxora.de/kuendigen/?widerrufen',
} as const;

export type LegalPage = keyof typeof LEGAL_URLS;

/** Fassung der AGB und des AV-Vertrags, der man bei der Registrierung zustimmt ("Stand" in web-recht/) */
export const TERMS_VERSION = '2026-11-23';

/** Für supabase.auth.signUp(options.data): welche Fassung wann bestätigt wurde */
export function termsAcceptance(now: Date) {
  return { terms_version: TERMS_VERSION, terms_accepted_at: now.toISOString() };
}

/**
 * Kündigungsseite, vorausgefüllt mit E-Mail und Name. Die Angaben stehen im
 * Fragment (#…): das schickt der Browser nie an den Server, die Seite löscht es sofort.
 */
export function cancelPageUrl(email?: string | null, name?: string | null, page: 'kuendigen' | 'widerrufen' = 'kuendigen'): string {
  const params = new URLSearchParams();
  const e = (email ?? '').trim();
  const n = (name ?? '').trim();
  if (e) params.set('email', e.slice(0, 254));
  if (n) params.set('name', n.slice(0, 100));
  params.set('src', 'app');
  return `${LEGAL_URLS[page]}#${params.toString()}`;
}
