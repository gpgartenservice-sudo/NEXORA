/**
 * Luna macht es vor – reine Logik (ohne App, mit Unit-Tests): Bevor Luna etwas
 * speichert, geht sie in der App dorthin, wo man es selbst eintragen würde,
 * tippt die Werte sichtbar in die echten Felder und drückt auf Speichern.
 * Hier steht, welche Schritte das für jede Aktion sind und wo Luna neben
 * der gerade gezeigten Stelle steht.
 *
 * Felder und Knöpfe werden über ihre Beschriftung gefunden (wie ein Mensch
 * sie liest). Die Beschriftungen stehen gesammelt in LABELS – ein Test prüft,
 * dass es sie in den Formularen wirklich gibt.
 */
import type { Rect, Size } from '../tutorial/tutorial-logic';
import { formatEuro } from '../crm/order-logic';
import { categoryLabel } from '../finance/finance-logic';
import { PERIOD_LABEL } from '../goals/goals-logic';
import { FORMATS, PLATFORMS, stepsFor } from '../social/social-logic';

import {
  COMPANY_TEXT_FIELDS,
  goalLabel,
  whenLabel,
  type CompanyTextField,
  type KnownEvent,
  type Proposal,
} from './assistant-logic';

/**
 * Wo Luna hinzeigt: eine markierte Stelle (TourTarget), ein Eingabefeld oder
 * ein Knopf (über die Beschriftung; endet sie auf „…“, reicht der Anfang).
 */
export type GuideSpot = { target: string } | { field: string } | { button: string };

