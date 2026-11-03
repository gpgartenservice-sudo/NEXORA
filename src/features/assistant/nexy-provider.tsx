import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useCrm, type Customer, type Order } from '@/features/crm/crm-provider';
import { missingBuyerFields, missingSellerFields, sellerName, todayIso } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { downloadPdf, PDF_UNSUPPORTED, pdfSupported, savePdf } from '@/features/documents/save-pdf';
import { incomeProofMonths, summarize } from '@/features/finance/finance-logic';
import { useFinance } from '@/features/finance/finance-provider';
import { useSocial } from '@/features/social/social-provider';

import { askAssistant, type HistoryEntry } from './assistant-api';
import {
  buildProposals,
  EXECUTION_ORDER,
  proposalLabel,
  proposalProblem,
  quickReplies,
  replyText,
  type Proposal,
} from './assistant-logic';
import { buildNexyContext } from './nexy-context';

export type NexyResult = { label: string; href?: string; note?: string };

export type NexyMessage = {
  id: string;
  role: 'user' | 'nexy';
  text: string;
  proposals?: Proposal[];
  quickReplies?: string[];
  /** offen = wartet auf Bestätigung */
  status?: 'open' | 'done' | 'dismissed';
  /** schon ausgeführte Vorschläge (bei einem Fehler mittendrin) */
  doneIds?: string[];
  results?: NexyResult[];
  error?: string;
  /** Fehlermeldung, weil Nexy noch nicht eingerichtet ist */
  notSetUp?: boolean;
};

type State = {
  messages: NexyMessage[];
  thinking: boolean;
  executing: string | null;
  send: (text: string) => Promise<void>;
  updateProposal: (messageId: string, proposalId: string, change: (p: Proposal) => Proposal) => void;
  execute: (messageId: string) => Promise<void>;
  dismiss: (messageId: string) => void;
  reset: () => void;
  /** Was fehlt, damit ein Vorschlag ausgeführt werden kann? (Zuordnung, Pflichtangaben) */
  blockers: (p: Proposal, all: Proposal[]) => string[];
};

const Ctx = createContext<State | null>(null);

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${++counter}`;

function monthRange(today = todayIso()) {
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last)}` };
}

/** Gesprächsverlauf für die Server-Funktion: Text + was aus den Vorschlägen wurde */
function historyOf(messages: NexyMessage[]): HistoryEntry[] {
  return messages
    .filter((m) => !m.error)
    .map((m) => {
      if (m.role === 'user' || !m.proposals?.length) return { role: m.role, text: m.text };
      const labels = m.proposals.map(proposalLabel).join('; ');
      const what =
        m.status === 'done'
          ? 'vom Nutzer ausgeführt'
          : m.status === 'dismissed'
            ? 'vom Nutzer verworfen'
            : 'noch nicht bestätigt';
      return { role: m.role, text: `${m.text}\n[Vorschläge: ${labels} – ${what}]` };
    });
}

