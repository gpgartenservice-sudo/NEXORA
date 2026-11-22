-- Teamleiter pro Einsatz statt fester Rolle „Teamleitung“
-- Voraussetzung: 20261128090000_teams.sql, 20261129090000_einsaetze.sql, 20261201090000_aufgaben_stunden.sql.
--
-- * Rollen: Inhaber, Mitgründer und Mitarbeiter. Wer bisher „Teamleitung“ war, ist jetzt Mitarbeiter
--   (gilt auch für offene Einladungen). Rechte stellt der Admin nur noch für Mitarbeiter ein.
-- * Ein Einsatz im Arbeitsplan kann zu einem Auftrag gehören (work_shifts.order_id).
-- * Der Teamleiter des Einsatzes darf diesen Auftrag abhaken oder wieder öffnen – sonst nichts daran ändern.
--   Alle anderen brauchen wie bisher das Recht „Aufträge bearbeiten“.
--
-- Läuft als eine Transaktion: Klappt etwas nicht, bleibt alles wie vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Keine feste Teamleitung mehr
-- ---------------------------------------------------------------------------
update public.team_members set role = 'mitarbeiter' where role = 'teamleitung';
update public.team_invites set role = 'mitarbeiter' where role = 'teamleitung';
delete from public.team_roles where role = 'teamleitung';

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('mitgruender', 'mitarbeiter'));
alter table public.team_invites drop constraint if exists team_invites_role_check;
alter table public.team_invites add constraint team_invites_role_check check (role in ('mitgruender', 'mitarbeiter'));
alter table public.team_roles drop constraint if exists team_roles_role_check;
alter table public.team_roles add constraint team_roles_role_check check (role = 'mitarbeiter');

-- ---------------------------------------------------------------------------
-- 2. Einsatz gehört zu einem Auftrag
-- ---------------------------------------------------------------------------
alter table public.work_shifts add column if not exists order_id uuid references public.orders (id) on delete set null;
create index if not exists work_shifts_order_idx on public.work_shifts (order_id) where order_id is not null;

-- Ist jemand Teamleiter eines Einsatzes zu diesem Auftrag (in derselben Firma)?
create or replace function public.nexora_is_order_lead(p_order uuid, p_company uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.work_shifts s
                  where s.order_id = p_order and s.company_id = p_company
                    and s.member_id = p_user and s.is_lead);
$$;
revoke all on function public.nexora_is_order_lead(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Aufträge schreiben: Recht „Aufträge bearbeiten“ – oder als Teamleiter nur abhaken
-- ---------------------------------------------------------------------------
create or replace function public.nexora_order_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  -- was der Teamleiter ändern darf (completed_on und updated_at setzt die Datenbank)
  fixed constant text[] := array['completed', 'completed_on', 'updated_at'];
begin
  if uid is null then return case when tg_op = 'DELETE' then old else new end; end if;

  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and not public.nexora_may_in(old.user_id, 'auftraege', 'write')
     and (to_jsonb(new) - fixed) = (to_jsonb(old) - fixed)
     and public.nexora_is_order_lead(old.id, old.user_id, uid) then
    return new;
  end if;

  if not public.nexora_may_in(case when tg_op = 'DELETE' then old.user_id else new.user_id end, 'auftraege', 'write') then
    raise exception 'role_forbidden:auftraege' using errcode = 'PT403';
  end if;
  -- in eine andere Firma verschoben: auch dort das Recht prüfen
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id
     and not public.nexora_may_in(old.user_id, 'auftraege', 'write') then
    raise exception 'role_forbidden:auftraege' using errcode = 'PT403';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.nexora_order_guard() from public, anon, authenticated;

drop trigger if exists nexora_guard_write on public.orders;
create trigger nexora_guard_write before insert or update or delete on public.orders
  for each row execute function public.nexora_order_guard();

-- Abhaken aus dem Arbeitsplan (geht auch ohne Recht „Aufträge ansehen“)
create or replace function public.order_lead_done(p_order uuid, p_done boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o public.orders;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  select * into o from public.orders where id = p_order;
  if not found or public.nexora_member_role(o.user_id, uid) is null then
    raise exception 'order_not_found' using errcode = 'PT404';
  end if;
  if not public.nexora_may_in(o.user_id, 'auftraege', 'write')
     and not public.nexora_is_order_lead(o.id, o.user_id, uid) then
    raise exception 'order_not_lead' using errcode = 'PT403';
  end if;
  if o.cancelled then raise exception 'order_cancelled' using errcode = '22023'; end if;
  update public.orders set completed = coalesce(p_done, true) where id = o.id returning * into o;
  return jsonb_build_object('id', o.id, 'title', o.title, 'completed', o.completed, 'completed_on', o.completed_on);
end;
$$;
revoke all on function public.order_lead_done(uuid, boolean) from public, anon;
grant execute on function public.order_lead_done(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
