/**
 * Neue Kunden per Datenschutz-Link: Der Nutzer gibt nur die E-Mail-Adresse ein,
 * der Kunde trägt seine Daten auf lunaxora.de selbst ein und bestätigt die
 * Datenschutzerklärung (supabase/migrations/20261119090000_customer_invites.sql,
 * web-kunde/index.html). Reine Logik (mit Unit-Tests).
 */

/** Offene Einladung (erledigte zeigt die App nicht – dann gibt es den Kunden) */
export type CustomerInvite = {
  id: string;
  email: string;
  created_at: string;
  sent_at: string | null;
  expires_at: string;
};

/** So lange gilt ein Link (wie in der Datenbank) */
export const INVITE_DAYS = 30;

/** Neues Ablaufdatum ab jetzt (beim erneuten Senden) */
export function inviteExpiry(now: Date): string {
  return new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export const inviteExpired = (invite: Pick<CustomerInvite, 'expires_at'>, now: Date): boolean =>
  new Date(invite.expires_at).getTime() < now.getTime();

export const sameEmail = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const validHttps = (url: string | null | undefined): boolean => {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && u.hostname.includes('.');
  } catch {
    return false;
  }
};

type PrivacySeller = {
  company_name: string | null;
  owner_name: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  email: string | null;
  privacy_url?: string | null;
};

/**
 * Was fehlt, damit der Kunde eine Datenschutzerklärung sieht? Mit eigenem Link
 * nichts – sonst braucht das Muster Name, Anschrift und E-Mail des Nutzers
 * (wer für die Daten verantwortlich ist).
 */
export function privacyGaps(s: PrivacySeller): string[] {
  if (validHttps(s.privacy_url)) return [];
  const has = (v: string | null | undefined) => !!v?.trim();
  const gaps: string[] = [];
  if (!has(s.company_name) && !has(s.owner_name)) gaps.push('Name bzw. Firmenname');
  if (!has(s.street) || !has(s.zip) || !has(s.city)) gaps.push('Anschrift');
  if (!has(s.email)) gaps.push('E-Mail');
  return gaps;
}

/** "Name bzw. Firmenname, Anschrift und E-Mail" */
export function listGerman(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`;
}

/** "verschickt am 15.11." / "abgelaufen am 15.12." / "noch nicht verschickt" */
export function inviteStatus(invite: CustomerInvite, now: Date): { text: string; expired: boolean } {
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' });
  if (inviteExpired(invite, now)) return { text: `Link abgelaufen am ${day(invite.expires_at)}`, expired: true };
  if (!invite.sent_at) return { text: 'noch nicht verschickt', expired: false };
  return { text: `verschickt am ${day(invite.sent_at)} · gültig bis ${day(invite.expires_at)}`, expired: false };
}
