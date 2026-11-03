import { useMemo } from 'react';

import { useCrm } from '@/features/crm/crm-provider';

import { buildEvents } from './appointment-logic';
import { useAppointments } from './appointments-provider';

/** Alle Termine: aus Aufträgen und eigene (nach Beginn sortiert). */
export function useCalendarEvents() {
  const { orders, customers } = useCrm();
  const { appointments } = useAppointments();
  return useMemo(() => buildEvents(orders, customers, appointments), [orders, customers, appointments]);
}
