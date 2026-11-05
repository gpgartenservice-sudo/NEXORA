import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useCrm, type Customer, type Order } from '@/features/crm/crm-provider';
import { missingBuyerFields, missingSellerFields, sellerName, todayIso } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { downloadPdf, PDF_UNSUPPORTED, pdfSupported, savePdf } from '@/features/documents/save-pdf';
import { incomeProofMonths, summarize } from '@/features/finance/finance-logic';
import { useFinance } from '@/features/finance/finance-provider';
import { useTaxReservePercent } from '@/features/finance/tax-settings';
import { usePlan } from '@/features/plan/plan-provider';
import { nexyEvents } from '@/features/appointments/appointment-logic';
import { useAppointments, type AppointmentInput } from '@/features/appointments/appointments-provider';
import { useCalendarEvents } from '@/features/appointments/use-calendar-events';
import { useFollowups } from '@/features/dunning/followups-provider';
import { nexyGoals, nexyTodos } from '@/features/goals/goals-logic';
import { useGoals } from '@/features/goals/goals-provider';
import { followerGrowth } from '@/features/social/connect-logic';
import { useSocialConnect } from '@/features/social/connect-provider';
import { useSocial } from '@/features/social/social-provider';
import { useAuth } from '@/providers/auth-provider';

import { askAssistant, type HistoryEntry } from './assistant-api';
import {
  buildProposals,
  EXECUTION_ORDER,
  proposalLabel,
  proposalProblem,
  quickReplies,
  replyText,
  whenLabel,
  type Proposal,
} from './assistant-logic';
import {
  appointmentChangeDone,
  appointmentChangeSteps,
  appointmentDone,
  appointmentSteps,
  customerDone,
  customerSteps,
  documentsDone,
  documentsSteps,
  documentSteps,
  expenseDone,
  expenseSteps,
  goalDone,
  goalSteps,
  incomeProofSteps,
  orderDateSteps,
  orderDatesSteps,
  orderDone,
  orderPriceSteps,
  orderSpotDone,
  orderSteps,
  postDone,
  postSteps,
  todoChangeDone,
  todoChangeSteps,
  todoDone,
  todoSteps,
  type GuideOrder,
  type GuideStep,
} from './guide-logic';
import { buildNexyContext } from './nexy-context';

export type NexyResult = { label: string; href?: string; note?: string };

/** Ergebnis von "Ausführen" */
export type ExecuteOutcome = { ok: boolean; results: NexyResult[]; error?: string };
/** Nexy macht es in der App vor (vor bzw. nach jeder Aktion); fertig, wenn gezeigt */
export type LivePlayer = (steps: GuideStep[]) => Promise<void>;

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
  /** Gratis-Grenze erreicht (Hinweis auf Pro) */
  quota?: boolean;
  /** per Sprache gesagt */
  voice?: boolean;
};

