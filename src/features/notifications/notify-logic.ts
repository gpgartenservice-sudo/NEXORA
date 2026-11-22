/**
 * Benachrichtigungen – reine Logik: Was wann gemeldet wird (Termine, fällige Rechnungen,
 * To-dos, Ziele, Motivation). Geplant wird immer für die nächsten Tage neu. Dazu sofort:
 * Antworten auf Angebote (online angenommen oder abgelehnt).
 */

export type NotifyKind = 'appointments' | 'invoices' | 'offers' | 'team' | 'todos' | 'goals' | 'motivation';

export type NotifyPrefs = Record<NotifyKind, boolean>;

export const DEFAULT_PREFS: NotifyPrefs = {
  appointments: true,
  invoices: true,
  offers: true,
  team: true,
  todos: true,
  goals: true,
  motivation: true,
};

export const NOTIFY_OPTIONS: { key: NotifyKind; title: string; text: string }[] = [
  { key: 'appointments', title: 'Termine', text: 'Eine Stunde vorher (ganztägige morgens um 8).' },
  { key: 'invoices', title: 'Fällige Rechnungen', text: 'Am Tag, an dem eine Rechnung fällig wird – und am Tag danach, wenn sie noch offen ist.' },
  { key: 'offers', title: 'Angebote', text: 'Sobald ein Kunde ein Angebot online annimmt oder ablehnt.' },
  { key: 'team', title: 'Team', text: 'Neue Nachrichten in den Team-Chats, Urlaubsanträge, Krankmeldungen und Antworten darauf.' },
  { key: 'todos', title: 'To-dos für heute', text: 'Morgens um halb neun, wenn etwas ansteht.' },
  { key: 'goals', title: 'Ziele', text: 'Sonntagabends: wie weit du diese Woche gekommen bist.' },
  { key: 'motivation', title: 'Motivation', text: 'Ab und zu ein Impuls von Luna, der dich weiterbringt.' },
];

export type PlannedNotification = { id: string; kind: NotifyKind; title: string; body: string; at: Date };

export type NotifyData = {
  events: { key: string; title: string; start: string; allDay: boolean; done: boolean; customerName: string | null; location: string | null }[];
  invoices: { id: string; number: string; total: number; due_on: string | null; paid_at: string | null; customerName: string | null }[];
  todos: { title: string; due_on: string | null; done: boolean }[];
  goals: { id: string; title: string; ratio: number; hint: string }[];
  impulses: string[];
};

const DAYS_AHEAD = 7;
/** iOS behält höchstens 64 geplante Mitteilungen */
const MAX = 60;

