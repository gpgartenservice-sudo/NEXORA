/**
 * Abo über App Store / Google Play – reine Logik (ohne App/Netz, mit Unit-Tests).
 * Den Kauf selbst macht store-purchase.native.ts (expo-iap); ob er echt ist, prüft die
 * Server-Funktion "store" direkt bei Apple bzw. Google.
 */
import type { PaidTier } from './plan-logic';

export type StorePlatform = 'ios' | 'android';
export type StoreInterval = 'month' | 'year';

/** Produkt-IDs in App Store Connect und Play Console – dieselben Namen wie die Stripe-Lookup-Keys */
export const storeSku = (tier: PaidTier, interval: StoreInterval) => `${tier}_${interval}`;
export const STORE_SKUS = ['pro_month', 'pro_year', 'business_month', 'business_year', 'teams_month', 'teams_year'];
export const isStoreSku = (sku: string | null | undefined) => !!sku && STORE_SKUS.includes(sku);

export const storeName = (p: StorePlatform | 'apple' | 'google') => (p === 'ios' || p === 'apple' ? 'App Store' : 'Google Play');

/** Ergebnis eines Kaufs bzw. einer Prüfung */
export type StoreResult = {
  /** Abo freigeschaltet (bzw. nichts zu tun) */
  ok?: boolean;
  /** Zahlung noch offen (z. B. „Kaufen fragen“ in der Familie) */
  pending?: boolean;
  /** Kauf beim Store abschließen (finishTransaction) */
  finish?: boolean;
  /** abgebrochen – keine Meldung zeigen */
  cancelled?: boolean;
  /** Text für die Abo-Seite */
  error?: string;
  /** Hinweis ohne Fehler (z. B. „nichts gefunden“) */
  info?: string;
  /** im Hintergrund nicht melden (Kauf eines anderen Kontos auf diesem Gerät) */
  quiet?: boolean;
};

type Row = { source?: string | null; plan?: string | null; status?: string | null; current_period_end?: string | null };

const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

/**
 * Darf hier im Store gekauft werden? null = ja; sonst der Grund (kein zweites bezahltes Abo).
 * Ein laufendes Abo im selben Store ist kein Hindernis: Stufe wechseln geht dort direkt.
 */
export function storeBlockText(row: Row, platform: StorePlatform): string | null {
  const paid = row.plan === 'pro' || row.plan === 'business' || row.plan === 'teams';
  const src = row.source ?? '';
  if (src === 'admin') return 'Admin-Zugang: alles freigeschaltet, kostenlos – hier gibt es nichts zu kaufen.';
  if (!paid) return null;
  const own = platform === 'ios' ? 'apple' : 'google';
  if (src === own) return null;
  if (src === 'apple' || src === 'google')
    return `Dein Abo läuft über ${storeName(src)}. Ändern oder kündigen kannst du es dort – auf dem Gerät, mit dem du es abgeschlossen hast.`;
  if (src === 'stripe')
    return 'Dein Abo hast du über unsere Website abgeschlossen. Ändern oder kündigen kannst du es dort – ein zweites Abo brauchst du nicht.';
  if (src === 'voucher')
    return row.current_period_end
      ? `Dein Gutschein läuft noch bis zum ${day(row.current_period_end)}. Danach kannst du hier ein Abo abschließen.`
      : 'Dein Gutschein läuft noch. Danach kannst du hier ein Abo abschließen.';
  return 'Dein Abo ist schon freigeschaltet – ein zweites brauchst du nicht.';
}

const SETUP = 'Das Bezahlen in der App ist auf dem Server noch nicht fertig eingerichtet (Anleitung: supabase/README.md, Abschnitt 20).';

/**
 * Antwort der Funktion "store" -> was die App tut. finish: Kauf beim Store abschließen.
 * Bei einem Konflikt schließt Android den Kauf NICHT ab – Google erstattet ihn dann nach 3 Tagen
 * von selbst. Bei Apple geht das nicht, dort hilft nur kündigen (und ggf. Erstattung bei Apple).
 */
