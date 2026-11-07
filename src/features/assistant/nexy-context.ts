/**
 * Was Nexy über das Business des Nutzers weiß: eine kompakte Übersicht,
 * die mit jeder Nachricht mitgeschickt wird. Bewusst sparsam – keine
 * Telefonnummern, E-Mails oder Anschriften von Kunden.
 */
import { localStamp } from '../appointments/appointment-logic';
import { computeStatus, STATUS_LABEL } from '../crm/order-logic';
import { missingSellerFields, sellerName, type DocumentData, type Seller } from '../documents/document-logic';
import {
  addMonths,
  categoryLabel,
  fixedCostsPerMonth,
  monthKey,
  monthRange,
  summarize,
  sumUp,
  type ExpenseFacts,
  type OrderMoney,
} from '../finance/finance-logic';
import {
  computePostStatus,
  dayKey,
  FORMATS,
  startOfWeek,
  statusLabel,
  type PostFacts,
} from '../social/social-logic';
import {
  DEFAULT_RESERVE_PERCENT,
  SMALL_BUSINESS_LIMIT,
  smallBusinessCheck,
  taxReserve,
  vatSummary,
  yearTotals,
} from '../finance/tax-logic';

type CustomerLike = { id: string; name: string; company: string | null };
type OrderLike = OrderMoney & {
  id: string;
  title: string;
  customer_id: string;
  price: number | null;
  billing: 'once' | 'monthly';
  updated_at: string;
};
type DocLike = {
  id: string;
  order_id: string | null;
  kind: 'offer' | 'invoice';
  number: string;
  issued_on: string;
  due_on: string | null;
  total: number;
  paid_at: string | null;
  data: DocumentData;
};
type PostLike = PostFacts & {
  title: string;
  planned_for: string | null;
  published_at: string | null;
  views: number | null;
};

type AccountLike = {
  platform: string;
  username: string | null;
  followers: number | null;
  likes: number | null;
  media_count: number | null;
  /** Follower-Zuwachs der letzten 7 Tage (falls bekannt) */
  growth7?: number | null;
};

export type ContextInput = {
  seller: Seller;
  customers: CustomerLike[];
  orders: OrderLike[];
  documents: DocLike[];
  expenses: (ExpenseFacts & { vat_amount?: number | null })[];
  posts: PostLike[];
  /** verbundene TikTok-/Instagram-Konten */
  accounts?: AccountLike[];
  /** Termine (schon kurz aufbereitet, mit Kurzzeichen T1, T2 … zum Ändern) */
  upcoming?: Record<string, unknown>[];
  /** verschickte Zahlungserinnerungen/Mahnungen */
  followups?: { document_id: string; kind: string; sent_on: string; new_due_on: string | null }[];
  /** offene To-dos (kurz, mit Kurzzeichen A1, A2 … zum Ändern) und ihre Gesamtzahl */
  todos?: { entries: Record<string, unknown>[]; open: number };
  /** aktive Ziele mit Stand (mit Kurzzeichen Z1, Z2 … zum Ändern) */
  goals?: Record<string, unknown>[];
  /** Ausgaben (mit Kurzzeichen E1 …) und Posts (P1 …) zum Ändern/Löschen – siehe nexyExpenses/nexyPosts */
  expenseList?: Record<string, unknown>[];
  postList?: Record<string, unknown>[];
  /** Steuer-Topf: % vom Gewinn (Firmendaten) */
  taxPercent?: number;
  today?: Date;
};

const MAX_CHARS = 26000;