function at(day: string, h: number, m = 0): Date {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const euro = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

export function planNotifications(data: NotifyData, prefs: NotifyPrefs, now: Date = new Date()): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const until = addDays(now, DAYS_AHEAD);
  const add = (n: PlannedNotification) => {
    if (n.at > now && n.at <= until) out.push(n);
  };

  if (prefs.appointments) {
    for (const e of data.events) {
      if (e.done) continue;
      const start = new Date(e.start);
      if (Number.isNaN(start.getTime())) continue;
      const when = e.allDay ? at(dayKey(start), 8) : new Date(start.getTime() - 60 * 60_000);
      const time = start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      add({
        id: `appt-${e.key}`,
        kind: 'appointments',
        title: e.allDay ? `Heute: ${e.title}` : `In einer Stunde: ${e.title}`,
        body: [e.allDay ? null : `Um ${time} Uhr`, e.customerName, e.location].filter(Boolean).join(' · ') || 'Dein Termin steht an.',
        at: when,
      });
    }
  }

  if (prefs.invoices) {
    for (const inv of data.invoices) {
      if (inv.paid_at || !inv.due_on) continue;
      const who = inv.customerName ? ` von ${inv.customerName}` : '';
      add({
        id: `inv-due-${inv.id}`,
        kind: 'invoices',
        title: 'Rechnung heute fällig',
        body: `Rechnung ${inv.number}${who} über ${euro(inv.total)} ist heute fällig.`,
        at: at(inv.due_on, 9),
      });
      add({
        id: `inv-late-${inv.id}`,
        kind: 'invoices',
        title: 'Rechnung noch offen',
        body: `Rechnung ${inv.number}${who} (${euro(inv.total)}) ist seit gestern fällig. Zeit für eine freundliche Erinnerung?`,
        at: at(dayKey(addDays(at(inv.due_on, 12), 1)), 9, 30),
      });
    }
  }

  if (prefs.todos) {
    for (let i = 0; i <= DAYS_AHEAD; i++) {
      const day = dayKey(addDays(now, i));
      const due = data.todos.filter((t) => !t.done && t.due_on === day);
      if (!due.length) continue;
      add({
        id: `todos-${day}`,
        kind: 'todos',
        title: due.length === 1 ? 'Heute zu tun' : `Heute ${due.length} To-dos`,
        body: due.slice(0, 3).map((t) => t.title).join(' · ') + (due.length > 3 ? ' …' : ''),
        at: at(day, 8, 30),
      });
    }
  }

  if (prefs.goals && data.goals.length) {
    for (let i = 0; i <= DAYS_AHEAD; i++) {
      const d = addDays(now, i);
      if (d.getDay() !== 0) continue;
      const g = data.goals[0];
      add({
        id: `goals-${dayKey(d)}`,
        kind: 'goals',
        title: `Dein Ziel: ${g.title}`,
        body: `${Math.round(g.ratio * 100)} % geschafft. ${g.hint}`,
        at: at(dayKey(d), 18),
      });
    }
  }

  if (prefs.motivation && data.impulses.length) {
    // Montag, Mittwoch, Freitag um 9 Uhr
    for (let i = 0; i <= DAYS_AHEAD; i++) {
      const d = addDays(now, i);
      if (![1, 3, 5].includes(d.getDay())) continue;
      const start = new Date(d.getFullYear(), 0, 0);
      const n = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
      add({
        id: `motivation-${dayKey(d)}`,
        kind: 'motivation',
        title: 'Luna hat einen Impuls für dich 💚',
        body: data.impulses[n % data.impulses.length],
        at: at(dayKey(d), 9),
      });
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX);
}

/** Angebot mit Antwort des Kunden (über den Link zum Online-Annehmen) */
export type OfferReply = {
  id: string;
  number: string;
  total: number;
  customerName: string | null;
  accepted_at?: string | null;
  accepted_name?: string | null;
  declined_at?: string | null;
  decline_note?: string | null;
};

export type ReplyNote = { id: string; title: string; body: string };

/** Zeitpunkt der Antwort (angenommen oder abgelehnt) in ms – 0 ohne Antwort */
export function replyTime(o: OfferReply): number {
  const t = Date.parse(o.accepted_at ?? o.declined_at ?? '');
  return Number.isFinite(t) ? t : 0;
}

/** Mitteilungen für Antworten, die nach `since` (ms) kamen – älteste zuerst */
export function offerReplyNotes(offers: OfferReply[], since: number): ReplyNote[] {
  return offers
    .filter((o) => replyTime(o) > since)
    .sort((a, b) => replyTime(a) - replyTime(b))
    .map((o) => {
      if (o.accepted_at) {
        const who = o.accepted_name?.trim() || o.customerName || 'Dein Kunde';
        return {
          id: `offer-accepted-${o.id}`,
          title: `Angebot ${o.number} angenommen`,
          body: `${who} hat das Angebot über ${euro(o.total)} online angenommen.`,
        };
      }
      const note = o.decline_note?.trim();
      const short = note && note.length > 140 ? `${note.slice(0, 139)}…` : note;
      return {
        id: `offer-declined-${o.id}`,
        title: `Angebot ${o.number} abgelehnt`,
        body: `${o.customerName ?? 'Dein Kunde'} hat das Angebot abgelehnt.${short ? ` „${short}“` : ''}`,
      };
    });
}