export type GuideStep =
  /** Seite öffnen (push = neue Seite obendrauf, replace = statt der aktuellen) */
  | { do: 'go'; href: string; mode?: 'push' | 'replace' }
  /** Luna geht zur Stelle, die leuchtet; mit `say` sagt sie etwas dazu */
  | { do: 'show'; at?: GuideSpot; say?: string }
  /** Buchstabe für Buchstabe ins Feld tippen ('' = Feld leeren) */
  | { do: 'type'; field: string; text: string }
  /** Datum (JJJJ-MM-TT) bzw. Zeitpunkt (ISO) ins Datumsfeld setzen */
  | { do: 'date'; field: string; value: string | null; withTime: boolean }
  /** Luna drückt auf den Knopf (gespeichert wird danach von Luna selbst) */
  | { do: 'press'; button: string }
  /**
   * Luna klickt wirklich: Schalter bzw. Auswahl im Formular (damit es danach
   * zeigt, was gespeichert wurde). on: Schalter nur umlegen, wenn er anders steht.
   */
  | { do: 'pick'; button: string; on?: boolean };

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
    update: 'Änderungen speichern',
    newOrder: '+ Neuer Auftrag',
    remove: 'Kunde löschen',
  },
  newOrder: { title: 'Leistung', description: 'Beschreibung', price: 'Preis in €', save: 'Auftrag anlegen' },
  order: {
    meeting: 'Termin (z. B. Erstgespräch, Besichtigung)',
    execution: 'Ausführung',
    price: 'Preis…',
    save: 'Änderungen speichern',
    offer: '+ Angebot',
    invoice: '+ Rechnung',
    remove: 'Auftrag löschen',
    title: 'Leistung',
    description: 'Beschreibung',
    discount: 'Rabatt in %',
    contractStart: 'Start',
    contractEnd: 'Ende',
    meetingDone: 'Termin erledigt',
    offerSent: 'Angebot verschickt',
    offerAccepted: 'Angebot angenommen',
    completed: 'Abgeschlossen',
    cancelled: 'Storniert',
    expenses: 'Ausgaben in €…',
    notes: 'Interne Notizen',
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
  goal: {
    title: 'Name des Ziels',
    target: 'Ziel…',
    due: 'Bis wann? (optional)',
    save: 'Ziel speichern',
    progress: 'Schon erreicht',
    archived: 'Archiviert (nicht mehr anzeigen)',
    update: 'Änderungen speichern',
    remove: 'Ziel löschen',
  },
  expense: {
    title: 'Wofür?',
    amount: 'Betrag…',
    date: 'Datum',
    save: 'Ausgabe speichern',
    firstPayment: 'Erste Zahlung',
    lastPayment: 'Letzte Zahlung',
    once: 'Einmalig',
    monthly: 'Monatlich',
    yearly: 'Jährlich',
    notes: 'Notiz',
    update: 'Änderungen speichern',
    remove: 'Ausgabe löschen',
  },
  post: {
    title: 'Idee / Thema',
    script: 'Skript / Ablauf',
    planned: 'Geplant für',
    save: 'Idee speichern',
    notes: 'Notizen',
    caption: 'Caption',
    hashtags: 'Hashtags',
    published: 'Veröffentlicht',
    publishedAt: 'Veröffentlicht am',
    url: 'Link zum Post',
    views: 'Aufrufe',
    likes: 'Likes',
    comments: 'Kommentare',
    shares: 'Geteilt',
    saves: 'Gespeichert',
    update: 'Änderungen speichern',
    remove: 'Post löschen',
  },
  company: {
    company_name: 'Firmenname',
    owner_name: 'Inhaber/in',
    street: 'Straße und Hausnummer',
    zip: 'PLZ',
    city: 'Ort',
    phone: 'Telefon',
    email: 'E-Mail',
    website: 'Website',
    tax_number: 'Steuernummer',
    vat_id: 'USt-IdNr.',
    bank_name: 'Bank',
    iban: 'IBAN',
    bic: 'BIC',
    review_url: 'Link für Bewertungen',
    paymentDays: 'Zahlungsziel (Tage)',
    validity: 'Angebote gültig (Tage)',
    smallBusiness: 'Kleinunternehmerregelung (§ 19 UStG)',
    vat19: '19 %',
    vat7: '7 % (ermäßigt)',
    save: 'Firmendaten speichern',
  },
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
const pick = (button: string, on?: boolean): GuideStep =>
  on === undefined ? { do: 'pick', button } : { do: 'pick', button, on };
/** Text ändern: null = nichts tun, '' = Feld leeren */
const retype = (field: string, text: string | null): GuideStep[] => (text === null ? [] : [{ do: 'type', field, text }]);
/** Schalter auf den neuen Stand bringen (null = bleibt) */
const flip = (button: string, on: boolean | null): GuideStep[] => (on === null ? [] : [pick(button, on)]);

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

// ——— Kunde löschen ———

export function customerDeleteSteps(p: Of<'customer_delete'>): GuideStep[] {
  const L = LABELS.customer;
  return [
    go(`/kunden/${p.data.customerId}`),
    show({ target: 'guide.customer' }, `Ich lösche den Kunden ${p.data.name}.`),
    show({ button: L.remove }),
    press(L.remove),
  ];
}

export function customerDeleteDone(): GuideStep[] {
  return [go('/kunden')];
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

// ——— Auftrag löschen ———

export function orderDeleteSteps(order: GuideOrder): GuideStep[] {
  const L = LABELS.order;
  return [...toOrder(order), show({ button: L.remove }, `Ich lösche den Auftrag „${order.title}“.`), press(L.remove)];
}

/** danach zurück zum Kunden (wie in der App) */
export function orderDeleteDone(customerId: string | null): GuideStep[] {
  return customerId ? [go(`/kunden/${customerId}`), show({ target: 'guide.customer' })] : [go('/auftraege')];
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

/** Was eine Terminänderung ist (für Lunas Satz) */
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
  // Schnelleingabe wieder leeren (gespeichert hat Luna selbst)
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

// ——— Vorhandenes ändern und löschen ———

export function customerChangeSteps(p: Of<'customer_change'>): GuideStep[] {
  const L = LABELS.customer;
  const c = p.data;
  const fields: [string, string | null][] = [
    [L.name, c.name],
    [L.company, c.company],
    [L.phone, c.phone],
    [L.email, c.email],
    [L.address, c.address],
    [L.notes, c.notes],
  ];
  const first = fields.find(([, v]) => v !== null)?.[0] ?? L.name;
  return [
    go(`/kunden/${p.customer.id}`),
    show({ field: first }, `Ich ändere die Kundendaten von ${p.customer.name}.`),
    ...fields.flatMap(([field, v]) => retype(field, v)),
    press(L.update),
  ];
}

export function customerChangeDone(): GuideStep[] {
  return [show({ target: 'guide.customer' })];
}

export function orderChangeSteps(p: Of<'order_change'>, order: GuideOrder): GuideStep[] {
  const L = LABELS.order;
  const c = p.data;
  const say =
    c.cancelled === true
      ? `Ich storniere den Auftrag „${order.title}“.`
      : c.completed === true
        ? `Ich schließe den Auftrag „${order.title}“ ab.`
        : c.cancelled === false
          ? `Ich nehme den Auftrag „${order.title}“ wieder auf.`
          : `Ich ändere den Auftrag „${order.title}“.`;
  return [
    ...toOrder(order),
    show({ target: 'guide.order' }, say),
    ...flip(L.meetingDone, c.meeting_done),
    ...flip(L.offerSent, c.offer_sent),
    ...flip(L.offerAccepted, c.offer_accepted),
    ...flip(L.completed, c.completed),
    ...flip(L.cancelled, c.cancelled),
    ...(c.discount_percent !== null ? retype(L.discount, euroText(c.discount_percent)) : []),
    ...(c.contract_start !== null ? [date(L.contractStart, c.contract_start || null, false)] : []),
    ...(c.contract_end !== null ? [date(L.contractEnd, c.contract_end || null, false)] : []),
    ...retype(L.title, c.title),
    ...retype(L.description, c.description),
    ...(c.expenses !== null ? retype(L.expenses, euroText(c.expenses)) : []),
    ...retype(L.notes, c.internal_notes),
    press(L.save),
  ];
}

export function orderChangeDone(): GuideStep[] {
  return [show({ target: 'guide.order' })];
}

const REPEAT_OPTION = { once: LABELS.expense.once, monthly: LABELS.expense.monthly, yearly: LABELS.expense.yearly };

export function expenseChangeSteps(p: Of<'expense_change'>): GuideStep[] {
  const L = LABELS.expense;
  const e = p.expense;
  const c = p.data;
  const href = `/finanzen/ausgabe/${e.id}`;
  if (c.remove) return [go(href), show({ button: L.remove }, `Ich lösche die Ausgabe „${e.title}“.`), press(L.remove)];
  const repeat = c.repeat ?? e.repeat;
  return [
    go(href),
    show({ target: 'guide.expense' }, `Ich ändere die Ausgabe „${e.title}“.`),
    ...retype(L.title, c.title),
    ...(c.amount !== null ? retype(L.amount, euroText(c.amount)) : []),
    ...(c.repeat ? [pick(REPEAT_OPTION[c.repeat])] : []),
    ...(c.spent_on ? [date(repeat === 'once' ? L.date : L.firstPayment, c.spent_on, false)] : []),
    ...(c.ends_on !== null && repeat !== 'once' ? [date(L.lastPayment, c.ends_on || null, false)] : []),
    ...(c.category ? [pick(categoryLabel(c.category))] : []),
    ...retype(L.notes, c.notes),
    press(L.update),
  ];
}

export function expenseChangeDone(p: Of<'expense_change'>): GuideStep[] {
  return p.data.remove ? [go('/finanzen')] : [show({ target: 'guide.expense' })];
}

export function postChangeSteps(p: Of<'post_change'>): GuideStep[] {
  const L = LABELS.post;
  const post = p.post;
  const c = p.data;
  const href = `/social/${post.id}`;
  if (c.remove) return [go(href), show({ button: L.remove }, `Ich lösche den Post „${post.title}“.`), press(L.remove)];
  const format = c.format ?? post.format;
  const formatLabel = c.format ? FORMATS.find((f) => f.key === c.format)?.label : undefined;
  const platforms = c.platforms
    ? PLATFORMS.filter((x) => c.platforms!.includes(x.key) !== post.platforms.includes(x.key)).map((x) =>
        pick(x.label, c.platforms!.includes(x.key)),
      )
    : [];
  const metrics = (['views', 'likes', 'comments', 'shares', 'saves'] as const).flatMap((m) =>
    c.metrics[m] !== undefined ? retype(L[m], String(c.metrics[m])) : [],
  );
  return [
    go(href),
    show({ target: 'guide.post' }, `Ich ändere den Post „${post.title}“.`),
    ...retype(L.title, c.title),
    ...(formatLabel ? [pick(formatLabel)] : []),
    ...platforms,
    ...(c.steps ? stepsFor(format).map((s) => pick(s.label, c.steps === 'ready')) : []),
    ...retype(format === 'video' ? L.script : L.notes, c.script),
    ...retype(L.caption, c.caption),
    ...retype(L.hashtags, c.hashtags),
    ...(c.planned_for !== null ? [date(L.planned, c.planned_for || null, true)] : []),
    ...flip(L.published, c.published),
    ...(c.published_at ? [date(L.publishedAt, c.published_at, true)] : []),
    ...retype(L.url, c.url),
    ...metrics,
    press(L.update),
  ];
}

export function postChangeDone(p: Of<'post_change'>): GuideStep[] {
  return p.data.remove ? [go('/social')] : [show({ target: 'guide.post' })];
}

export function goalChangeSteps(p: Of<'goal_change'>): GuideStep[] {
  const L = LABELS.goal;
  const g = p.goal;
  const c = p.data;
  const name = g.title ?? goalLabel(g);
  const href = `/aufgaben/ziele/${g.id}`;
  if (c.remove) return [go(href), show({ button: L.remove }, `Ich lösche das Ziel „${name}“.`), press(L.remove)];
  const amount = (n: number) => (g.kind === 'revenue' ? euroText(n) : String(n));
  return [
    go(href),
    show(
      { target: 'guide.goal' },
      c.archived === true ? `Ich archiviere das Ziel „${name}“.` : `Ich ändere das Ziel „${name}“.`,
    ),
    ...retype(L.title, c.title),
    ...(c.target !== null ? retype(L.target, amount(c.target)) : []),
    ...(c.period && c.period !== 'once' ? [pick(PERIOD_LABEL[c.period])] : []),
    ...(c.progress !== null ? retype(L.progress, String(c.progress)) : []),
    ...(c.due_on !== null ? [date(L.due, c.due_on || null, false)] : []),
    ...flip(L.archived, c.archived),
    press(L.update),
  ];
}

export function goalChangeDone(p: Of<'goal_change'>): GuideStep[] {
  return p.data.remove || p.data.archived ? [go('/aufgaben?ansicht=ziele')] : [show({ target: 'guide.goal' })];
}

export function companyChangeSteps(p: Of<'company_change'>): GuideStep[] {
  const L = LABELS.company;
  const c = p.data;
  const text = (COMPANY_TEXT_FIELDS as readonly CompanyTextField[]).filter((k) => k in c);
  return [
    go('/firma'),
    show(text.length ? { field: L[text[0]] } : { button: L.save }, 'Ich ändere deine Firmendaten.'),
    ...text.flatMap((k) => retype(L[k], c[k] ?? '')),
    ...flip(L.smallBusiness, c.small_business ?? null),
    ...(c.vat_rate ? [pick(c.vat_rate === 7 ? L.vat7 : L.vat19)] : []),
    ...(c.payment_days !== undefined ? retype(L.paymentDays, String(c.payment_days)) : []),
    ...(c.offer_validity_days !== undefined ? retype(L.validity, String(c.offer_validity_days)) : []),
    press(L.save),
  ];
}

export function companyChangeDone(): GuideStep[] {
  return [show({ button: LABELS.company.save })];
}

/** Seite öffnen – dort bleibt man danach */
export function openSteps(p: Of<'open'>): GuideStep[] {
  return [show(undefined, `Ich öffne ${p.data.label}.`), go(p.data.href)];
}

export function incomeProofSteps(): GuideStep[] {
  return [go('/finanzen'), show(undefined, 'Ich erstelle deinen Einkommensnachweis.')];
}

/** Wie lange Luna pro Buchstabe braucht: kurze Wörter gemütlich, lange Texte zügig (insgesamt ≤ ~1,6 s) */
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

// ——— Wo Luna steht ———

export type NexySpot = {
  /** Luna (linke obere Ecke) */
  x: number;
  y: number;
  /** Sprechblase; `align`: Blase rückt an Luna heran (end = rechts bündig) */
  bubble: { left: number; top: number; width: number; align: 'start' | 'end' };
};

/**
 * Wo Luna steht: rechts neben der Stelle, sonst links davon, bei breiten
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
