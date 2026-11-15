import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useCalendarEvents } from '@/features/appointments/use-calendar-events';
import { useCrm } from '@/features/crm/crm-provider';
import { IMPULSES } from '@/features/dashboard/content';
import { todayIso } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { useGoals } from '@/features/goals/goals-provider';
import { goalTitle } from '@/features/goals/goals-logic';
import { useGoalProgress } from '@/features/goals/use-goal-data';

import { planNotifications, type NotifyData } from './notify-logic';
import { schedule } from './notify-platform';
import { useNotifyPrefs } from './notify-prefs';

const listeners = new Set<() => void>();
/** Nach dem Erlauben neu planen */
export function replanNotifications() {
  listeners.forEach((l) => l());
}

/** Plant die Benachrichtigungen neu, sobald sich Termine, Rechnungen, To-dos oder Ziele ändern. */
export function NotificationScheduler() {
  const events = useCalendarEvents();
  const { documents } = useDocuments();
  const { customerById } = useCrm();
  const { todos, goals } = useGoals();
  const [today] = useState(() => todayIso());
  const progress = useGoalProgress(goals, today);
  const { prefs } = useNotifyPrefs();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && l());
    return () => {
      listeners.delete(l);
      sub.remove();
    };
  }, []);

  const data = useMemo<NotifyData>(
    () => ({
      events: events.map((e) => ({
        key: e.key,
        title: e.title,
        start: e.start,
        allDay: e.allDay,
        done: e.done,
        customerName: e.customerName,
        location: e.location,
      })),
      invoices: documents
        .filter((d) => d.kind === 'invoice')
        .map((d) => ({
          id: d.id,
          number: d.number,
          total: d.total,
          due_on: d.due_on,
          paid_at: d.paid_at,
          customerName: d.customer_id ? (customerById(d.customer_id)?.name ?? null) : null,
        })),
      todos: todos.map((t) => ({ title: t.title, due_on: t.due_on, done: t.done })),
      goals: progress
        .filter((p) => p.progress.ratio < 1)
        .map((p) => ({ id: p.goal.id, title: goalTitle(p.goal), ratio: p.progress.ratio, hint: p.progress.hint })),
      impulses: IMPULSES,
    }),
    [events, documents, customerById, todos, progress],
  );

  useEffect(() => {
    // kurz warten, damit nicht bei jeder Kleinigkeit neu geplant wird
    const t = setTimeout(() => {
      void schedule(planNotifications(data, prefs)).catch((e) => console.warn('[Benachrichtigungen]', e));
    }, 1500);
    return () => clearTimeout(t);
  }, [data, prefs, tick]);

  return null;
}