export function verifyOutcome(status: number, body: Record<string, unknown> | null, platform: StorePlatform): StoreResult {
  const code = typeof body?.error === 'string' ? body.error : '';
  const store = storeName(platform);
  if (status === 200 && body?.pending) return { pending: true, info: 'Die Zahlung ist noch nicht abgeschlossen. Sobald sie bestätigt ist, schalten wir dein Abo frei.' };
  // alter, abgelaufener Kauf (z. B. beim Wiederherstellen): abschließen, am Abo ändert sich nichts
  if (status === 200 && body?.ignored) return { finish: true };
  if (status === 200 && body?.ok) return { ok: true, finish: true };
  if (status === 409 || status === 403) {
    const finish = platform === 'ios';
    const refund =
      platform === 'android'
        ? ' Google Play erstattet diesen Kauf in den nächsten 3 Tagen automatisch.'
        : ' Kündige bitte eines der Abos (Button „Abo verwalten“) – eine Erstattung kannst du bei Apple beantragen.';
    if (code === 'other_account')
      return {
        finish,
        quiet: true,
        error: 'Dieser Kauf gehört zu einem anderen Lunaxora-Konto. Melde dich mit dem Konto an, mit dem du ihn abgeschlossen hast.',
      };
    if (code === 'admin_plan') return { finish, error: `Dein Konto hat einen Admin-Zugang – dafür wird nichts abgebucht.${refund}` };
    const via = body?.with === 'stripe' ? 'über unsere Website' : body?.with === 'apple' || body?.with === 'google' ? `über ${storeName(body.with)}` : 'schon';
    return { finish, error: `Du hast bereits ein Abo ${via}. Ein zweites wird nicht freigeschaltet.${refund}` };
  }
  if (status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an und tippe dann auf „Käufe wiederherstellen“.' };
  if (status === 404) return { error: `${store} kennt diesen Kauf (noch) nicht. Versuch es in ein paar Minuten mit „Käufe wiederherstellen“.` };
  if (code === 'store_not_configured' || code === 'apple_auth' || code === 'apple_key_invalid' || code === 'google_auth' || code === 'google_key_invalid')
    return { error: `${SETUP}\n\nTechnische Details: ${code}` };
  if (code === 'unknown_product') return { error: `Dieses Produkt kennt Lunaxora nicht (${String(body?.product ?? '?')}).` };
  return {
    error: `Dein Kauf ist angekommen, aber die Freischaltung hat gerade nicht geklappt. Tippe gleich noch einmal auf „Käufe wiederherstellen“ – bezahlt wird dabei nichts.\n\nTechnische Details: ${status} ${code}`.trim(),
  };
}

/** Fehler aus dem Store (expo-iap ErrorCode) -> Ergebnis */
export function purchaseErrorOutcome(code: string | undefined, message: string | undefined, platform: StorePlatform): StoreResult {
  const store = storeName(platform);
  switch (code) {
    case 'user-cancelled':
      return { cancelled: true };
    case 'deferred-payment':
    case 'pending':
      return { pending: true, info: 'Der Kauf wartet noch auf eine Bestätigung (z. B. „Kaufen fragen“ in der Familie). Sobald er bestätigt ist, schalten wir dein Abo frei.' };
    case 'already-owned':
      return { error: `Dieses Abo hast du schon. Tippe auf „Käufe wiederherstellen“, damit Lunaxora es freischaltet.` };
    case 'network-error':
    case 'service-timeout':
    case 'connection-closed':
      return { error: `${store} ist gerade nicht erreichbar. Prüfe deine Internetverbindung und versuch es noch einmal.` };
    case 'sku-not-found':
    case 'item-unavailable':
      return { error: `Dieses Abo ist im ${store} gerade nicht verfügbar. Versuch es später noch einmal.` };
    default:
      return { error: `Der Kauf hat nicht geklappt. Es wurde nichts abgebucht.${message ? `\n\nTechnische Details: ${code ?? ''} ${message}`.trimEnd() : ''}` };
  }
}

/** Mehrere Prüfungen (z. B. beim Wiederherstellen) zu einem Ergebnis zusammenfassen */
export function mergeResults(results: StoreResult[]): StoreResult {
  if (!results.length) return { info: 'Wir haben keine Lunaxora-Käufe gefunden, die sich wiederherstellen lassen.' };
  if (results.some((r) => r.ok)) return { ok: true };
  const err = results.find((r) => r.error);
  if (err) return { error: err.error };
  const pending = results.find((r) => r.pending);
  if (pending) return pending;
  return { info: 'Wir haben keine laufenden Lunaxora-Abos gefunden.' };
}
