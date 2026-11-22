-- To-dos von der Leitung für Mitarbeiter, Stunden eintragen und neue Standard-Rechte für Mitarbeiter
-- Voraussetzung: 20261128090000_teams.sql (Rollen, nexora_may_in, work_shifts) und 20261130090000_krank_chat.sql.
--
-- * Standard-Rechte Mitarbeiter: Kunden, Firma und Finanzen aus, To-dos & Ziele nur ansehen.
--   Bestehende Firmen bekommen das einmalig auch (danach stellt der Admin es wie gewohnt um).
-- * To-dos: Inhaber und Mitgründer (und eine Teamleitung mit Recht „To-dos bearbeiten“) legen To-dos an,
--   auch für eine bestimmte Person (assignee_id). Mitarbeiter legen keine To-dos an, sehen nur ihre eigenen
--   und können sie nur abhaken (done_by = wer abgehakt hat).
-- * Stunden (work_hours): Jede Person trägt ihre Arbeitszeit ein (Tag, Beginn, Ende, Pause); die Leitung
--   (Recht „Personal“) sieht und korrigiert alle. Mitarbeiter können nur die letzten 62 Tage ändern.
--
-- Läuft als eine Transaktion: Klappt etwas nicht, bleibt alles wie vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Standard-Rechte
-- ---------------------------------------------------------------------------
create or replace function public.nexora_role_default(p_role text)
returns jsonb
language sql
immutable
as $$
  select case p_role
    when 'teamleitung' then
      '{"kunden":"write","auftraege":"write","termine":"write","aufgaben":"write","dokumente":"write","finanzen":"off",
        "lager":"write","social":"write","firma":"read","luna":"write","fahrplan":"off","personal":"write"}'::jsonb
    when 'mitarbeiter' then
      '{"kunden":"off","auftraege":"read","termine":"read","aufgaben":"read","dokumente":"off","finanzen":"off",
        "lager":"write","social":"off","firma":"off","luna":"off","fahrplan":"off","personal":"off"}'::jsonb
    else
      '{"kunden":"write","auftraege":"write","termine":"write","aufgaben":"write","dokumente":"write","finanzen":"write",
        "lager":"write","social":"write","firma":"write","luna":"write","fahrplan":"write","personal":"write"}'::jsonb
  end;
$$;
revoke all on function public.nexora_role_default(text) from public, anon, authenticated;

-- Nur beim ersten Mal (solange es die neue Spalte noch nicht gibt): gespeicherte Mitarbeiter-Rechte anpassen
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'todos' and column_name = 'assignee_id') then
    update public.team_roles
       set access = access || '{"kunden":"off","firma":"off","finanzen":"off","aufgaben":"read"}'::jsonb,
           updated_at = now()
     where role = 'mitarbeiter';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. To-dos: für wen, von wem, erledigt von wem
-- ---------------------------------------------------------------------------
alter table public.todos add column if not exists assignee_id uuid references auth.users (id) on delete set null;
alter table public.todos add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.todos add column if not exists done_by uuid references auth.users (id) on delete set null;
create index if not exists todos_assignee_idx on public.todos (assignee_id) where assignee_id is not null;

-- Schreiben: Mitarbeiter nur abhaken (eigene To-dos), alle anderen wie bisher mit Recht „To-dos bearbeiten“
create or replace function public.nexora_todo_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  company uuid;
  r text;
  fixed constant text[] := array['done', 'done_at', 'done_by', 'updated_at'];
begin
  if uid is null then return case when tg_op = 'DELETE' then old else new end; end if;
  company := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  r := public.nexora_member_role(company, uid);

  -- in eine andere Firma verschoben: auch dort das Recht prüfen
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id
     and not public.nexora_may_in(old.user_id, 'aufgaben', 'write') then
    raise exception 'role_forbidden:aufgaben' using errcode = 'PT403';
  end if;

  if r = 'mitarbeiter' then
    if tg_op <> 'UPDATE' then raise exception 'todo_employee_only' using errcode = 'PT403'; end if;
    if old.assignee_id is distinct from uid or not public.nexora_may_in(company, 'aufgaben', 'read') then
      raise exception 'todo_not_yours' using errcode = 'PT403';
    end if;
    if (to_jsonb(new) - fixed) <> (to_jsonb(old) - fixed) then
      raise exception 'todo_employee_only' using errcode = 'PT403';
    end if;
  elsif not public.nexora_may_in(company, 'aufgaben', 'write') then
    raise exception 'role_forbidden:aufgaben' using errcode = 'PT403';
  end if;

  if tg_op = 'DELETE' then return old; end if;

  -- Für wen: nur jemand aus der Firma (alte Einträge ausgeschiedener Leute bleiben bearbeitbar)
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and public.nexora_member_role(new.user_id, new.assignee_id) is null then
    raise exception 'assignee_not_member' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := uid;
  else
    new.created_by := old.created_by;
  end if;
  -- wer abgehakt hat
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_by := uid;
  elsif not new.done then
    new.done_by := null;
  else
    new.done_by := old.done_by;
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_todo_guard() from public, anon, authenticated;

