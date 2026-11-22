-- Arbeitsplan: Einsätze (Baustelle/Ort, mehrere Leute, Teamleiter) und fertiger Wochenplan
-- Voraussetzung: 20261128090000_teams.sql (work_shifts, nexora_workspace, nexora_guard_write).
--
-- * Einsatz = mehrere Schichten mit derselben assignment_id: gleicher Tag, gleiche Zeit,
--   gleicher Ort – je Person eine Zeile (so zählen Stunden und Abwesenheiten weiter je Person).
--   Eine Person im Einsatz kann Teamleiter sein (is_lead).
-- * Fertiger Plan (work_plans): Wer Personal verwaltet, stellt eine Woche fertig. Dabei wird
--   der Plan so festgehalten, wie er ist (snapshot) – daraus macht die App das PDF. Mitarbeiter
--   sehen nur fertige Pläne, nicht den Entwurf. Wird später geändert und nochmal fertiggestellt,
--   steigt die Version.
--
-- Läuft als eine Transaktion: Klappt etwas nicht, bleibt alles wie vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Einsätze
-- ---------------------------------------------------------------------------
alter table public.work_shifts add column if not exists site text;
alter table public.work_shifts add column if not exists address text;
alter table public.work_shifts add column if not exists assignment_id uuid;
alter table public.work_shifts add column if not exists is_lead boolean not null default false;

alter table public.work_shifts drop constraint if exists work_shifts_site_check;
alter table public.work_shifts add constraint work_shifts_site_check check (site is null or char_length(site) between 1 and 160);
alter table public.work_shifts drop constraint if exists work_shifts_address_check;
alter table public.work_shifts add constraint work_shifts_address_check check (address is null or char_length(address) between 1 and 200);

create index if not exists work_shifts_assignment_idx on public.work_shifts (assignment_id) where assignment_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Fertige Wochenpläne
-- ---------------------------------------------------------------------------
create table if not exists public.work_plans (
  company_id uuid not null default public.nexora_workspace() references public.companies (id) on delete cascade,
  -- Montag der Woche
  week_start date not null check (extract(isodow from week_start) = 1),
  version integer not null default 1 check (version >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 400000),
  published_by uuid default auth.uid() references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  primary key (company_id, week_start)
);
alter table public.work_plans enable row level security;
revoke all on public.work_plans from anon, authenticated;
grant select, insert, update, delete on public.work_plans to authenticated;

-- Lesen: alle in der Firma. Schreiben: nur wer Personal verwaltet (Trigger) und mit Team-Abo.
drop policy if exists "work_plans_select" on public.work_plans;
create policy "work_plans_select" on public.work_plans
  for select to authenticated using (company_id = (select public.nexora_workspace()));
drop policy if exists "work_plans_insert" on public.work_plans;
create policy "work_plans_insert" on public.work_plans
  for insert to authenticated
  with check (company_id = (select public.nexora_workspace()) and (select public.nexora_team_plan_ok(company_id)));
drop policy if exists "work_plans_update" on public.work_plans;
create policy "work_plans_update" on public.work_plans
  for update to authenticated
  using (company_id = (select public.nexora_workspace()))
  with check (company_id = (select public.nexora_workspace()) and (select public.nexora_team_plan_ok(company_id)));
drop policy if exists "work_plans_delete" on public.work_plans;
create policy "work_plans_delete" on public.work_plans
  for delete to authenticated using (company_id = (select public.nexora_workspace()));

drop trigger if exists nexora_guard_write on public.work_plans;
create trigger nexora_guard_write before insert or update or delete on public.work_plans
  for each row execute function public.nexora_guard_write('personal');

-- Woche fertigstellen (bzw. nochmal, dann Version + 1). Läuft mit den Rechten der Person:
-- Regeln und Trigger oben gelten.
create or replace function public.work_plan_publish(p_week date, p_snapshot jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.work_plans;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.work_plans (company_id, week_start, snapshot)
  values (public.nexora_workspace(), p_week, p_snapshot)
  on conflict (company_id, week_start) do update
    set snapshot = excluded.snapshot,
        version = public.work_plans.version + 1,
        published_at = now(),
        published_by = auth.uid()
  returning * into r;
  return jsonb_build_object('version', r.version, 'published_at', r.published_at);
end;
$$;
revoke all on function public.work_plan_publish(date, jsonb) from public, anon;
grant execute on function public.work_plan_publish(date, jsonb) to authenticated;

commit;
