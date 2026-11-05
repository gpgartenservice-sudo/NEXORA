/**
 * Nexy macht es vor – reine Logik (ohne App, mit Unit-Tests): Bevor Nexy etwas
 * speichert, geht sie in der App dorthin, wo man es selbst eintragen würde,
 * tippt die Werte sichtbar in die echten Felder und drückt auf Speichern.
 * Hier steht, welche Schritte das für jede Aktion sind und wo Nexy neben
 * der gerade gezeigten Stelle steht.
 *
 * Felder und Knöpfe werden über ihre Beschriftung gefunden (wie ein Mensch
 * sie liest). Die Beschriftungen stehen gesammelt in LABELS – ein Test prüft,
 * dass es sie in den Formularen wirklich gibt.
 */
import type { Rect, Size } from '../tutorial/tutorial-logic';
import { formatEuro } from '../crm/order-logic';

import { goalLabel, whenLabel, type KnownEvent, type Proposal } from './assistant-logic';

/**
 * Wo Nexy hinzeigt: eine markierte Stelle (TourTarget), ein Eingabefeld oder
 * ein Knopf (über die Beschriftung; endet sie auf „…“, reicht der Anfang).
 */
export type GuideSpot = { target: string } | { field: string } | { button: string };

export type GuideStep =
  /** Seite öffnen (push = neue Seite obendrauf, replace = statt der aktuellen) */
  | { do: 'go'; href: string; mode?: 'push' | 'replace' }
  /** Nexy geht zur Stelle, die leuchtet; mit `say` sagt sie etwas dazu */
  | { do: 'show'; at?: GuideSpot; say?: string }
  /** Buchstabe für Buchstabe ins Feld tippen ('' = Feld leeren) */
  | { do: 'type'; field: string; text: string }
  /** Datum (JJJJ-MM-TT) bzw. Zeitpunkt (ISO) ins Datumsfeld setzen */
  | { do: 'date'; field: string; value: string | null; withTime: boolean }
  /** Nexy drückt auf den Knopf (gespeichert wird danach von Nexy selbst) */
  | { do: 'press'; button: string };

type Named = { id: string; name: string };
/** Auftrag mit seinem Kunden (falls bekannt) */
export type GuideOrder = { id: string; title: string; customer?: Named | null; billing?: 'once' | 'monthly' | null };

/** Beschriftungen der Felder und Knöpfe, so wie sie in der App stehen */
export const LABELS = {
  customer: {
    name: 'Name',
    company: 'Firma',
    phone: 'Telefon',
    email: 'E-Mail',
    address: 'Adresse',
    notes: 'Notizen',
    save: 'Kunde anlegen',
    newOrder: '+ Neuer Auftrag',
  },
  newOrder: { title: 'Leistung', description: 'Beschreibung', price: 'Preis in €', save: 'Auftrag anlegen' },
  order: {
    meeting: 'Termin (z. B. Erstgespräch, Besichtigung)',
    execution: 'Ausführung',
    price: 'Preis…',
    save: 'Änderungen speichern',
    offer: '+ Angebot',
    invoice: '+ Rechnung',
  },
  appointment: {
    title: 'Was?',
    start: 'Beginn',
    day: 'Tag',
    location: 'Ort',
    notes: 'Notiz',
    create: 'Termin speichern',
    save: 'Änderungen speichern',
    remove: 'Termin löschen',
  },
  todo: {
    quick: 'Neues To-do',
    add: 'Hinzufügen',
    title: 'Was ist zu tun?',
    due: 'Fällig am (optional)',
    notes: 'Notiz',
    done: 'Erledigt',
    important: 'Wichtig',
    save: 'Änderungen speichern',
    remove: 'To-do löschen',
  },
  goal: { title: 'Name des Ziels', target: 'Ziel…', due: 'Bis wann? (optional)', save: 'Ziel speichern' },
  expense: { title: 'Wofür?', amount: 'Betrag…', date: 'Datum', save: 'Ausgabe speichern' },
  post: { title: 'Idee / Thema', script: 'Skript / Ablauf', planned: 'Geplant für', save: 'Idee speichern' },
} as const;

