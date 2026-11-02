-- NEXORA: Fortschritt im Gründer-Fahrplan (welche Schritte erledigt sind)
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.

create table if not exists public.roadmap_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Schlüssel des Schritts aus der App (src/features/roadmap/content.ts)
  step_key text not null check (step_key ~ '^[a-z0-9_]{1,64}$'),
  completed_at timestamptz not null default now(),
  primary key (user_id, step_key)
);

comment on table public.roadmap_progress is 'Erledigte Schritte im Gründer-Fahrplan pro Nutzer';

-- Zugriff: jeder sieht und ändert ausschließlich seinen eigenen Fortschritt
alter table public.roadmap_progress enable row level security;

drop policy if exists "roadmap_select_own" on public.roadmap_progress;
create policy "roadmap_select_own" on public.roadmap_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "roadmap_insert_own" on public.roadmap_progress;
create policy "roadmap_insert_own" on public.roadmap_progress
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "roadmap_update_own" on public.roadmap_progress;
create policy "roadmap_update_own" on public.roadmap_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "roadmap_delete_own" on public.roadmap_progress;
create policy "roadmap_delete_own" on public.roadmap_progress
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.roadmap_progress to authenticated;
