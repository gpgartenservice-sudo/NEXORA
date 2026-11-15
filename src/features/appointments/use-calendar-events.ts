import { useMemo } from 'react';

import { useCrm } from '@/features/crm/crm-provider';
import { useProfile } from '@/providers/profile-provider';

import { buildEvents } from './appointment-logic';
import { useAppointments } from './appointments-provider';

/** Alle Termine: aus Aufträgen und eigene (nach Beginn sortiert). */
export function useCalendarEvents() {
  const { orders, customers } = useCrm();
  const { appointments } = useAppointments();
  const { profile } = useProfile();
  // Handwerk & Dienstleistung: Ausführungen sind meist draußen → Wetter-Hinweis
  const outside = profile?.industry === 'craft_service';
  return useMemo(() => buildEvents(orders, customers, appointments, outside), [orders, customers, appointments, outside]);
}
