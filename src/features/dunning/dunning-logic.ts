/**
 * Zahlungserinnerungen, Mahnungen und Bewertungsbitten – reine Logik (mit Unit-Tests):
 * welche Stufe als Nächstes dran ist, Fristen, fertige Texte (Sie-Form, wie die Rechnung).
 *
 * Stufen: Zahlungserinnerung (freundlich) -> 1. Mahnung -> letzte Mahnung.
 * Danach bleibt nur noch das gerichtliche Mahnverfahren oder ein Inkasso.
 */
import { addDays, formatDay, formatMoney, sellerName, type DocumentData } from '../documents/document-logic';

export type FollowupKind = 'reminder' | 'dunning1' | 'dunning2' | 'review';
export type DunningKind = Exclude<FollowupKind, 'review'>;

export type Followup = {
  id: string;
  document_id: string;
  kind: FollowupKind;
  fee: number;
  new_due_on: string | null;
  sent_on: string;
  created_at: string;
};

/** Was die Logik von einer Rechnung braucht */
export type InvoiceLike = {
  id: string;
  kind: 'offer' | 'invoice';
  number: string;
  issued_on: string;
  due_on: string | null;
  total: number;
  paid_at: string | null;
  data: DocumentData;
};

export const STAGES: { kind: DunningKind; label: string; title: string; days: number }[] = [
  { kind: 'reminder', label: 'Zahlungserinnerung', title: 'ZAHLUNGSERINNERUNG', days: 7 },
  { kind: 'dunning1', label: '1. Mahnung', title: 'MAHNUNG', days: 7 },
  { kind: 'dunning2', label: 'Letzte Mahnung', title: 'LETZTE MAHNUNG', days: 7 },
];

export const stageLabel = (kind: FollowupKind) =>
  kind === 'review' ? 'Bitte um Bewertung' : STAGES.find((s) => s.kind === kind)!.label;

/** Offizielles Online-Portal der Mahngerichte (gerichtliches Mahnverfahren) */
export const MAHNPORTAL = 'https://www.online-mahnantrag.de';

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

/** Wie viele Tage ist die Rechnung überfällig? (0 = nicht überfällig) */
export function overdueDays(doc: Pick<InvoiceLike, 'due_on' | 'paid_at'>, today: string): number {
  if (doc.paid_at || !doc.due_on || doc.due_on >= today) return 0;
  return dayDiff(doc.due_on, today);
}

/** Erinnerungen/Mahnungen zu einer Rechnung, älteste zuerst */
export function dunningHistory(followups: Followup[], documentId: string): Followup[] {
  return followups
    .filter((f) => f.document_id === documentId && f.kind !== 'review')
    .sort((a, b) => a.sent_on.localeCompare(b.sent_on) || a.created_at.localeCompare(b.created_at));
}

export type DunningState =
  | { step: 'none' }
  | { step: 'paid' }
  /** nächste Stufe ist dran */
  | { step: 'due'; next: (typeof STAGES)[number]; overdue: number }
  /** Frist der letzten Erinnerung/Mahnung läuft noch */
  | { step: 'waiting'; last: Followup; until: string }
  /** alle Stufen durch, Frist abgelaufen */
  | { step: 'escalate'; last: Followup };

/** Wo steht die Rechnung im Mahnablauf? */
export function dunningState(doc: InvoiceLike, followups: Followup[], today: string): DunningState {
  if (doc.kind !== 'invoice') return { step: 'none' };
  if (doc.paid_at) return { step: 'paid' };
  const history = dunningHistory(followups, doc.id);
  const last = history[history.length - 1];
  if (last) {
    if (last.new_due_on && last.new_due_on >= today) return { step: 'waiting', last, until: last.new_due_on };
    const done = new Set(history.map((h) => h.kind));
    const next = STAGES.find((s) => !done.has(s.kind));
    return next ? { step: 'due', next, overdue: overdueDays(doc, today) } : { step: 'escalate', last };
  }
  const overdue = overdueDays(doc, today);
  return overdue > 0 ? { step: 'due', next: STAGES[0], overdue } : { step: 'none' };
}

/** Kurztext für Listen: "überfällig seit 12 Tagen · 1. Mahnung verschickt, Frist bis 20.11.2026" */
export function dunningSummary(state: DunningState): string | null {
  if (state.step === 'due')
    return `überfällig seit ${state.overdue} ${state.overdue === 1 ? 'Tag' : 'Tagen'} – ${state.next.label} ist dran`;
  if (state.step === 'waiting') return `${stageLabel(state.last.kind)} verschickt, Frist bis ${formatDay(state.until)}`;
  if (state.step === 'escalate') return 'Letzte Mahnung ohne Zahlung – nächster Schritt: Mahnverfahren';
  return null;
}

