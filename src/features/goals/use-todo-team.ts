import { useCallback, useMemo } from 'react';

import { useAccess, useTeam, type TeamMember } from '@/features/team/team-provider';
import { useAuth } from '@/providers/auth-provider';

import type { Todo } from './goals-logic';

export type TodoTeam = {
  me: string;
  /** mit anderen in einer Firma */
  inTeam: boolean;
  /** Rolle Mitarbeiter: bekommt To-dos von der Leitung und hakt nur ab */
  employee: boolean;
  /** To-dos anlegen und bearbeiten (Recht „To-dos & Ziele“ bearbeiten) */
  canWrite: boolean;
  /** To-dos für andere anlegen */
  canAssign: boolean;
  /** alle außer mir (für „Für wen?“) */
  others: TeamMember[];
  /** Name zu einer ID (ich → null, unbekannt → „Ehemaliges Mitglied“) */
  nameOf: (id: string) => string | null;
  /** Darf ich dieses To-do abhaken? */
  canToggle: (todo: Todo) => boolean;
};

/** Wer darf bei den To-dos was – im Team verteilt die Leitung, Mitarbeiter haken ab. */
export function useTodoTeam(): TodoTeam {
  const { user } = useAuth();
  const me = user?.id ?? '';
  const { team } = useTeam();
  const access = useAccess();
  const members = team?.members;
  const names = useMemo(() => new Map((members ?? []).map((m) => [m.id, m.name])), [members]);
  const nameOf = useCallback(
    (id: string) => (id === me ? null : (names.get(id) ?? 'Ehemaliges Mitglied')),
    [names, me],
  );
  const inTeam = access.inTeam;
  const employee = inTeam && access.role === 'mitarbeiter';
  const canWrite = access.can('aufgaben', 'write');
  const canToggle = useCallback(
    (todo: Todo) => canWrite || (employee && todo.assignee_id === me),
    [canWrite, employee, me],
  );
  return useMemo(
    () => ({
      me,
      inTeam,
      employee,
      canWrite,
      canAssign: inTeam && canWrite,
      others: (members ?? []).filter((m) => m.id !== me),
      nameOf,
      canToggle,
    }),
    [me, inTeam, employee, canWrite, members, nameOf, canToggle],
  );
}
