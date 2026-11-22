/**
 * Abo (Gratis / Pro / Business / Teams) – reine Logik (ohne App/Netz, mit Unit-Tests).
 * Die verbindlichen Grenzen prüft der Server (Skripte 20261116090000_plans.sql und
 * 20261117090000_plan_tiers.sql, Funktionen "assistant" und "mail"); die App zeigt sie nur an.
 */
import { toIso, toMs } from '../../lib/dates';

export type PlanKind = 'free' | 'trial' | 'pro' | 'business' | 'teams';
export type QuotaKind = 'nexy' | 'receipt' | 'voice';
export type PaidTier = 'pro' | 'business' | 'teams';
export type Usage = { used: number; limit: number };

export type PlanInfo = {
  plan: PlanKind;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  month: string;
  usage: Record<QuotaKind, Usage>;
};

/** Endpreise – Kleinunternehmer, keine USt. (§ 19 UStG); Jahr: zwei Monate geschenkt (Pro vom 17.11.2026: 23,99 € bzw. 10 × 23,99 € = 239,90 € im Jahr) */
export const PRICES: Record<PaidTier, { month: number; year: number }> = {
  pro: { month: 23.99, year: 239.9 },
  business: { month: 150, year: 1500 },
  /** bis zu 30 Personen mit Rollen, Chats, Arbeitsplan und Urlaub (Skript 20261128090000_teams.sql) */
  teams: { month: 349, year: 3490 },
};
/**
 * Jede weitere Firma im selben Konto (Pro und Business, Skript 20261127090000_mehrere_firmen.sql):
 * eigene Kunden, Rechnungen, Nummernkreise und eigenes Team. Luna-Kontingent und Personen
 * teilen sich alle Firmen des Kontos. Jahr: zwei Monate geschenkt.
 */
export const EXTRA_COMPANY_PRICE = { month: 9.99, year: 99.9 };
/** Business: so viele Konten (Personen) teilen sich ein Business – passend z. B. für eine GbR */
export const BUSINESS_SEATS = 5;
/** Teams: Inhaber, Mitgründer und Mitarbeiter zusammen */
export const TEAMS_SEATS = 30;
export const TRIAL_DAYS = 14;
/** Grenzen je Kalendermonat – gleiche Zahlen wie nexora_limit() in 20261117090000_plan_tiers.sql */
export const LIMITS: Record<PlanKind, Record<QuotaKind, number>> = {
  free: { nexy: 15, receipt: 3, voice: 30 },
  trial: { nexy: 50, receipt: 20, voice: 70 },
  pro: { nexy: 100, receipt: 50, voice: 120 },
  /** fürs ganze Team zusammen */
  business: { nexy: 500, receipt: 250, voice: 600 },
  /** fürs ganze Team zusammen (bis 30 Personen) */
  teams: { nexy: 2000, receipt: 1000, voice: 2400 },
};

export type ProFeature =
  | 'direct_mail'
  | 'offer_link'
  | 'dunning'
  | 'tax_zip'
  | 'social_connect'
  | 'calendar_feed'
  | 'no_branding'
  | 'social_import'
  | 'design'
  | 'team';

/** Kurzname für Hinweise („… gibt es mit Pro“) */
export const FEATURE_LABEL: Record<ProFeature, string> = {
  direct_mail: 'E-Mails direkt aus Lunaxora',
  offer_link: 'Angebote online annehmen lassen',
  dunning: '1. Mahnung und letzte Mahnung',
  tax_zip: 'Steuer-Export als ZIP',
  social_connect: 'TikTok verbinden',
  calendar_feed: 'Kalender verbinden',
  no_branding: 'PDFs ohne „Erstellt mit Lunaxora“',
  social_import: 'Beiträge aus TikTok übernehmen',
  design: 'Design-Einstellungen',
  team: 'Team mit Rollen, Chats und Arbeitsplan',
};

/** Funktionen nur mit Business oder Teams (alles andere aus FEATURE_LABEL geht ab Pro) */
export const BUSINESS_ONLY: ProFeature[] = ['team'];

/** Team-Funktionen (Team, Rollen, Chats, Arbeitsplan, Urlaub): Business, Teams und Testphase */
export const hasTeamPlan = (plan: PlanKind | null | undefined) => plan === 'business' || plan === 'teams' || plan === 'trial';