drop trigger if exists nexora_guard_write on public.todos;
create trigger nexora_guard_write before insert or update or delete on public.todos
  for each row execute function public.nexora_todo_guard();

-- Lesen: Mitarbeiter sehen nur To-dos, die für sie sind (zusätzlich zu den bisherigen Regeln)
create or replace function public.nexora_todo_visible(p_company uuid, p_assignee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_assignee is not distinct from auth.uid()
      or coalesce(public.nexora_member_role(p_company, auth.uid()), '') <> 'mitarbeiter';
$$;
revoke all on function public.nexora_todo_visible(uuid, uuid) from public, anon;
grant execute on function public.nexora_todo_visible(uuid, uuid) to authenticated;

drop policy if exists "todos_select_assigned" on public.todos;
create policy "todos_select_assigned" on public.todos as restrictive
  for select to authenticated
  using (public.nexora_todo_visible(user_id, assignee_id));

-- ---------------------------------------------------------------------------
-- 3. Stunden
-- ---------------------------------------------------------------------------
create table if not exists public.work_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.nexora_workspace() references public.companies (id) on delete cascade,
  member_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  starts_at time not null,
  ends_at time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 600),
  -- Arbeitszeit ohne Pause (rechnet die Datenbank)
  minutes integer not null default 0,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- endet die Zeit vor dem Beginn, geht sie über Mitternacht
  check (ends_at <> starts_at)
);
create index if not exists work_hours_company_day_idx on public.work_hours (company_id, day);
create index if not exists work_hours_member_day_idx on public.work_hours (member_id, day);
alter table public.work_hours enable row level security;
revoke all on public.work_hours from anon, authenticated;
grant select, insert, update, delete on public.work_hours to authenticated;

drop policy if exists "work_hours_select" on public.work_hours;
create policy "work_hours_select" on public.work_hours
  for select to authenticated
  using (company_id = (select public.nexora_workspace())
         and (member_id = (select auth.uid()) or (select public.nexora_may('personal', 'write'))));
drop policy if exists "work_hours_insert" on public.work_hours;
create policy "work_hours_insert" on public.work_hours
  for insert to authenticated
  with check (company_id = (select public.nexora_workspace())
              and public.nexora_in_company(company_id, member_id)
              and (member_id = (select auth.uid()) or (select public.nexora_may('personal', 'write')))
              and (select public.nexora_team_plan_ok(company_id)));
drop policy if exists "work_hours_update" on public.work_hours;
create policy "work_hours_update" on public.work_hours
  for update to authenticated
  using (company_id = (select public.nexora_workspace())
         and (member_id = (select auth.uid()) or (select public.nexora_may('personal', 'write'))))
  with check (company_id = (select public.nexora_workspace())
              and public.nexora_in_company(company_id, member_id)
              and (member_id = (select auth.uid()) or (select public.nexora_may('personal', 'write'))));
drop policy if exists "work_hours_delete" on public.work_hours;
create policy "work_hours_delete" on public.work_hours
  for delete to authenticated
  using (company_id = (select public.nexora_workspace())
         and (member_id = (select auth.uid()) or (select public.nexora_may('personal', 'write'))));

-- Minuten ausrechnen; ohne Recht „Personal“ nur die letzten 62 Tage und nicht im Voraus
create or replace function public.nexora_work_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hr boolean := auth.uid() is null or public.nexora_may_in(coalesce(new.company_id, old.company_id), 'personal', 'write');
  m integer;
begin
  if not hr then
    if tg_op <> 'INSERT' and old.day < current_date - 62 then
      raise exception 'hours_locked' using errcode = 'PT403';
    end if;
    if tg_op <> 'DELETE' and (new.day < current_date - 62 or new.day > current_date + 1) then
      raise exception 'hours_day_invalid' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  m := (extract(epoch from (new.ends_at - new.starts_at)) / 60)::integer;
  if m <= 0 then m := m + 1440; end if;
  m := m - new.break_minutes;
  if m <= 0 then raise exception 'hours_invalid' using errcode = '22023'; end if;
  new.minutes := m;
  return new;
end;
$$;
revoke all on function public.nexora_work_hours() from public, anon, authenticated;

drop trigger if exists work_hours_check on public.work_hours;
create trigger work_hours_check before insert or update or delete on public.work_hours
  for each row execute function public.nexora_work_hours();
drop trigger if exists work_hours_updated_at on public.work_hours;
create trigger work_hours_updated_at before update on public.work_hours
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';

commit;