/** Betrag so, wie man ihn eintippt: 1250 bzw. 1250,50 */
export function euroText(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

const go = (href: string, mode?: 'push' | 'replace'): GuideStep => (mode ? { do: 'go', href, mode } : { do: 'go', href });
const show = (at?: GuideSpot, say?: string): GuideStep => ({ do: 'show', ...(at ? { at } : {}), ...(say ? { say } : {}) });
const type = (field: string, text: string | null | undefined): GuideStep[] =>
  text?.trim() ? [{ do: 'type', field, text: text.trim() }] : [];
const date = (field: string, value: string | null, withTime: boolean): GuideStep => ({ do: 'date', field, value, withTime });
const press = (button: string): GuideStep => ({ do: 'press', button });

type Of<K extends Proposal['kind']> = Extract<Proposal, { kind: K }>;

/**
 * Zum Auftrag – so, wie man es selbst klicken würde: erst zum Kunden
 * (dort leuchtet der Auftrag in der Liste), dann in den Auftrag.
 */
export function toOrder(o: GuideOrder): GuideStep[] {
  const steps: GuideStep[] = [];
  if (o.customer) {
    steps.push(
      go(`/kunden/${o.customer.id}`),
      show({ target: `guide.order.${o.id}` }, `Ich gehe zu ${o.customer.name} in den Auftrag „${o.title}“.`),
    );
  }
  steps.push(go(`/auftraege/${o.id}`));
  return steps;
}

// ——— Neuer Kunde ———

export function customerSteps(p: Of<'customer'>): GuideStep[] {
  const L = LABELS.customer;
  const d = p.data;
  return [
    go('/kunden/neu', 'push'),
    show({ field: L.name }, `Ich lege ${d.name} als neuen Kunden an.`),
    ...type(L.name, d.name),
    ...type(L.company, d.company),
    ...type(L.phone, d.phone),
    ...type(L.email, d.email),
    ...type(L.address, d.address),
    ...type(L.notes, d.notes),
    press(L.save),
  ];
}

export function customerDone(id: string): GuideStep[] {
  return [go(`/kunden/${id}`, 'replace'), show({ target: 'guide.customer' })];
}

// ——— Neuer Auftrag ———

export function orderSteps(p: Of<'order'>, customer: Named | null): GuideStep[] {
  const L = LABELS.newOrder;
  const d = p.data;
  const steps: GuideStep[] = customer
    ? [
        go(`/kunden/${customer.id}`),
        show({ button: LABELS.customer.newOrder }, `Bei ${customer.name} lege ich den Auftrag „${d.title}“ an.`),
        press(LABELS.customer.newOrder),
        go(`/auftraege/neu?customer=${customer.id}`, 'push'),
        show({ field: L.title }),
      ]
    : [go('/auftraege/neu', 'push'), show({ field: L.title }, `Ich lege den Auftrag „${d.title}“ an.`)];
  steps.push(
    ...type(L.title, d.title),
    ...type(L.description, d.description),
    ...(d.price !== null ? type(L.price, euroText(d.price)) : []),
    press(L.save),
  );
  return steps;
}

export function orderDone(id: string): GuideStep[] {
  return [go(`/auftraege/${id}`, 'replace'), show({ target: 'guide.order' })];
}

/** Termine eines neuen Auftrags: im Auftrag eintragen und speichern */
export function orderDatesSteps(dates: { meeting_at: string | null; execution_at: string | null }): GuideStep[] {
  const L = LABELS.order;
  const steps: GuideStep[] = [];
  if (dates.meeting_at) {
    steps.push(
      show({ target: 'guide.order.meeting' }, `Jetzt trage ich das Erstgespräch ein: ${whenLabel(dates.meeting_at)}.`),
      date(L.meeting, dates.meeting_at, true),
    );
  }
  if (dates.execution_at) {
    steps.push(
      show({ target: 'guide.order.execution' }, `Die Ausführung: ${whenLabel(dates.execution_at)}.`),
      date(L.execution, dates.execution_at, true),
    );
  }
  if (steps.length) steps.push(press(L.save));
  return steps;
}

// ——— Termin im Auftrag ———

export function orderDateSteps(p: Of<'order_date'>, order: GuideOrder): GuideStep[] {
  const L = LABELS.order;
  const meeting = p.data.field === 'meeting';
  return [
    ...toOrder(order),
    show(
      { target: meeting ? 'guide.order.meeting' : 'guide.order.execution' },
      `Hier trage ich ${meeting ? 'das Erstgespräch' : 'die Ausführung'} ein: ${whenLabel(p.data.at)}.`,
    ),
    date(meeting ? L.meeting : L.execution, p.data.at, true),
    press(L.save),
  ];
}

export function orderSpotDone(target: string): GuideStep[] {
  return [show({ target })];
}

// ——— Preis im Auftrag ———

export function orderPriceSteps(p: Of<'order_price'>, order: GuideOrder): GuideStep[] {
  const L = LABELS.order;
  return [
    ...toOrder(order),
    show({ target: 'guide.order.price' }, `Ich ändere den Preis auf ${formatEuro(p.data.price)}.`),
    { do: 'type', field: L.price, text: euroText(p.data.price) },
    press(L.save),
  ];
}

// ——— Angebot/Rechnung, bezahlt, PDF ———

export function documentSteps(p: Of<'document'>, order: GuideOrder): GuideStep[] {
  const invoice = p.data.docKind === 'invoice';
  const button = invoice ? LABELS.order.invoice : LABELS.order.offer;
  return [
    ...toOrder(order),
    show({ button }, `Ich schreibe jetzt ${invoice ? 'die Rechnung' : 'das Angebot'}.`),
    press(button),
  ];
}

/** Etwas bei den Dokumenten eines Auftrags (bezahlt markieren, PDF) – ohne Auftrag: Finanzen */
export function documentsSteps(order: GuideOrder | null, say: string): GuideStep[] {
  return order
    ? [...toOrder(order), show({ target: 'auftrag.dokumente' }, say)]
    : [go('/finanzen'), show(undefined, say)];
}

export function documentsDone(order: GuideOrder | null): GuideStep[] {
  return order ? [show({ target: 'auftrag.dokumente' })] : [];
}

// ——— Eigener Termin ———

export function appointmentSteps(p: Of<'appointment'>): GuideStep[] {
  const L = LABELS.appointment;
  const d = p.data;
  return [
    go('/termine/neu', 'push'),
    show({ field: L.title }, `Ich trage den Termin „${d.title}“ ein – ${whenLabel(d.starts_at, d.all_day)}.`),
    ...type(L.title, d.title),
    ...(d.all_day ? [] : [date(L.start, d.starts_at, true)]),
    ...type(L.location, d.location),
    ...type(L.notes, d.notes),
    press(L.create),
  ];
}

export function appointmentDone(id: string): GuideStep[] {
  return [go(`/termine/${id}`, 'replace'), show({ target: 'guide.appointment' })];
}

/** Was eine Terminänderung ist (für Nexys Satz) */
export function changeWhat(ev: KnownEvent): string {
  const kind = ev.kind === 'meeting' ? 'Erstgespräch' : ev.kind === 'execution' ? 'Ausführung' : 'Termin';
  return `${kind} „${ev.title}“`;
}

export function appointmentChangeSteps(p: Of<'appointment_change'>, order: GuideOrder | null): GuideStep[] {
  const ev = p.event;
  const c = p.data;
  const what = changeWhat(ev);
  const say = c.remove
    ? `Ich ${ev.kind === 'appointment' ? 'lösche' : 'sage'} ${what}${ev.kind === 'appointment' ? '' : ' ab'}.`
    : c.starts_at
      ? `Ich verschiebe ${what} auf ${whenLabel(c.starts_at, c.all_day ?? ev.allDay)}.`
      : c.done !== null
        ? `Ich hake ${what} ${c.done ? 'ab' : 'wieder auf offen'}.`
        : `Ich ändere ${what}.`;

  if (ev.kind === 'appointment' && ev.appointmentId) {
    const L = LABELS.appointment;
    if (c.remove) return [go(`/termine/${ev.appointmentId}`), show({ button: L.remove }, say), press(L.remove)];
    const allDay = c.all_day ?? ev.allDay;
    return [
      go(`/termine/${ev.appointmentId}`),
      show({ target: 'guide.appointment' }, say),
      ...type(L.title, c.title),
      ...(c.starts_at ? [date(allDay ? L.day : L.start, allDay ? c.starts_at.slice(0, 10) : c.starts_at, !allDay)] : []),
      ...type(L.location, c.location),
      ...type(L.notes, c.notes),
      press(L.save),
    ];
  }
  if (order) {
    const L = LABELS.order;
    const meeting = ev.kind === 'meeting';
    const field = meeting ? L.meeting : L.execution;
    const target = meeting ? 'guide.order.meeting' : 'guide.order.execution';
    return [
      ...toOrder(order),
      show({ target }, say),
      ...(c.remove ? [date(field, null, true)] : c.starts_at ? [date(field, c.starts_at, true)] : []),
      press(L.save),
    ];
  }
  return [];
}

export function appointmentChangeDone(p: Of<'appointment_change'>, order: GuideOrder | null): GuideStep[] {
  const ev = p.event;
  if (ev.kind === 'appointment') return p.data.remove ? [go('/termine')] : [show({ target: 'guide.appointment' })];
  return order ? [show({ target: ev.kind === 'meeting' ? 'guide.order.meeting' : 'guide.order.execution' })] : [];
}

// ——— To-dos ———

export function todoSteps(p: Of<'todo'>): GuideStep[] {
  const L = LABELS.todo;
  return [
    go('/aufgaben'),
    show({ field: L.quick }, `Ich schreibe das To-do „${p.data.title}“ auf.`),
    ...type(L.quick, p.data.title),
    press(L.add),
  ];
}

export function todoDone(id: string): GuideStep[] {
  // Schnelleingabe wieder leeren (gespeichert hat Nexy selbst)
  return [{ do: 'type', field: LABELS.todo.quick, text: '' }, go(`/aufgaben/${id}`), show({ target: 'guide.todo' })];
}

export function todoChangeSteps(p: Of<'todo_change'>): GuideStep[] {
  const L = LABELS.todo;
  const c = p.data;
  const title = `„${p.todo.title}“`;
  if (c.remove) {
    return [go(`/aufgaben/${p.todo.id}`), show({ button: L.remove }, `Ich lösche das To-do ${title}.`), press(L.remove)];
  }
  const say =
    c.done !== null
      ? `Ich hake das To-do ${title} ${c.done ? 'ab' : 'wieder auf offen'}.`
      : `Ich ändere das To-do ${title}.`;
  return [
    go(`/aufgaben/${p.todo.id}`),
    show({ target: 'guide.todo' }, say),
    ...type(L.title, c.title),
    ...(c.due_on !== null ? [date(L.due, c.due_on || null, false)] : []),
    ...type(L.notes, c.notes),
    ...(c.important !== null ? [show({ button: L.important })] : []),
    ...(c.done !== null ? [show({ button: L.done })] : []),
    press(L.save),
  ];
}

export function todoChangeDone(p: Of<'todo_change'>): GuideStep[] {
  return p.data.remove ? [go('/aufgaben')] : [show({ target: 'guide.todo' })];
}

// ——— Ziel, Ausgabe, Post ———

export function goalSteps(p: Of<'goal'>): GuideStep[] {
  const L = LABELS.goal;
  const d = p.data;
  return [
    go(`/aufgaben/ziele/neu?art=${d.kind}&zeitraum=${d.period}`, 'push'),
    show({ field: L.target }, `Ich setze dir das Ziel: ${goalLabel(d)}.`),
    ...(d.kind === 'custom' ? type(L.title, d.title) : []),
    { do: 'type', field: L.target, text: d.kind === 'revenue' ? euroText(d.target) : String(d.target) },
    ...(d.due_on ? [date(L.due, d.due_on, false)] : []),
    press(L.save),
  ];
}

export function goalDone(id: string): GuideStep[] {
  return [go(`/aufgaben/ziele/${id}`, 'replace'), show({ target: 'guide.goal' })];
}

export function expenseSteps(p: Of<'expense'>): GuideStep[] {
  const L = LABELS.expense;
  const d = p.data;
  return [
    go('/finanzen/ausgabe/neu', 'push'),
    show({ field: L.title }, `Ich trage die Ausgabe „${d.title}“ ein – ${formatEuro(d.amount)}.`),
    ...type(L.title, d.title),
    { do: 'type', field: L.amount, text: euroText(d.amount) },
    date(L.date, d.spent_on, false),
    press(L.save),
  ];
}

export function expenseDone(id: string): GuideStep[] {
  return [go(`/finanzen/ausgabe/${id}`, 'replace'), show({ target: 'guide.expense' })];
}

export function postSteps(p: Of<'post'>): GuideStep[] {
  const L = LABELS.post;
  const d = p.data;
  return [
    go('/social/neu', 'push'),
    show({ field: L.title }, `Ich notiere die Post-Idee „${d.title}“.`),
    ...type(L.title, d.title),
    ...type(L.script, d.script),
    ...(d.planned_for ? [date(L.planned, d.planned_for, true)] : []),
    press(L.save),
  ];
}

export function postDone(id: string): GuideStep[] {
  return [go(`/social/${id}`, 'replace'), show({ target: 'guide.post' })];
}

export function incomeProofSteps(): GuideStep[] {
  return [go('/finanzen'), show(undefined, 'Ich erstelle deinen Einkommensnachweis.')];
}

/** Wie lange Nexy pro Buchstabe braucht: kurze Wörter gemütlich, lange Texte zügig (insgesamt ≤ ~1,6 s) */
export function typingDelay(length: number): number {
  if (length <= 0) return 0;
  return Math.max(10, Math.min(55, Math.round(1600 / length)));
}

/** Tippen: die Zwischenstände Buchstabe für Buchstabe (bei langen Texten in Stücken) */
export function typingFrames(text: string, maxFrames = 60): string[] {
  const chars = [...text];
  if (!chars.length) return [''];
  const step = Math.max(1, Math.ceil(chars.length / maxFrames));
  const frames: string[] = [];
  for (let i = step; i < chars.length; i += step) frames.push(chars.slice(0, i).join(''));
  frames.push(text);
  return frames;
}

// ——— Wo Nexy steht ———

export type NexySpot = {
  /** Nexy (linke obere Ecke) */
  x: number;
  y: number;
  /** Sprechblase; `align`: Blase rückt an Nexy heran (end = rechts bündig) */
  bubble: { left: number; top: number; width: number; align: 'start' | 'end' };
};

/**
 * Wo Nexy steht: rechts neben der Stelle, sonst links davon, bei breiten
 * Stellen unten rechts auf der Kante. Ohne Stelle: unten rechts in der Ecke.
 * Die Sprechblase kommt auf die freie Seite (nicht auf die Stelle).
 */
export function placeNexy(
  rect: Rect | null,
  size: number,
  view: Size,
  bubble: Size,
  { margin = 16, gap = 12 } = {},
): NexySpot {
  const clampX = (v: number, w: number) => Math.max(margin, Math.min(v, view.width - w - margin));
  const clampY = (v: number, h: number) => Math.max(margin, Math.min(v, view.height - h - margin));
  const width = Math.max(0, Math.min(bubble.width, view.width - 2 * margin));

  let side: 'corner' | 'right' | 'left' | 'perch';
  let x: number;
  let y: number;
  if (!rect) {
    side = 'corner';
    x = view.width - size - 2 * margin;
    y = view.height - size - 2 * margin;
  } else if (rect.x + rect.width + gap + size <= view.width - margin) {
    side = 'right';
    x = rect.x + rect.width + gap;
    y = rect.y + Math.min(rect.height, 96) / 2 - size / 2;
  } else if (rect.x - gap - size >= margin) {
    side = 'left';
    x = rect.x - gap - size;
    y = rect.y + Math.min(rect.height, 96) / 2 - size / 2;
  } else {
    side = 'perch';
    x = rect.x + rect.width - size - gap;
    y = rect.y + rect.height - size * 0.4;
  }
  x = clampX(x, size);
  y = clampY(y, size);

  const middle = clampY(y + size / 2 - bubble.height / 2, bubble.height);
  let place: { left: number; top: number; align: 'start' | 'end' };
  if (side === 'right' && x + size + gap + width <= view.width - margin) {
    place = { left: x + size + gap, top: middle, align: 'start' };
  } else if ((side === 'left' || side === 'corner') && x - gap - width >= margin) {
    place = { left: x - gap - width, top: middle, align: 'end' };
  } else {
    const left = clampX(x + size - width, width);
    const below = y + size + gap;
    place =
      below + bubble.height <= view.height - margin
        ? { left, top: below, align: 'end' }
        : { left, top: clampY(y - gap - bubble.height, bubble.height), align: 'end' };
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    bubble: { left: Math.round(place.left), top: Math.round(place.top), width, align: place.align },
  };
}