/** Plätze im Konto (Inhaber eingerechnet) */
export const seatsFor = (plan: PlanKind | null | undefined) => (plan === 'teams' ? TEAMS_SEATS : plan === 'business' || plan === 'trial' ? BUSINESS_SEATS : 1);

type Cell = string | boolean;
const both = (free: Cell, pro: Cell, business: Cell = pro, teams: Cell = business) => ({ free, pro, business, teams });
const perMonth = (k: QuotaKind) =>
  both(String(LIMITS.free[k]), String(LIMITS.pro[k]), String(LIMITS.business[k]), String(LIMITS.teams[k]));

/** Vergleich Gratis / Pro / Business / Teams (für die Abo-Seite; \u00AD = Trennstelle für schmale Handys) */
export const COMPARISON: ({ label: string } & Record<'free' | PaidTier, Cell>)[] = [
  { label: 'Kunden, Aufträge, Termine, To-dos & Ziele', ...both(true, true) },
  { label: 'Fahrplan für den Start in die Selbst\u00ADständigkeit', ...both(true, true) },
  { label: 'Angebote & Rechnungen als PDF mit Logo', ...both(true, true) },
  { label: 'Finanzen, Steuer-Topf, Klein\u00ADunternehmer-Grenze', ...both(true, true) },
  { label: 'Einkommens\u00ADnachweis', ...both(true, true) },
  { label: 'Social-Media-Planung mit Zahlen & Hashtags', ...both(true, true) },
  { label: 'Zahlungs\u00ADerinnerung', ...both(true, true) },
  { label: 'Luna-Nachrichten pro Monat', ...perMonth('nexy') },
  { label: 'Belege von Luna auslesen lassen (pro Monat)', ...perMonth('receipt') },
  { label: 'Luna liest vor (Antworten pro Monat, ca.)', ...perMonth('voice') },
  { label: FEATURE_LABEL.direct_mail, ...both(false, true) },
  { label: FEATURE_LABEL.offer_link, ...both(false, true) },
  { label: FEATURE_LABEL.dunning, ...both(false, true) },
  { label: FEATURE_LABEL.tax_zip, ...both(false, true) },
  { label: FEATURE_LABEL.social_connect, ...both(false, true) },
  { label: FEATURE_LABEL.calendar_feed, ...both(false, true) },
  { label: 'PDFs ohne „Erstellt mit Lunaxora“', ...both(false, true) },
  { label: 'Lagerbestand, Wetter im Kalender, Benachrichtigungen', ...both(true, true) },
  { label: FEATURE_LABEL.social_import, ...both(false, true) },
  { label: FEATURE_LABEL.design, ...both(false, true) },
  { label: 'Personen im Konto', ...both('1', '1', String(BUSINESS_SEATS), String(TEAMS_SEATS)) },
  { label: 'Team-Chats, Rollen & Rechte', ...both(false, false, true) },
  { label: 'Arbeits\u00ADplan, Urlaub & Krank\u00ADmeldung', ...both(false, false, true) },
  { label: 'Weitere Firma im selben Konto (pro Monat)', ...both(false, '9,99 €') },
  { label: 'Geräte gleichzeitig (pro Person)', ...both('1', '1 iPhone + 1 Mac') },
];

/** Hat der Server mit „nur mit Pro“ geantwortet? (Datenbank: Fehler PT402 / Funktion: 402) */
export function isProRequired(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === 'PT402' || /pro_required/.test(error.message ?? ''));
}

/** Hinweis, wenn eine Pro-Funktion im Gratis-Abo benutzt wird */
export function proRequiredText(feature: ProFeature): string {
  if (BUSINESS_ONLY.includes(feature))
    return `„${FEATURE_LABEL[feature]}“ gibt es mit Lunaxora Business und Teams. Unter Profil → Abo siehst du, was die beiden können.`;
  return `„${FEATURE_LABEL[feature]}“ gibt es mit Lunaxora Pro. Deine Testphase ist vorbei – unter Profil → Abo siehst du, was Pro kann.`;
}

/** Testphase und Business zählen wie Pro (alle Pro-Funktionen) */
export const isPro = (plan: PlanKind) => plan !== 'free';

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const date = (v: unknown) => (typeof v === 'string' ? toIso(v) : null);