export function buildNexyContext({
  seller,
  customers,
  orders,
  documents,
  expenses,
  posts,
  accounts = [],
  upcoming = [],
  followups = [],
  todos = { entries: [], open: 0 },
  goals = [],
  expenseList = [],
  postList = [],
  taxPercent = DEFAULT_RESERVE_PERCENT,
  today = new Date(),
}: ContextInput) {
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const todayKey = dayKey(today);
  const thisMonth = monthKey(today);
  const lastMonth = addMonths(thisMonth, -1);
  const year = thisMonth.slice(0, 4);
  const money = (months: string[]) => sumUp(summarize(orders, expenses, months, today));
  const missing = missingSellerFields(seller, 'invoice');

  /** grobe Steuer-Orientierung (wie Seite Finanzen → Steuern) */
  const steuern = () => {
    const y = today.getFullYear();
    const totals = yearTotals(orders, expenses, y, today);
    const vat = vatSummary(documents, expenses, y, today);
    const reserve = taxReserve({
      profit: totals.profit,
      percent: taxPercent,
      smallBusiness: seller.small_business,
      vatPayable: vat.payable,
    });
    const limit = smallBusinessCheck(totals.income, yearTotals(orders, expenses, y - 1, today).income, y);
    return {
      hinweis:
        'grobe Schätzung zur Orientierung, keine Steuerberatung; Details und Export für die Steuerberatung unter Finanzen → Steuern',
      kleinunternehmer: seller.small_business,
      ruecklage_prozent_vom_gewinn: reserve.percent,
      ruecklage_empfohlen_dieses_jahr: reserve.total,
      ...(seller.small_business
        ? {
            umsatz_dieses_jahr: totals.income,
            kleinunternehmer_grenze: SMALL_BUSINESS_LIMIT,
            grenze_stand: limit.message,
          }
        : {
            umsatzsteuer_ausgewiesen: vat.collected,
            vorsteuer_erfasst: vat.input,
            umsatzsteuer_zahllast_geschaetzt: vat.payable,
          }),
    };
  };

  const monday = startOfWeek(today);
  const weekEnd = dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
  const weekStart = dayKey(monday);
  const statusCount = (s: string) => posts.filter((p) => computePostStatus(p) === s).length;

  const STUFE: Record<string, string> = {
    reminder: 'Zahlungserinnerung',
    dunning1: '1. Mahnung',
    dunning2: 'Letzte Mahnung',
  };
  /** letzte verschickte Erinnerung/Mahnung einer Rechnung */
  const mahnstand = (id: string) => {
    const last = followups
      .filter((f) => f.document_id === id && f.kind !== 'review')
      .sort((a, b) => a.sent_on.localeCompare(b.sent_on))
      .pop();
    return last
      ? { mahnstufe: STUFE[last.kind] ?? last.kind, gemahnt_am: last.sent_on, neue_frist: last.new_due_on }
      : {};
  };

  const context = {
    firma: {
      name: sellerName(seller) || null,
      inhaber: seller.owner_name,
      kleinunternehmer: seller.small_business,
      ust_satz: seller.small_business ? 0 : seller.vat_rate,
      zahlungsziel_tage: seller.payment_days,
      angebote_gueltig_tage: seller.offer_validity_days,
      logo: !!seller.logo_id,
      fehlt_fuer_rechnungen: missing,
    },
    kunden: customers.slice(0, 80).map((c) => ({
      name: c.name,
      ...(c.company ? { firma: c.company } : {}),
      auftraege: orders.filter((o) => o.customer_id === c.id).length,
    })),
    auftraege: [...orders]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 40)
      .map((o) => ({
        titel: o.title,
        kunde: customerName.get(o.customer_id) ?? null,
        preis: o.price,
        abrechnung: o.billing === 'monthly' ? 'monatlich' : 'einmalig',
        status: STATUS_LABEL[computeStatus(o)],
        ...(o.meeting_at ? { erstgespraech: localStamp(o.meeting_at) } : {}),
        ...(o.execution_at ? { ausfuehrung: localStamp(o.execution_at) } : {}),
        dokumente: documents.filter((d) => d.order_id === o.id).map((d) => d.number),
      })),
    offene_rechnungen: documents
      .filter((d) => d.kind === 'invoice' && !d.paid_at)
      .map((d) => ({
        nummer: d.number,
        kunde: d.data?.buyer?.name ?? null,
        betrag: d.total,
        faellig: d.due_on,
        ueberfaellig: !!d.due_on && d.due_on < todayKey,
        ...mahnstand(d.id),
      })),
    letzte_angebote: documents
      .filter((d) => d.kind === 'offer')
      .slice(0, 10)
      .map((d) => ({ nummer: d.number, kunde: d.data?.buyer?.name ?? null, betrag: d.total, datum: d.issued_on })),
    bezahlte_rechnungen_anzahl: documents.filter((d) => d.kind === 'invoice' && d.paid_at).length,
    // die zuletzt bezahlten (z. B. um eine versehentlich bezahlt markierte wieder auf offen zu setzen)
    bezahlte_rechnungen: documents
      .filter((d) => d.kind === 'invoice' && d.paid_at)
      .sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''))
      .slice(0, 8)
      .map((d) => ({
        nummer: d.number,
        kunde: d.data?.buyer?.name ?? null,
        betrag: d.total,
        bezahlt_am: (d.paid_at ?? '').slice(0, 10),
      })),
    finanzen: {
      hinweis:
        'Einnahmen = abgeschlossene Aufträge (monatliche anteilig), Ausgaben = Auftrags- und allgemeine Ausgaben',
      dieser_monat: money([thisMonth]),
      letzter_monat: money([lastMonth]),
      dieses_jahr: money(monthRange(`${year}-01`, thisMonth)),
      fixkosten_pro_monat: fixedCostsPerMonth(expenses, today),
    },
    steuern: steuern(),
    termine: upcoming.slice(0, 40),
    aufgaben: todos.entries.slice(0, 30),
    aufgaben_offen_gesamt: todos.open,
    ziele: goals.slice(0, 10),
    ausgaben: expenseList,
    posts: postList,
    social: {
      ideen: statusCount('idea'),
      in_arbeit: statusCount('in_progress'),
      bereit: statusCount('ready'),
      veroeffentlicht: statusCount('published'),
      diese_woche_geplant: posts
        .filter((p) => p.planned_for && dayKey(p.planned_for) >= weekStart && dayKey(p.planned_for) <= weekEnd)
        .slice(0, 10)
        .map((p) => p.title),
      zuletzt_veroeffentlicht: posts
        .filter((p) => p.published_at)
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
        .slice(0, 5)
        .map((p) => ({ titel: p.title, aufrufe: p.views })),
      verbundene_konten: accounts.map((a) => ({
        plattform: a.platform === 'tiktok' ? 'TikTok' : a.platform === 'instagram' ? 'Instagram' : a.platform,
        name: a.username,
        follower: a.followers,
        follower_plus_7_tage: a.growth7 ?? null,
        likes_gesamt: a.likes,
        beitraege: a.media_count,
      })),
    },
  };

  // Notbremse für sehr große Konten: Listen kürzen, bis es passt
  for (const key of ['posts', 'ausgaben', 'kunden', 'auftraege', 'offene_rechnungen', 'aufgaben', 'termine'] as const) {
    while (JSON.stringify(context).length > MAX_CHARS && context[key].length > 10) {
      (context[key] as unknown[]).splice(Math.floor(context[key].length / 2));
    }
  }
  return context;
}