/** Nexy: Gespräch (bleibt beim Wechseln der Bereiche erhalten) und Ausführen der Vorschläge. */
export function NexyProvider({ children }: { children: ReactNode }) {
  const crm = useCrm();
  const docs = useDocuments();
  const finance = useFinance();
  const social = useSocial();
  const [messages, setMessages] = useState<NexyMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  // immer der aktuelle Stand (für asynchrone Abläufe)
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  }, [messages]);

  const patch = useCallback(
    (id: string, change: Partial<NexyMessage> | ((m: NexyMessage) => Partial<NexyMessage>)) =>
      setMessages((list) =>
        list.map((m) => (m.id === id ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)),
      ),
    [],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const before = latest.current;
      setMessages((list) => [...list, { id: nextId(), role: 'user', text }]);
      setThinking(true);
      const context = buildNexyContext({
        seller: docs.seller,
        customers: crm.customers,
        orders: crm.orders,
        documents: docs.documents,
        expenses: finance.expenses,
        posts: social.posts,
      });
      const { data, error, notSetUp } = await askAssistant(text, historyOf(before).slice(-16), context);
      setThinking(false);
      if (error || !data) {
        setMessages((list) => [
          ...list,
          { id: nextId(), role: 'nexy', text: error ?? 'Keine Antwort.', error: error ?? 'Keine Antwort.', notSetUp },
        ]);
        return;
      }
      const proposals = buildProposals(
        data,
        { customers: crm.customers, orders: crm.orders, documents: docs.documents },
        todayIso(),
      );
      setMessages((list) => [
        ...list,
        {
          id: nextId(),
          role: 'nexy',
          text:
            replyText(data) ??
            (proposals.length ? 'Das habe ich vorbereitet:' : 'Dazu habe ich gerade nichts für dich.'),
          proposals,
          quickReplies: quickReplies(data),
          status: proposals.length ? 'open' : undefined,
        },
      ]);
    },
    [crm.customers, crm.orders, docs.seller, docs.documents, finance.expenses, social.posts],
  );

  const updateProposal = useCallback(
    (messageId: string, proposalId: string, change: (p: Proposal) => Proposal) =>
      patch(messageId, (m) => ({ proposals: m.proposals?.map((p) => (p.id === proposalId ? change(p) : p)) })),
    [patch],
  );

  const blockers = useCallback(
    (p: Proposal, all: Proposal[]): string[] => {
      const problem = proposalProblem(p, all);
      if (problem) return [problem];
      if (p.kind === 'document') {
        const kind = p.data.docKind;
        const list = [...missingSellerFields(docs.seller, kind)];
        const order = p.order.existingId
          ? crm.orders.find((o) => o.id === p.order.existingId)
          : all.find((x): x is Extract<Proposal, { kind: 'order' }> => x.id === p.order.newRef && x.kind === 'order')
              ?.data;
        if (order && order.price === null) list.unshift('Preis im Auftrag');
        const existingCustomer = p.customer.existingId
          ? crm.customers.find((c) => c.id === p.customer.existingId)
          : undefined;
        const newCustomer = all.find(
          (x): x is Extract<Proposal, { kind: 'customer' }> => x.id === p.customer.newRef && x.kind === 'customer',
        )?.data;
        const buyer = existingCustomer ?? newCustomer;
        if (buyer)
          list.push(
            ...missingBuyerFields(
              { name: buyer.name, company: buyer.company, address: buyer.address, email: buyer.email },
              kind,
            ),
          );
        return list;
      }
      if (p.kind === 'income_proof' && !sellerName(docs.seller)) return ['Name bzw. Firmenname (Bereich Firma)'];
      return [];
    },
    [crm.orders, crm.customers, docs.seller],
  );

  const execute = useCallback(
    async (messageId: string) => {
      const message = latest.current.find((m) => m.id === messageId);
      if (!message?.proposals) return;
      setExecuting(messageId);
      const all = message.proposals;
      const already = new Set(message.doneIds ?? []);
      const chosen = all
        .filter((p) => p.include && !already.has(p.id))
        .sort((a, b) => EXECUTION_ORDER.indexOf(a.kind) - EXECUTION_ORDER.indexOf(b.kind));
      const results: NexyResult[] = [...(message.results ?? [])];
      const doneIds = [...already];
      const newCustomers = new Map<string, Customer>();
      const newOrders = new Map<string, Order>();

      const finish = (error?: string) => {
        setExecuting(null);
        patch(messageId, { results, doneIds, error, status: error ? 'open' : 'done' });
      };

      for (const p of chosen) {
        const blocked = blockers(p, all);
        if (blocked.length) return finish(`„${proposalLabel(p)}“: Dafür fehlt noch ${blocked.join(', ')}.`);
        if (p.kind === 'customer') {
          const { data, error } = await crm.createCustomer(p.data);
          if (error || !data) return finish(error ?? 'Der Kunde konnte nicht gespeichert werden.');
          newCustomers.set(p.id, data);
          results.push({ label: `Kunde ${data.name}`, href: `/kunden/${data.id}` });
        } else if (p.kind === 'order') {
          const customerId =
            p.customer.existingId ?? (p.customer.newRef ? newCustomers.get(p.customer.newRef)?.id : undefined);
          if (!customerId) return finish(`Für „${p.data.title}“ fehlt der Kunde.`);
          const { data, error } = await crm.createOrder({ customer_id: customerId, ...p.data });
          if (error || !data) return finish(error ?? 'Der Auftrag konnte nicht gespeichert werden.');
          newOrders.set(p.id, data);
          results.push({ label: `Auftrag ${data.title}`, href: `/auftraege/${data.id}` });
        } else if (p.kind === 'document') {
          const order = p.order.existingId
            ? crm.orders.find((o) => o.id === p.order.existingId)
            : newOrders.get(p.order.newRef ?? '');
          const customer = order
            ? (crm.customers.find((c) => c.id === order.customer_id) ??
              [...newCustomers.values()].find((c) => c.id === order.customer_id))
            : undefined;
          if (!order || !customer) return finish(`Für „${proposalLabel(p)}“ fehlt der Auftrag.`);
          const kind = p.data.docKind;
          const service =
            kind === 'invoice'
              ? order.billing === 'monthly'
                ? { date: null, period: monthRange() }
                : { date: p.data.service_date ?? order.execution_at?.slice(0, 10) ?? todayIso(), period: null }
              : undefined;
          const { data, error } = await docs.issue(kind, order, customer, service);
          if (error || !data) return finish(error ?? 'Das Dokument konnte nicht erstellt werden.');
          const pdf = await savePdf(data, await docs.logoFor(data));
          results.push({
            label: `${kind === 'invoice' ? 'Rechnung' : 'Angebot'} ${data.number}`,
            href: `/auftraege/${order.id}`,
            note: pdf.error ? pdf.error : 'als PDF gespeichert',
          });
        } else if (p.kind === 'expense') {
          const { data, error } = await finance.createExpense({ ...p.data, ends_on: null, notes: null });
          if (error || !data) return finish(error ?? 'Die Ausgabe konnte nicht gespeichert werden.');
          results.push({ label: `Ausgabe ${data.title}`, href: `/finanzen/ausgabe/${data.id}` });
        } else if (p.kind === 'post') {
          const { data, error } = await social.createPost(p.data);
          if (error || !data) return finish(error ?? 'Die Post-Idee konnte nicht gespeichert werden.');
          results.push({ label: `Post-Idee ${data.title}`, href: `/social/${data.id}` });
        } else if (p.kind === 'mark_paid') {
          const { error } = await docs.setPaid(p.data.documentId, true);
          if (error) return finish(error);
          results.push({ label: `${p.data.number} als bezahlt markiert`, href: '/finanzen' });
        } else if (p.kind === 'existing_pdf') {
          const doc = docs.documents.find((d) => d.id === p.data.documentId);
          if (!doc) return finish(`${p.data.number} gibt es nicht mehr.`);
          const pdf = await savePdf(doc, await docs.logoFor(doc));
          if (pdf.error) return finish(pdf.error);
          results.push({
            label: `${doc.number} als PDF gespeichert`,
            href: doc.order_id ? `/auftraege/${doc.order_id}` : undefined,
          });
        } else if (p.kind === 'income_proof') {
          if (!pdfSupported) return finish(PDF_UNSUPPORTED);
          const months = incomeProofMonths(p.data.period);
          const rows = summarize([...crm.orders, ...newOrders.values()], finance.expenses, months);
          try {
            const { renderIncomeProofPdf, incomeProofFileName } = await import('@/features/finance/income-pdf');
            downloadPdf({
              bytes: await renderIncomeProofPdf({ seller: docs.seller, logo: docs.logo, rows }),
              fileName: incomeProofFileName(rows),
            });
          } catch (e) {
            return finish(`Der Einkommensnachweis konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}`);
          }
          results.push({ label: proposalLabel(p), note: 'als PDF gespeichert', href: '/finanzen' });
        }
        doneIds.push(p.id);
      }
      finish();
    },
    [blockers, crm, docs, finance, social, patch],
  );

  const dismiss = useCallback((messageId: string) => patch(messageId, { status: 'dismissed' }), [patch]);
  const reset = useCallback(() => setMessages([]), []);

  const value = useMemo<State>(
    () => ({ messages, thinking, executing, send, updateProposal, execute, dismiss, reset, blockers }),
    [messages, thinking, executing, send, updateProposal, execute, dismiss, reset, blockers],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNexy(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNexy muss innerhalb von NexyProvider verwendet werden');
  return ctx;
}
