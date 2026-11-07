/**
 * Abo (Gratis / Pro) – reine Logik (ohne App/Netz, mit Unit-Tests).
 * Die verbindlichen Grenzen prüft der Server (Skript 20261116090000_plans.sql,
 * Funktionen "assistant" und "mail"); die App zeigt sie nur an.
 */
import { toIso, toMs } from '../../lib/dates';

export type PlanKind = 'free' | 'trial' | 'pro';
export type QuotaKind = 'nexy' | 'receipt';
export type Usage = { used: number; limit: number };

export type PlanInfo = {
  plan: PlanKind;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  month: string;
  usage: Record<QuotaKind, Usage>;
};

export const PRICE_MONTH = 9.99;
export const PRICE_YEAR = 99;
export const TRIAL_DAYS = 14;
export const FREE_LIMITS: Record<QuotaKind, number> = { nexy: 20, receipt: 5 };
export const PRO_LIMITS: Record<QuotaKind, number> = { nexy: 300, receipt: 300 };

export type ProFeature =
  | 'direct_mail'
  | 'offer_link'
  | 'dunning'
  | 'tax_zip'
  | 'social_connect'
  | 'calendar_feed'
  | 'no_branding';

/** Kurzname für Hinweise („… gibt es mit Pro“) */
export const FEATURE_LABEL: Record<ProFeature, string> = {
  direct_mail: 'E-Mails direkt aus Lunaxora',
  offer_link: 'Angebote online annehmen lassen',
  dunning: '1. Mahnung und letzte Mahnung',
  tax_zip: 'Steuer-Export als ZIP',
  social_connect: 'TikTok & Instagram verbinden',
  calendar_feed: 'Kalender-Abo',
  no_branding: 'PDFs ohne „Erstellt mit Lunaxora“',
};

/** Vergleich Gratis / Pro (für die Abo-Seite) */
export const COMPARISON: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: 'Kunden, Aufträge, Termine, To-dos & Ziele', free: true, pro: true },
  { label: 'Angebote & Rechnungen als PDF mit Logo', free: true, pro: true },
  { label: 'Finanzen, Steuer-Topf, Kleinunternehmer-Grenze', free: true, pro: true },
  { label: 'Einkommensnachweis', free: true, pro: true },
  { label: 'Social-Media-Planung', free: true, pro: true },
  { label: 'Zahlungserinnerung', free: true, pro: true },
  { label: 'Luna-Nachrichten pro Monat', free: '20', pro: 'unbegrenzt*' },
  { label: 'Belege von Luna auslesen lassen', free: '5 / Monat', pro: 'unbegrenzt*' },
  { label: FEATURE_LABEL.direct_mail, free: false, pro: true },
  { label: FEATURE_LABEL.offer_link, free: false, pro: true },
  { label: FEATURE_LABEL.dunning, free: false, pro: true },
  { label: FEATURE_LABEL.tax_zip, free: false, pro: true },
  { label: FEATURE_LABEL.social_connect, free: false, pro: true },
  { label: FEATURE_LABEL.calendar_feed, free: false, pro: true },
  { label: 'PDFs ohne „Erstellt mit Lunaxora“', free: false, pro: true },
];

/** Hat der Server mit „nur mit Pro“ geantwortet? (Datenbank: Fehler PT402 / Funktion: 402) */
export function isProRequired(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === 'PT402' || /pro_required/.test(error.message ?? ''));
}

/** Hinweis, wenn eine Pro-Funktion im Gratis-Abo benutzt wird */
export function proRequiredText(feature: ProFeature): string {
  return `„${FEATURE_LABEL[feature]}“ gibt es mit Lunaxora Pro. Deine Testphase ist vorbei – unter Profil → Abo siehst du, was Pro kann.`;
}

/** Testphase zählt wie Pro */
export const isPro = (plan: PlanKind) => plan !== 'free';

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const date = (v: unknown) => (typeof v === 'string' ? toIso(v) : null);

/** Antwort der Datenbank (my_plan) prüfen; null = unbrauchbar */
export function parsePlan(raw: unknown): PlanInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.plan !== 'free' && r.plan !== 'trial' && r.plan !== 'pro') return null;
  const usage = (r.usage ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const u = (k: QuotaKind): Usage => ({
    used: Math.max(0, num(usage[k]?.used, 0)),
    limit: Math.max(0, num(usage[k]?.limit, r.plan === 'free' ? FREE_LIMITS[k] : PRO_LIMITS[k])),
  });
  return {
    plan: r.plan,
    status: typeof r.status === 'string' ? r.status : '',
    trial_ends_at: date(r.trial_ends_at),
    current_period_end: date(r.current_period_end),
    month: typeof r.month === 'string' ? r.month : '',
    usage: { nexy: u('nexy'), receipt: u('receipt') },
  };
}

/** Restliche Tage der Testphase (aufgerundet), sonst null */
export function trialDaysLeft(info: PlanInfo, now: Date): number | null {
  if (info.plan !== 'trial' || !info.trial_ends_at) return null;
  const ms = toMs(info.trial_ends_at) - now.getTime();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

/** „Pro“, „Pro-Test · noch 12 Tage“, „Gratis“ */
export function planLabel(info: PlanInfo, now: Date): string {
  if (info.plan === 'pro') return 'Pro';
  if (info.plan === 'trial') {
    const d = trialDaysLeft(info, now) ?? 0;
    return `Pro-Test · noch ${d} ${d === 1 ? 'Tag' : 'Tage'}`;
  }
  return 'Gratis';
}

/** „Noch 3 von 20 Luna-Nachrichten im November“ (nur bei Gratis, sonst null) */
export function quotaText(info: PlanInfo, kind: QuotaKind): string | null {
  if (info.plan !== 'free') return null;
  const { used, limit } = info.usage[kind];
  const left = Math.max(0, limit - used);
  const what =
    kind === 'nexy' ? (limit === 1 ? 'Luna-Nachricht' : 'Luna-Nachrichten') : limit === 1 ? 'Beleg' : 'Belegen';
  return kind === 'nexy'
    ? `Noch ${left} von ${limit} ${what} in diesem Monat`
    : `Noch ${left} von ${limit} ${what} zum Auslesen in diesem Monat`;
}

export function formatPrice(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