type State = {
  messages: NexyMessage[];
  thinking: boolean;
  executing: string | null;
  /** Nachricht an Nexy; liefert Nexys Antwort (null bei leerem Text) */
  send: (text: string, options?: { voice?: boolean }) => Promise<NexyMessage | null>;
  updateProposal: (messageId: string, proposalId: string, change: (p: Proposal) => Proposal) => void;
  /** `live`: Nexy zeigt dabei in der App, wie sie alles einträgt */
  execute: (messageId: string, live?: LivePlayer) => Promise<ExecuteOutcome>;
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
  const connected = useSocialConnect();
  const calendar = useCalendarEvents();
  const appts = useAppointments();
  const goals = useGoals();
  const { followups } = useFollowups();
  const plan = usePlan();
  const { user } = useAuth();
  const { percent: taxPercent } = useTaxReservePercent(user?.id);
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
    async (raw: string, options?: { voice?: boolean }): Promise<NexyMessage | null> => {
      const text = raw.trim();
      if (!text) return null;
      const before = latest.current;
      setMessages((list) => [...list, { id: nextId(), role: 'user', text, voice: options?.voice || undefined }]);
      setThinking(true);
      // Termine mit Kurzzeichen (T1, T2 …): darüber kann Nexy sie ändern
      const events = nexyEvents(calendar, new Date());
      // offene To-dos mit Kurzzeichen (A1, A2 …) und Ziele mit Stand
      const todoCtx = nexyTodos(goals.todos, {
        customer: (id) => crm.customers.find((c) => c.id === id)?.name ?? null,
        order: (id) => crm.orders.find((o) => o.id === id)?.title ?? null,
      });
      const context = buildNexyContext({
        seller: docs.seller,
        customers: crm.customers,
        orders: crm.orders,
        documents: docs.documents,
        expenses: finance.expenses,
        posts: social.posts,
        upcoming: events.entries,
        followups,
        todos: { entries: todoCtx.entries, open: todoCtx.open },
        goals: nexyGoals(goals.goals, { orders: crm.orders, customers: crm.customers, posts: social.posts }),
        taxPercent,
        accounts: connected.accounts.map((a) => ({
          ...a,
          growth7:
            followerGrowth(
              connected.stats,
              a.id,
              new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }),
              7,
            )?.delta ?? null,
        })),
      });
      const { data, error, notSetUp, quota } = await askAssistant(text, historyOf(before).slice(-16), context);
      setThinking(false);
      void plan.refresh(); // Verbrauch aktualisieren
      if (error || !data) {
        const failed: NexyMessage = {
          id: nextId(),
          role: 'nexy',
          text: error ?? 'Keine Antwort.',
          error: error ?? 'Keine Antwort.',
          notSetUp,
          quota,
        };
        setMessages((list) => [...list, failed]);
        return failed;
      }
      const proposals = buildProposals(
        data,
        {
          customers: crm.customers,
          orders: crm.orders,
          documents: docs.documents,
          events: calendar,
          refs: events.refs,
          appointments: appts.appointments,
          todos: goals.todos.filter((t) => !t.done),
          todoRefs: todoCtx.refs,
        },
        todayIso(),
      );
      const reply: NexyMessage = {
        id: nextId(),
        role: 'nexy',
        text:
          replyText(data) ?? (proposals.length ? 'Das habe ich vorbereitet:' : 'Dazu habe ich gerade nichts für dich.'),
        proposals,
        quickReplies: quickReplies(data),
        status: proposals.length ? 'open' : undefined,
      };
      setMessages((list) => [...list, reply]);
      return reply;
    },
    [
      crm.customers,
      crm.orders,
      docs.seller,
      docs.documents,
      finance.expenses,
      social.posts,
      connected.accounts,
      connected.stats,
      calendar,
      appts.appointments,
      goals.todos,
      goals.goals,
      followups,
      taxPercent,
      plan,
    ],
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
        const priceComing =
          !!p.order.existingId &&
          all.some((x) => x.kind === 'order_price' && x.include && x.order.existingId === p.order.existingId);
        if (order && order.price === null && !priceComing) list.unshift('Preis im Auftrag');
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
    async (messageId: string, live?: LivePlayer): Promise<ExecuteOutcome> => {
      const message = latest.current.find((m) => m.id === messageId);
      if (!message?.proposals) return { ok: false, results: [], error: 'Diese Vorschläge gibt es nicht mehr.' };
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
      // in diesem Durchgang geänderte Aufträge (z. B. neuer Preis vor der Rechnung)
      const changedOrders = new Map<string, Order>();
      // Nexy macht es vor: vor jeder Aktion hingehen und eintippen, danach zeigen
      const show = async (steps: GuideStep[]) => {
        if (live && steps.length) await live(steps);
      };
      const named = (c: Customer | undefined) => (c ? { id: c.id, name: c.name } : null);
      const customerOf = (id: string | null | undefined) =>
        id ? (crm.customers.find((c) => c.id === id) ?? [...newCustomers.values()].find((c) => c.id === id)) : undefined;
      const orderOf = (id: string) =>
        changedOrders.get(id) ?? crm.orders.find((o) => o.id === id) ?? [...newOrders.values()].find((o) => o.id === id);
      const guideOrder = (id: string, fallbackTitle?: string | null): GuideOrder => {
        const o = orderOf(id);
        const c = customerOf(o?.customer_id);
        return { id, title: o?.title ?? fallbackTitle ?? 'Auftrag', customer: named(c), billing: o?.billing ?? null };
      };

      const finish = (error?: string): ExecuteOutcome => {
        setExecuting(null);
        patch(messageId, { results, doneIds, error, status: error ? 'open' : 'done' });
        return { ok: !error, results, error };
      };

      for (const p of chosen) {
        const blocked = blockers(p, all);
        if (blocked.length) return finish(`„${proposalLabel(p)}“: Dafür fehlt noch ${blocked.join(', ')}.`);
        if (p.kind === 'customer') {
          await show(customerSteps(p));
          const { data, error } = await crm.createCustomer(p.data);
          if (error || !data) return finish(error ?? 'Der Kunde konnte nicht gespeichert werden.');
          newCustomers.set(p.id, data);
          results.push({ label: `Kunde ${data.name}`, href: `/kunden/${data.id}` });
          await show(customerDone(data.id));
        } else if (p.kind === 'order') {
          const customerId =
            p.customer.existingId ?? (p.customer.newRef ? newCustomers.get(p.customer.newRef)?.id : undefined);
          if (!customerId) return finish(`Für „${p.data.title}“ fehlt der Kunde.`);
          await show(orderSteps(p, named(customerOf(customerId))));
          // Termine trägt Nexy sichtbar im Auftrag nach (wie man es selbst machen würde)
          const dates = { meeting_at: p.data.meeting_at, execution_at: p.data.execution_at };
          const later = !!live && !!(dates.meeting_at || dates.execution_at);
          const { data, error } = await crm.createOrder({
            customer_id: customerId,
            ...p.data,
            ...(later ? { meeting_at: null, execution_at: null } : {}),
          });
          if (error || !data) return finish(error ?? 'Der Auftrag konnte nicht gespeichert werden.');
          newOrders.set(p.id, data);
          results.push({ label: `Auftrag ${data.title}`, href: `/auftraege/${data.id}` });
          await show(orderDone(data.id));
          if (later) {
            await show(orderDatesSteps(dates));
            const { data: dated, error: dateError } = await crm.updateOrder(data.id, dates);
            if (dateError) return finish(dateError);
            if (dated) newOrders.set(p.id, dated);
            await show(orderSpotDone(dates.meeting_at ? 'guide.order.meeting' : 'guide.order.execution'));
          }
        } else if (p.kind === 'document') {
          const order = p.order.existingId
            ? (changedOrders.get(p.order.existingId) ?? crm.orders.find((o) => o.id === p.order.existingId))
            : newOrders.get(p.order.newRef ?? '');
          const customer = order
            ? (crm.customers.find((c) => c.id === order.customer_id) ??
              [...newCustomers.values()].find((c) => c.id === order.customer_id))
            : undefined;
          if (!order || !customer) return finish(`Für „${proposalLabel(p)}“ fehlt der Auftrag.`);
          await show(documentSteps(p, guideOrder(order.id)));
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
          await show(documentsDone(guideOrder(order.id)));
        } else if (p.kind === 'appointment') {
          const customerId =
            p.customer.existingId ?? (p.customer.newRef ? (newCustomers.get(p.customer.newRef)?.id ?? null) : null);
          await show(appointmentSteps(p));
          const { data, error } = await appts.createAppointment({ ...p.data, customer_id: customerId });
          if (error || !data) return finish(error ?? 'Der Termin konnte nicht gespeichert werden.');
          results.push({
            label: `Termin ${data.title}`,
            note: whenLabel(data.starts_at, data.all_day),
            href: `/termine/${data.id}`,
          });
          await show(appointmentDone(data.id));
        } else if (p.kind === 'order_date') {
          const orderId = p.order.existingId;
          if (!orderId) return finish(`Für „${proposalLabel(p)}“ fehlt der Auftrag.`);
          await show(orderDateSteps(p, guideOrder(orderId, p.order.title)));
          const dates = p.data.field === 'meeting' ? { meeting_at: p.data.at } : { execution_at: p.data.at };
          const { data: changed, error } = await crm.updateOrder(orderId, dates);
          if (error) return finish(error);
          if (changed) changedOrders.set(orderId, changed);
          results.push({
            label: `${p.data.field === 'meeting' ? 'Erstgespräch' : 'Ausführung'} ${p.order.title ?? ''}`.trim(),
            note: whenLabel(p.data.at),
            href: `/auftraege/${orderId}`,
          });
          await show(orderSpotDone(p.data.field === 'meeting' ? 'guide.order.meeting' : 'guide.order.execution'));
        } else if (p.kind === 'appointment_change') {
          const ev = p.event;
          const c = p.data;
          const what = `${ev.kind === 'meeting' ? 'Erstgespräch' : ev.kind === 'execution' ? 'Ausführung' : 'Termin'} ${ev.title}`;
          const note = c.remove
            ? ev.kind === 'appointment'
              ? 'gelöscht'
              : 'abgesagt'
            : c.starts_at
              ? `verschoben auf ${whenLabel(c.starts_at, c.all_day ?? ev.allDay)}`
              : c.done !== null
                ? c.done
                  ? 'erledigt'
                  : 'wieder offen'
                : 'geändert';
          const changeOrder = ev.kind !== 'appointment' && ev.orderId ? guideOrder(ev.orderId, ev.title) : null;
          await show(appointmentChangeSteps(p, changeOrder));
          if (ev.kind === 'appointment' && ev.appointmentId) {
            if (c.remove) {
              const { error } = await appts.deleteAppointment(ev.appointmentId);
              if (error) return finish(error);
              results.push({ label: what, note, href: '/termine' });
            } else {
              const input: Partial<AppointmentInput> = {};
              if (c.starts_at) input.starts_at = c.starts_at;
              if (c.all_day !== null) input.all_day = c.all_day;
              if (c.ends_at) input.ends_at = c.ends_at;
              if (c.title) input.title = c.title;
              if (c.location) input.location = c.location;
              if (c.notes) input.notes = c.notes;
              if (c.done !== null) input.done = c.done;
              const { error } = await appts.updateAppointment(ev.appointmentId, input);
              if (error) return finish(error);
              results.push({ label: what, note, href: `/termine/${ev.appointmentId}` });
            }
          } else if (ev.orderId) {
            const meeting = ev.kind === 'meeting';
            const change: Partial<Order> = {};
            if (c.remove) change[meeting ? 'meeting_at' : 'execution_at'] = null;
            if (c.starts_at) change[meeting ? 'meeting_at' : 'execution_at'] = c.starts_at;
            if (c.done !== null) change[meeting ? 'meeting_done' : 'completed'] = c.done;
            const { error } = await crm.updateOrder(ev.orderId, change);
            if (error) return finish(error);
            results.push({ label: what, note, href: `/auftraege/${ev.orderId}` });
          }
          await show(appointmentChangeDone(p, changeOrder));
        } else if (p.kind === 'order_price') {
          const orderId = p.order.existingId;
          if (!orderId) return finish(`Für „${proposalLabel(p)}“ fehlt der Auftrag.`);
          await show(orderPriceSteps(p, guideOrder(orderId, p.order.title)));
          const { data: changed, error } = await crm.updateOrder(orderId, {
            price: p.data.price,
            ...(p.data.billing ? { billing: p.data.billing } : {}),
          });
          if (error) return finish(error);
          if (changed) changedOrders.set(orderId, changed);
          results.push({ label: proposalLabel(p), href: `/auftraege/${orderId}` });
          await show(orderSpotDone('guide.order.price'));
        } else if (p.kind === 'todo') {
          const customerId =
            p.customer.existingId ?? (p.customer.newRef ? (newCustomers.get(p.customer.newRef)?.id ?? null) : null);
          const newOrder = p.order.newRef ? newOrders.get(p.order.newRef) : undefined;
          await show(todoSteps(p));
          const { data, error } = await goals.createTodo({
            ...p.data,
            customer_id: newOrder?.customer_id ?? customerId,
            order_id: p.order.existingId ?? newOrder?.id ?? null,
          });
          if (error || !data) return finish(error ?? 'Das To-do konnte nicht gespeichert werden.');
          results.push({
            label: `To-do ${data.title}`,
            note: data.due_on ? `fällig ${data.due_on.split('-').reverse().join('.')}` : undefined,
            href: `/aufgaben/${data.id}`,
          });
          await show(todoDone(data.id));
        } else if (p.kind === 'todo_change') {
          const c = p.data;
          await show(todoChangeSteps(p));
          if (c.remove) {
            const { error } = await goals.deleteTodo(p.todo.id);
            if (error) return finish(error);
            results.push({ label: `To-do ${p.todo.title}`, note: 'gelöscht', href: '/aufgaben' });
          } else {
            const { error } = await goals.updateTodo(p.todo.id, {
              ...(c.title ? { title: c.title } : {}),
              ...(c.due_on !== null ? { due_on: c.due_on || null } : {}),
              ...(c.notes ? { notes: c.notes } : {}),
              ...(c.important !== null ? { important: c.important } : {}),
              ...(c.done !== null ? { done: c.done } : {}),
            });
            if (error) return finish(error);
            const note = c.done === true ? 'erledigt' : c.done === false ? 'wieder offen' : 'geändert';
            results.push({ label: `To-do ${c.title ?? p.todo.title}`, note, href: `/aufgaben/${p.todo.id}` });
          }
          await show(todoChangeDone(p));
        } else if (p.kind === 'goal') {
          await show(goalSteps(p));
          const { data, error } = await goals.createGoal(p.data);
          if (error || !data) return finish(error ?? 'Das Ziel konnte nicht gespeichert werden.');
          results.push({ label: proposalLabel(p), href: `/aufgaben/ziele/${data.id}` });
          await show(goalDone(data.id));
        } else if (p.kind === 'expense') {
          await show(expenseSteps(p));
          const { data, error } = await finance.createExpense({ ...p.data, ends_on: null, notes: null });
          if (error || !data) return finish(error ?? 'Die Ausgabe konnte nicht gespeichert werden.');
          results.push({ label: `Ausgabe ${data.title}`, href: `/finanzen/ausgabe/${data.id}` });
          await show(expenseDone(data.id));
        } else if (p.kind === 'post') {
          await show(postSteps(p));
          const { data, error } = await social.createPost(p.data);
          if (error || !data) return finish(error ?? 'Die Post-Idee konnte nicht gespeichert werden.');
          results.push({ label: `Post-Idee ${data.title}`, href: `/social/${data.id}` });
          await show(postDone(data.id));
        } else if (p.kind === 'mark_paid') {
          const paidOrderId = docs.documents.find((d) => d.id === p.data.documentId)?.order_id;
          const paidOrder = paidOrderId ? guideOrder(paidOrderId) : null;
          await show(documentsSteps(paidOrder, `Ich markiere ${p.data.number} als bezahlt.`));
          const { error } = await docs.setPaid(p.data.documentId, true);
          if (error) return finish(error);
          results.push({ label: `${p.data.number} als bezahlt markiert`, href: '/finanzen' });
          await show(documentsDone(paidOrder));
        } else if (p.kind === 'existing_pdf') {
          const doc = docs.documents.find((d) => d.id === p.data.documentId);
          if (!doc) return finish(`${p.data.number} gibt es nicht mehr.`);
          const pdfOrder = doc.order_id ? guideOrder(doc.order_id) : null;
          await show(documentsSteps(pdfOrder, `Ich speichere ${doc.number} als PDF.`));
          const pdf = await savePdf(doc, await docs.logoFor(doc));
          if (pdf.error) return finish(pdf.error);
          results.push({
            label: `${doc.number} als PDF gespeichert`,
            href: doc.order_id ? `/auftraege/${doc.order_id}` : undefined,
          });
          await show(documentsDone(pdfOrder));
        } else if (p.kind === 'income_proof') {
          if (!pdfSupported) return finish(PDF_UNSUPPORTED);
          await show(incomeProofSteps());
          const months = incomeProofMonths(p.data.period);
          const rows = summarize([...crm.orders, ...newOrders.values()], finance.expenses, months);
          try {
            const { renderIncomeProofPdf, incomeProofFileName } = await import('@/features/finance/income-pdf');
            await downloadPdf({
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
      return finish();
    },
    [blockers, crm, docs, finance, social, appts, goals, patch],
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
