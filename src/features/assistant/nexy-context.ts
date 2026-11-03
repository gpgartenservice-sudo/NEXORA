/**
 * Was Nexy über das Business des Nutzers weiß: eine kompakte Übersicht,
 * die mit jeder Nachricht mitgeschickt wird. Bewusst sparsam – keine
 * Telefonnummern, E-Mails oder Anschriften von Kunden.
 */
import { computeStatus, STATUS_LABEL } from '../crm/order-logic';
import { missingSellerFields, sellerName, type DocumentData, type Seller } from '../documents/document-logic';
import {
  addMonths,
  fixedCostsPerMonth,
  monthKey,
  monthRange,
  summarize,
  sumUp,
  type ExpenseFacts,
  type OrderMoney,
} from '../finance/finance-logic';
import { computePostStatus, dayKey, startOfWeek, type PostFacts } from '../social/social-logic';

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

export type ContextInput = {
  seller: Seller;
  customers: CustomerLike[];
  orders: OrderLike[];
  documents: DocLike[];
  expenses: ExpenseFacts[];
  posts: PostLike[];
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
  today = new Date(),
}: ContextInput) {
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const todayKey = dayKey(today);
  const thisMonth = monthKey(today);
  const lastMonth = addMonths(thisMonth, -1);
  const year = thisMonth.slice(0, 4);
  const money = (months: string[]) => sumUp(summarize(orders, expenses, months, today));
  const missing = missingSellerFields(seller, 'invoice');

  const monday = startOfWeek(today);
  const weekEnd = dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
  const weekStart = dayKey(monday);
  const statusCount = (s: string) => posts.filter((p) => computePostStatus(p) === s).length;

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
      })),
    letzte_angebote: documents
      .filter((d) => d.kind === 'offer')
      .slice(0, 10)
      .map((d) => ({ nummer: d.number, kunde: d.data?.buyer?.name ?? null, betrag: d.total, datum: d.issued_on })),
    bezahlte_rechnungen_anzahl: documents.filter((d) => d.kind === 'invoice' && d.paid_at).length,
    finanzen: {
      hinweis:
        'Einnahmen = abgeschlossene Aufträge (monatliche anteilig), Ausgaben = Auftrags- und allgemeine Ausgaben',
      dieser_monat: money([thisMonth]),
      letzter_monat: money([lastMonth]),
      dieses_jahr: money(monthRange(`${year}-01`, thisMonth)),
      fixkosten_pro_monat: fixedCostsPerMonth(expenses, today),
    },
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
    },
  };

  // Notbremse für sehr große Konten: Listen kürzen, bis es passt
  for (const key of ['kunden', 'auftraege', 'offene_rechnungen'] as const) {
    while (JSON.stringify(context).length > MAX_CHARS && context[key].length > 10) {
      (context[key] as unknown[]).splice(Math.floor(context[key].length / 2));
    }
  }
  return context;
}
