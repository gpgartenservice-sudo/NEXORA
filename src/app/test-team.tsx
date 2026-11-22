// TESTSEITE – nur zum Ansehen ohne Login, wieder löschen
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { CrmProvider } from '@/features/crm/crm-provider';
import { AufgabenScreen } from '@/features/goals/aufgaben-screen';
import { GoalsProvider } from '@/features/goals/goals-provider';
import { TodoEditScreen } from '@/features/goals/todo-editor';
import { HoursPanel } from '@/features/team/hours-panel';
import { DEFAULT_ACCESS } from '@/features/team/roles';
import { TeamHubProvider } from '@/features/team/team-hub-provider';
import { TeamProvider } from '@/features/team/team-provider';
import { supabase } from '@/lib/supabase';
import { __AuthCtx } from '@/providers/auth-provider';

const MEMBERS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Tom Grau', role: 'inhaber', owner: true, vacation_days: null },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Pascal Pape', role: 'mitgruender', vacation_days: null },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Anna Berg', role: 'mitarbeiter', title: 'Azubi', vacation_days: 25 },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Ben Krüger', role: 'teamleitung', vacation_days: 28 },
];
const [TOM, PASCAL, ANNA, BEN] = MEMBERS.map((m) => m.id);
const WS = TOM;
const now = new Date().toISOString();
const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todo = (o: Record<string, unknown>) => ({
  id: `t${Math.random().toString(16).slice(2, 10)}-0000-0000-0000-000000000000`,
  user_id: WS,
  notes: null,
  due_on: null,
  important: false,
  done: false,
  done_at: null,
  customer_id: null,
  order_id: null,
  created_at: now,
  updated_at: now,
  assignee_id: null,
  created_by: TOM,
  done_by: null,
  ...o,
});
const db: Record<string, Record<string, unknown>[]> = {
  todos: [
    todo({ id: 'aaaaaaaa-0000-0000-0000-000000000001', title: 'Lager aufräumen', assignee_id: ANNA, due_on: day(0), important: true }),
    todo({ title: 'Rasenmäher zur Wartung bringen', assignee_id: ANNA, due_on: day(2), created_by: PASCAL }),
    todo({ title: 'Angebot Müller schreiben', assignee_id: TOM, due_on: day(0) }),
    todo({ title: 'Hecke Familie Klein', assignee_id: BEN, due_on: day(1) }),
    todo({ title: 'Steuerberater anrufen', due_on: day(-1) }),
    todo({ title: 'Werkzeug zählen', assignee_id: ANNA, done: true, done_by: ANNA, done_at: now }),
  ],
  goals: [],
  work_hours: [
    { id: 'h1', company_id: WS, member_id: ANNA, day: day(-1), starts_at: '07:00:00', ends_at: '15:30:00', break_minutes: 30, minutes: 480, note: 'Baustelle Müller', created_by: ANNA },
    { id: 'h2', company_id: WS, member_id: ANNA, day: day(-2), starts_at: '07:30:00', ends_at: '16:00:00', break_minutes: 45, minutes: 465, note: null, created_by: ANNA },
    { id: 'h3', company_id: WS, member_id: BEN, day: day(-1), starts_at: '06:00:00', ends_at: '14:00:00', break_minutes: 30, minutes: 450, note: null, created_by: TOM },
    { id: 'h4', company_id: WS, member_id: TOM, day: day(-1), starts_at: '08:00:00', ends_at: '12:00:00', break_minutes: 0, minutes: 240, note: 'Büro', created_by: TOM },
  ],
};
let me = TOM;

