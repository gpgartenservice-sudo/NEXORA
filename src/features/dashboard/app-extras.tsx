import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { MoneyBurstHost } from '@/components/motion/money-burst';
import { useGuide } from '@/features/assistant/nexy-guide';
import { useCrm } from '@/features/crm/crm-provider';
import { useDocuments } from '@/features/documents/documents-provider';
import { useFinance } from '@/features/finance/finance-provider';
import { NotificationScheduler } from '@/features/notifications/notification-scheduler';

import { LunaGreeting } from './luna-greeting';
import { allTimeIncome, monthNumbers, queueCelebration, takeStartCelebration } from './money';

/**
 * Was über allen Seiten läuft: fliegende Geldscheine, das Erkennen neuer Einnahmen
 * und das Planen der Benachrichtigungen.
 */
export function AppExtras() {
  return (
    <>
      <IncomeWatcher />
      <NotificationScheduler />
      <LunaGreeting />
      <MoneyBurstHost />
    </>
  );
}

/**
 * Neue Einnahme in der App (Auftrag abgeschlossen oder Rechnung als bezahlt markiert):
 * zur Startseite und dort feiern. Beim App-Start einmal feiern, sobald es Einnahmen gibt.
 */
function IncomeWatcher() {
  const { orders, loading: crmLoading } = useCrm();
  const { documents, loading: docsLoading } = useDocuments();
  const { expenses, loading: financeLoading } = useFinance();
  const loading = crmLoading || docsLoading || financeLoading;
  const guide = useGuide();
  const pathname = usePathname();
  const seen = useRef<{ income: number; paid: number } | null>(null);
  const before = useRef(monthNumbers(orders, expenses));
  const navTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(navTimer.current), []);

  const income = allTimeIncome(orders);
  const paid = Math.round(documents.filter((d) => d.kind === 'invoice' && d.paid_at).reduce((s, d) => s + d.total, 0) * 100) / 100;

  useEffect(() => {
    if (loading) return;
    const now = monthNumbers(orders, expenses);
    if (!seen.current) {
      seen.current = { income, paid };
      before.current = now;
      if (income > 0 && takeStartCelebration()) queueCelebration('start', { income: 0, expenses: 0, profit: 0 });
      return;
    }
    const more = income > seen.current.income + 0.004 || paid > seen.current.paid + 0.004;
    const from = before.current;
    seen.current = { income, paid };
    before.current = now;
    if (!more) return;
    queueCelebration('income', from);
    // Während Luna gerade live etwas vorführt, nicht dazwischenfunken – sie kehrt danach selbst zurück
    if (pathname !== '/home' && !guide?.running) {
      clearTimeout(navTimer.current);
      navTimer.current = setTimeout(() => router.navigate('/home'), 650);
    }
  }, [loading, income, paid, orders, expenses, pathname, guide?.running]);

  return null;
}