/** Summe der Mahngebühren (bisherige + neue) */
export function totalFees(history: Followup[], newFee = 0): number {
  return Math.round((history.reduce((s, f) => s + Number(f.fee || 0), 0) + newFee) * 100) / 100;
}

/** Neue Frist: heute + Tage der Stufe */
export function suggestedDueDate(kind: DunningKind, today: string): string {
  return addDays(today, STAGES.find((s) => s.kind === kind)!.days);
}

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

export type ReminderInput = {
  kind: DunningKind;
  doc: InvoiceLike;
  /** bisherige Erinnerungen/Mahnungen zu dieser Rechnung */
  history: Followup[];
  fee: number;
  newDueOn: string;
  customerName?: string | null;
  /** aktuelle Firmendaten (Absender) */
  seller?: DocumentData['seller'];
};

export type ReminderText = {
  subject: string;
  /** Anrede + Absätze (für PDF) */
  greeting: string;
  paragraphs: string[];
  /** komplette E-Mail */
  body: string;
  /** kurz für WhatsApp & Co. */
  chat: string;
  /** offener Betrag inkl. aller Mahngebühren */
  total: number;
};

export function reminderText({ kind, doc, history, fee, newDueOn, customerName, seller }: ReminderInput): ReminderText {
  const s = seller ?? doc.data.seller;
  const name = (customerName || doc.data.buyer.name || '').trim();
  const greeting = name ? `Guten Tag ${name},` : 'Guten Tag,';
  const amount = formatMoney(doc.total);
  const fees = totalFees(history, fee);
  const total = Math.round((doc.total + fees) * 100) / 100;
  const due = formatDay(newDueOn);
  const ref = `Rechnung ${doc.number} vom ${formatDay(doc.issued_on)}`;
  const earlier = history.filter((h) => h.kind !== kind);
  const earlierText = earlier.map((h) => `${stageLabel(h.kind)} vom ${formatDay(h.sent_on)}`).join(' und ');
  const feeLine =
    fees > 0
      ? `Zusammen mit ${fee > 0 && fees === fee ? 'einer Mahngebühr' : 'den Mahngebühren'} von ${formatMoney(fees)} sind damit ${formatMoney(total)} offen.`
      : null;
  const pay = `Bitte überweisen Sie ${fees > 0 ? 'den Gesamtbetrag' : 'den Betrag'} bis zum ${due} unter Angabe der Rechnungsnummer ${doc.number}.`;

  let subject: string;
  let paragraphs: string[];
  let chat: string;
  if (kind === 'reminder') {
    subject = `Zahlungserinnerung – Rechnung ${doc.number}`;
    paragraphs = [
      `sicher ist es im Alltag einfach untergegangen: Für die ${ref} über ${amount} konnte ich bis heute noch keinen Zahlungseingang feststellen${doc.due_on ? ` (fällig seit ${formatDay(doc.due_on)})` : ''}.`,
      ...(feeLine ? [feeLine] : []),
      pay,
      'Falls Sie den Betrag bereits überwiesen haben, betrachten Sie diese Erinnerung bitte als gegenstandslos. Bei Fragen melden Sie sich gern bei mir.',
    ];
    chat = `${greeting} kurze Erinnerung: Die Rechnung ${doc.number} über ${fees > 0 ? formatMoney(total) : amount} ist noch offen. Bitte überweisen Sie bis zum ${due}. Falls schon erledigt – vielen Dank und bitte ignorieren!`;
  } else if (kind === 'dunning1') {
    subject = `1. Mahnung – Rechnung ${doc.number}`;
    paragraphs = [
      `leider konnte ich für die ${ref} über ${amount} trotz ${earlierText ? `meiner ${earlierText}` : 'Fälligkeit'} bis heute keinen Zahlungseingang feststellen.`,
      ...(feeLine ? [feeLine] : []),
      pay,
      'Sollten Sie den Betrag inzwischen überwiesen haben, ist dieses Schreiben gegenstandslos.',
    ];
    chat = `${greeting} die Rechnung ${doc.number} über ${amount} ist leider weiterhin offen. ${fees > 0 ? `Inkl. Mahngebühr sind es ${formatMoney(total)}. ` : ''}Bitte überweisen Sie bis spätestens ${due}. Die Mahnung schicke ich Ihnen als PDF mit.`;
  } else {
    subject = `Letzte Mahnung – Rechnung ${doc.number}`;
    paragraphs = [
      `trotz ${earlierText ? `meiner ${earlierText}` : 'mehrfacher Erinnerung'} ist die ${ref} über ${amount} bis heute nicht bezahlt.`,
      ...(feeLine ? [feeLine] : []),
      `Ich fordere Sie hiermit letztmalig auf, ${fees > 0 ? 'den Gesamtbetrag' : 'den Betrag'} bis spätestens ${due} unter Angabe der Rechnungsnummer ${doc.number} zu überweisen.`,
      'Geht die Zahlung bis dahin nicht ein, werde ich ohne weitere Ankündigung das gerichtliche Mahnverfahren einleiten. Die dadurch entstehenden Kosten gehen zu Ihren Lasten. Verzugszinsen behalte ich mir vor.',
    ];
    chat = `${greeting} letzte Mahnung zur Rechnung ${doc.number}: Offen sind ${formatMoney(total)}. Geht die Zahlung nicht bis ${due} ein, leite ich das gerichtliche Mahnverfahren ein. Das Schreiben finden Sie im Anhang.`;
  }

  const sender = (s.owner_name || sellerName(s)).trim();
  const company = sellerName(s);
  const signature = [sender, company !== sender ? company : '', s.phone ? `Tel. ${s.phone}` : '']
    .map((l) => l.trim())
    .filter(Boolean);
  const bank = s.iban
    ? `Bankverbindung: ${[s.bank_name, `IBAN ${s.iban}`, s.bic ? `BIC ${s.bic}` : ''].filter(Boolean).join(' · ')}`
    : null;
  const body = [
    greeting,
    ...paragraphs,
    ...(bank ? [bank] : []),
    ['Mit freundlichen Grüßen', ...signature].join('\n'),
  ].join('\n\n');
  if (sender) chat += ` Viele Grüße, ${sender}`;
  return { subject, greeting, paragraphs, body, chat, total };
}

