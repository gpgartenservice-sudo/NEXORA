/**
 * Angebots-Link: geheimer Schlüssel und Adresse der öffentlichen Angebotsseite.
 * Reine Logik (mit Unit-Tests).
 */

/** Langer, zufälliger Schlüssel (URL-sicher, 43 Zeichen) */
export function offerToken(random: (n: number) => Uint8Array): string {
  const bytes = random(32);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const validOfferToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(t);

/**
 * Adresse der App im Internet (für Kunden-Links): aus der .env
 * (EXPO_PUBLIC_WEB_URL) oder – wenn die App selbst im Internet läuft – ihre
 * eigene Adresse. Lokal (Mac-App, localhost) gibt es keine.
 */
export function webBaseUrl(
  configured: string | undefined,
  location?: { protocol: string; hostname: string; origin: string },
): string | null {
  const c = configured?.trim().replace(/\/+$/, '');
  if (c && /^https:\/\/[^\s/]+/.test(c)) return c;
  if (location && location.protocol === 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    return location.origin;
  }
  return null;
}

/** Link zum Angebot – über die Startadresse, damit er auf jedem Webspace funktioniert */
export function offerUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/?angebot=${encodeURIComponent(token)}`;
}

/** Absatz für E-Mail/WhatsApp mit dem Link */
export function offerLinkText(url: string): string {
  return `Sie können das Angebot auch online ansehen und mit einem Klick annehmen:\n${url}`;
}

/** Text um den Link ergänzen: vor dem Gruß einfügen (sonst ans Ende) */
export function withOfferLink(body: string, url: string): string {
  const block = offerLinkText(url);
  const i = body.lastIndexOf('\n\nMit freundlichen Grüßen');
  return i >= 0 ? `${body.slice(0, i)}\n\n${block}${body.slice(i)}` : `${body}\n\n${block}`;
}

/** Status eines Angebots aus Sicht des Kunden */
export type OfferAnswer =
  | { state: 'open' }
  | { state: 'accepted'; at: string; name: string | null }
  | { state: 'declined'; at: string; note: string | null }
  | { state: 'expired' };

export function offerAnswer(
  doc: {
    accepted_at?: string | null;
    accepted_name?: string | null;
    declined_at?: string | null;
    decline_note?: string | null;
    valid_until?: string | null;
    due_on?: string | null;
  },
  today: string,
): OfferAnswer {
  if (doc.accepted_at) return { state: 'accepted', at: doc.accepted_at, name: doc.accepted_name ?? null };
  if (doc.declined_at) return { state: 'declined', at: doc.declined_at, note: doc.decline_note ?? null };
  const until = doc.valid_until ?? doc.due_on ?? null;
  if (until && until < today) return { state: 'expired' };
  return { state: 'open' };
}

/** Uint8Array -> Base64 (für Anhänge) */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