const REPEAT_DE = { once: 'einmalig', monthly: 'monatlich', yearly: 'jährlich' } as const;

type ExpenseRow = {
  id: string;
  title: string;
  amount: number;
  category: string;
  repeat: 'once' | 'monthly' | 'yearly';
  spent_on: string;
  ends_on: string | null;
};

/**
 * Ausgaben mit Kurzzeichen (E1, E2 …), über die Nexy sie ändern oder löschen
 * kann: regelmäßige zuerst, dann die neuesten. list = dieselben Einträge.
 */
export function nexyExpenses<T extends ExpenseRow>(expenses: T[], max = 25) {
  const list = [...expenses]
    .sort((a, b) => Number(b.repeat !== 'once') - Number(a.repeat !== 'once') || b.spent_on.localeCompare(a.spent_on))
    .slice(0, max);
  return {
    list,
    entries: list.map((e, i) => ({
      ref: `E${i + 1}`,
      titel: e.title,
      betrag: e.amount,
      wie_oft: REPEAT_DE[e.repeat],
      kategorie: categoryLabel(e.category),
      [e.repeat === 'once' ? 'datum' : 'seit']: e.spent_on,
      ...(e.ends_on ? { bis: e.ends_on } : {}),
    })),
    refs: Object.fromEntries(list.map((e, i) => [`E${i + 1}`, e.id])) as Record<string, string>,
  };
}

type PostRow = PostFacts & {
  id: string;
  title: string;
  planned_for: string | null;
  published_at: string | null;
  updated_at: string;
};

/** Posts mit Kurzzeichen (P1, P2 …), zuletzt bearbeitete zuerst. list = dieselben Einträge. */
export function nexyPosts<T extends PostRow>(posts: T[], max = 25) {
  const list = [...posts].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, max);
  return {
    list,
    entries: list.map((p, i) => ({
      ref: `P${i + 1}`,
      titel: p.title,
      format: FORMATS.find((f) => f.key === p.format)?.label ?? p.format,
      status: statusLabel(computePostStatus(p)),
      ...(p.planned_for ? { geplant: localStamp(p.planned_for) } : {}),
      ...(p.published_at ? { veroeffentlicht: localStamp(p.published_at) } : {}),
    })),
    refs: Object.fromEntries(list.map((p, i) => [`P${i + 1}`, p.id])) as Record<string, string>,
  };
}