/** Bitte um eine Bewertung (nach der Zahlung) */
export function reviewText(input: {
  doc: InvoiceLike;
  reviewUrl: string;
  customerName?: string | null;
  seller?: DocumentData['seller'];
}): { subject: string; body: string; chat: string } {
  const s = input.seller ?? input.doc.data.seller;
  const name = (input.customerName || input.doc.data.buyer.name || '').trim();
  const greeting = name ? `Guten Tag ${name},` : 'Guten Tag,';
  const what = input.doc.data.items.length === 1 ? input.doc.data.items[0].description.trim() : '';
  const company = sellerName(s);
  const sender = (s.owner_name || company).trim();
  const subject = `Danke${what ? ` für „${what}“` : ''} – eine kleine Bitte`;
  const body = [
    greeting,
    `vielen Dank für die Zusammenarbeit${what ? ` bei „${what}“` : ''} und die Zahlung der Rechnung ${input.doc.number}!`,
    `Wenn Sie zufrieden waren, würde ich mich sehr über eine kurze Bewertung freuen – das dauert nur eine Minute und hilft ${company ? company : 'mir'} enorm:\n${input.reviewUrl}`,
    ['Herzliche Grüße', sender, company !== sender ? company : ''].filter(Boolean).join('\n'),
  ].join('\n\n');
  const chat = `${greeting} vielen Dank für die Zusammenarbeit und die Zahlung! Wenn Sie zufrieden waren, würde ich mich sehr über eine kurze Bewertung freuen: ${input.reviewUrl}${sender ? ` Herzliche Grüße, ${sender}` : ''}`;
  return { subject, body, chat };
}

/** Dateiname, z. B. "Mahnung_1_RE-2026-0001_Peter_Mueller.pdf" */
export function reminderFileName(kind: DunningKind, doc: Pick<InvoiceLike, 'number' | 'data'>): string {
  const who = (doc.data.buyer.company || doc.data.buyer.name || '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const prefix = kind === 'reminder' ? 'Zahlungserinnerung' : kind === 'dunning1' ? 'Mahnung_1' : 'Letzte_Mahnung';
  return `${prefix}_${doc.number}${who ? `_${who}` : ''}.pdf`;
}

/** Ist das ein brauchbarer Bewertungs-Link? */
export function validReviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && !!u.hostname.includes('.');
  } catch {
    return false;
  }
}