const minutesOf = (r: Record<string, unknown>) => {
  const t = (v: unknown) => {
    const [h, m] = String(v).split(':').map(Number);
    return h * 60 + m;
  };
  let m = t(r.ends_at) - t(r.starts_at);
  if (m <= 0) m += 1440;
  return m - Number(r.break_minutes ?? 0);
};
const visible = (table: string, r: Record<string, unknown>) => {
  const employee = MEMBERS.find((m) => m.id === me)?.role === 'mitarbeiter';
  if (table === 'todos' && employee) return r.assignee_id === me;
  if (table === 'work_hours' && employee) return r.member_id === me;
  return true;
};

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let payload: Record<string, unknown> = {};
  let single = false;
  const filters: ((r: Record<string, unknown>) => boolean)[] = [];
  const run = () => {
    const rows = (db[table] ??= []);
    if (op === 'insert') {
      const row: Record<string, unknown> = { id: `n${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: me, ...payload };
      if (table === 'work_hours') row.minutes = minutesOf(row);
      if (table === 'todos') Object.assign(row, todo({ ...payload, created_by: me }), { id: row.id });
      rows.push(row);
      return { data: single ? row : [row], error: null };
    }
    const hit = rows.filter((r) => visible(table, r) && filters.every((f) => f(r)));
    if (op === 'update') {
      for (const r of hit) {
        Object.assign(r, payload, { updated_at: new Date().toISOString() });
        if (table === 'work_hours') r.minutes = minutesOf(r);
        if (table === 'todos' && 'done' in payload) r.done_by = payload.done ? me : null;
      }
      return { data: single ? (hit[0] ?? null) : hit, error: null };
    }
    if (op === 'delete') {
      db[table] = rows.filter((r) => !hit.includes(r));
      return { data: null, error: null };
    }
    return { data: single ? (hit[0] ?? null) : hit, error: null };
  };
  const b: Record<string, unknown> = {};
  const chain = () => b;
  Object.assign(b, {
    select: chain,
    insert: (p: Record<string, unknown>) => ((op = 'insert'), (payload = p), b),
    update: (p: Record<string, unknown>) => ((op = 'update'), (payload = p), b),
    delete: () => ((op = 'delete'), b),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    gte: (k: string, v: string) => (filters.push((r) => String(r[k] ?? '') >= v), b),
    lte: (k: string, v: string) => (filters.push((r) => String(r[k] ?? '') <= v), b),
    not: chain,
    or: chain,
    in: chain,
    order: chain,
    limit: chain,
    range: chain,
    single: () => ((single = true), b),
    maybeSingle: () => ((single = true), b),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  });
  return b;
}

const sb = supabase as unknown as Record<string, unknown>;
sb.from = builder;
sb.rpc = async (name: string) => {
  if (name === 'my_team') {
    const mine = MEMBERS.find((m) => m.id === me)!;
    return {
      data: {
        role: me === TOM ? 'owner' : 'member',
        my_role: mine.role,
        owner_id: WS,
        owner_name: 'GP Gartenservice',
        plan: 'teams',
        seats: 30,
        members: MEMBERS,
        invites: [],
        access: mine.role === 'mitarbeiter' ? DEFAULT_ACCESS.mitarbeiter : mine.role === 'teamleitung' ? DEFAULT_ACCESS.teamleitung : null,
        roles: DEFAULT_ACCESS,
      },
      error: null,
    };
  }
  return { data: [], error: null };
};
const channel = () => {
  const c: Record<string, unknown> = {};
  Object.assign(c, {
    on: () => c,
    subscribe: () => c,
    presenceState: () => ({}),
    track: async () => {},
    untrack: async () => {},
    send: async () => {},
  });
  return c;
};
sb.channel = channel;
sb.removeChannel = async () => {};

export default function TestTeam() {
  const { as, view } = useLocalSearchParams<{ as?: string; view?: string }>();
  me = as === 'anna' ? ANNA : as === 'ben' ? BEN : TOM;
  return (
    <__AuthCtx.Provider value={{ session: {} as never, user: { id: me } as never, initializing: false }}>
      <TeamProvider userId={me} key={me}>
        <CrmProvider userId={WS}>
          <GoalsProvider userId={WS}>
            <TeamHubProvider>
              {view === 'hours' ? (
                <Screen maxWidth={860}>
                  <View style={{ gap: 16 }}>
                    <HoursPanel />
                  </View>
                </Screen>
              ) : view === 'edit' ? (
                <TodoEditScreen />
              ) : (
                <AufgabenScreen />
              )}
            </TeamHubProvider>
          </GoalsProvider>
        </CrmProvider>
      </TeamProvider>
    </__AuthCtx.Provider>
  );
}