/** Antwort der Datenbank (my_plan) prüfen; null = unbrauchbar */
export function parsePlan(raw: unknown): PlanInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const plan = r.plan;
  if (plan !== 'free' && plan !== 'trial' && plan !== 'pro' && plan !== 'business' && plan !== 'teams') return null;
  const usage = (r.usage ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const u = (k: QuotaKind): Usage => ({
    used: Math.max(0, num(usage[k]?.used, 0)),
    limit: Math.max(0, num(usage[k]?.limit, LIMITS[plan][k])),
  });
  return {
    plan,
    status: typeof r.status === 'string' ? r.status : '',
    trial_ends_at: date(r.trial_ends_at),
    current_period_end: date(r.current_period_end),
    month: typeof r.month === 'string' ? r.month : '',
    usage: { nexy: u('nexy'), receipt: u('receipt'), voice: u('voice') },
  };
}

/** Restliche Tage der Testphase (aufgerundet), sonst null */
export function trialDaysLeft(info: PlanInfo, now: Date): number | null {
  if (info.plan !== 'trial' || !info.trial_ends_at) return null;
  const ms = toMs(info.trial_ends_at) - now.getTime();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

/** „Teams“, „Business“, „Pro“, „Pro-Test · noch 12 Tage“, „Gratis“ */
export function planLabel(info: PlanInfo, now: Date): string {
  if (info.plan === 'teams') return 'Teams';
  if (info.plan === 'business') return 'Business';
  if (info.plan === 'pro') return 'Pro';
  if (info.plan === 'trial') {
    const d = trialDaysLeft(info, now) ?? 0;
    return `Pro-Test · noch ${d} ${d === 1 ? 'Tag' : 'Tage'}`;
  }
  return 'Gratis';
}

/** „Noch 3 von 15 Luna-Nachrichten in diesem Monat“ (gilt für jedes Abo – alle haben Grenzen) */
export function quotaText(info: PlanInfo, kind: QuotaKind): string {
  const { used, limit } = info.usage[kind];
  const left = Math.max(0, limit - used);
  if (kind === 'nexy') return `Noch ${left} von ${limit} ${limit === 1 ? 'Luna-Nachricht' : 'Luna-Nachrichten'} in diesem Monat`;
  if (kind === 'receipt') return `Noch ${left} von ${limit} ${limit === 1 ? 'Beleg' : 'Belegen'} zum Auslesen in diesem Monat`;
  return `Noch ${left} von ${limit}-mal Vorlesen in diesem Monat`;
}

const UPGRADE: Record<PlanKind, string> = {
  free: 'Mit Lunaxora Pro geht es gleich weiter',
  trial: 'Mit Lunaxora Pro geht es gleich weiter',
  pro: 'Mit Lunaxora Business habt ihr fünfmal so viel fürs ganze Team',
  business: `Mit Lunaxora Teams habt ihr viermal so viel – für bis zu ${TEAMS_SEATS} Personen`,
  teams: 'Ab dem 1. des nächsten Monats geht es weiter',
};

/** Hinweis, wenn der Server „Kontingent aufgebraucht“ meldet (Funktion "assistant", Fehler quota_exceeded) */
export function quotaExceededText(kind: QuotaKind, plan: unknown, limit: unknown): string {
  const p: PlanKind = plan === 'trial' || plan === 'pro' || plan === 'business' || plan === 'teams' ? plan : 'free';
  const n = typeof limit === 'number' && limit > 0 ? limit : LIMITS[p][kind];
  const own = p === 'free' ? 'Gratis-' : p === 'trial' ? 'Test-' : '';
  const what =
    kind === 'nexy'
      ? `Deine ${n} ${own}Nachrichten an Luna sind für diesen Monat aufgebraucht.`
      : kind === 'receipt'
        ? `Deine ${n} ${own}Belege zum Auslesen sind für diesen Monat aufgebraucht. Trag die Ausgabe einfach selbst ein – der Beleg wird trotzdem gespeichert.`
        : `Lunas Stimme ist für diesen Monat aufgebraucht (${n}-mal Vorlesen) – sie antwortet weiter als Text.`;
  const next = p === 'teams' ? `${UPGRADE.teams}.` : `${UPGRADE[p]} – sonst wieder ab dem 1. des nächsten Monats.`;
  return `${what} ${next} Dein Abo siehst du unter Profil → Abo.`;
}

export function formatPrice(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}
