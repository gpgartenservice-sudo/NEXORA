-- NEXORA: Zahlungserinnerungen, Mahnungen und Bewertungsbitten
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: das Skript für Angebote & Rechnungen (20261104090000_business_documents.sql).

-- ---------------------------------------------------------------------------
-- Was zu einer Rechnung nachträglich verschickt wurde:
--   reminder = Zahlungserinnerung, dunning1 = 1. Mahnung,
--   dunning2 = letzte Mahnung, review = Bitte um eine Bewertung
-- Die Rechnung selbst bleibt unverändert.
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'dunning1', 'dunning2', 'review')),
  -- Mahngebühr in Euro (nur Mahnungen)
  fee numeric(10, 2) not null default 0 check (fee >= 0 and fee <= 1000),
  -- neue Zahlungsfrist (Erinnerung/Mahnung)
  new_due_on date,
  sent_on date not null default current_date,
  created_at timestamptz not null default now(),
  check (kind = 'review' or new_due_on is not null),
  check (kind <> 'review' or fee = 0)
);

create index if not exists invoice_followups_document_idx on public.invoice_followups (document_id, sent_on);
create index if not exists invoice_followups_user_idx on public.invoice_followups (user_id, sent_on desc);

alter table public.invoice_followups enable row level security;

drop policy if exists "invoice_followups_select_own" on public.invoice_followups;
create policy "invoice_followups_select_own" on public.invoice_followups
  for select to authenticated using ((select auth.uid()) = user_id);
-- nur zu eigenen Rechnungen (keine Angebote)
drop policy if exists "invoice_followups_insert_own" on public.invoice_followups;
create policy "invoice_followups_insert_own" on public.invoice_followups
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.user_id = (select auth.uid()) and d.kind = 'invoice'
    )
  );
drop policy if exists "invoice_followups_delete_own" on public.invoice_followups;
create policy "invoice_followups_delete_own" on public.invoice_followups
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Vermerke werden nicht geändert – nur angelegt oder (zum Rückgängigmachen) gelöscht
grant select, insert, delete on public.invoice_followups to authenticated;

-- ---------------------------------------------------------------------------
-- Link für Bewertungen (z. B. Google-Unternehmensprofil) in den Firmendaten
-- ---------------------------------------------------------------------------
alter table public.business_settings add column if not exists review_url text;
alter table public.business_settings drop constraint if exists business_settings_review_url_check;
alter table public.business_settings add constraint business_settings_review_url_check
  check (review_url is null or (char_length(review_url) <= 500 and review_url ~* '^https://'));
