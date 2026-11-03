-- NEXORA: Angebote online annehmen + Versand per E-Mail aus der App
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: das Skript für Angebote & Rechnungen (20261104090000_business_documents.sql)
-- und für das Logo (20261105090000_business_logo.sql).

-- ---------------------------------------------------------------------------
-- 1. Angebots-Link: Wer den langen, geheimen Link kennt, sieht dieses eine
--    Angebot und kann es annehmen oder ablehnen – ohne Anmeldung.
--    Daten gibt es nur über die Funktionen unten, nie direkt aus der Tabelle.
-- ---------------------------------------------------------------------------
alter table public.documents add column if not exists public_token text;
alter table public.documents add column if not exists accepted_at timestamptz;
alter table public.documents add column if not exists accepted_name text;
alter table public.documents add column if not exists declined_at timestamptz;
alter table public.documents add column if not exists decline_note text;

create unique index if not exists documents_public_token_idx on public.documents (public_token)
  where public_token is not null;

alter table public.documents drop constraint if exists documents_public_token_check;
alter table public.documents add constraint documents_public_token_check check (
  public_token is null or (kind = 'offer' and public_token ~ '^[A-Za-z0-9_-]{32,64}$')
);
alter table public.documents drop constraint if exists documents_answer_check;
alter table public.documents add constraint documents_answer_check check (
  (accepted_at is null or declined_at is null)
  and (accepted_at is null or char_length(trim(coalesce(accepted_name, ''))) between 2 and 100)
  and (decline_note is null or char_length(decline_note) <= 1000)
);

-- Der Nutzer darf den Link setzen oder zurückziehen (sonst nur "bezahlt am")
grant update (paid_at, public_token) on public.documents to authenticated;

-- Angebot über den Link ansehen (für die öffentliche Angebotsseite)
create or replace function public.offer_view(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', d.number,
    'issued_on', d.issued_on,
    'valid_until', d.due_on,
    'total', d.total,
    'data', d.data,
    'accepted_at', d.accepted_at,
    'accepted_name', d.accepted_name,
    'declined_at', d.declined_at,
    'decline_note', d.decline_note,
    'logo', (
      select jsonb_build_object('mime', l.mime, 'data', l.data, 'width', l.width, 'height', l.height)
      from public.business_logos l
      where l.user_id = d.user_id and l.id::text = d.data -> 'seller' ->> 'logo_id'
    )
  )
  from public.documents d
  where p_token ~ '^[A-Za-z0-9_-]{32,64}$' and d.public_token = p_token and d.kind = 'offer';
$$;

-- Angebot annehmen: vermerkt Name und Zeitpunkt und setzt den Auftrag weiter
create or replace function public.offer_accept(p_token text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  v_name text := trim(coalesce(p_name, ''));
begin
  if p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into d from public.documents where public_token = p_token and kind = 'offer' for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if d.accepted_at is not null then return jsonb_build_object('error', 'already_accepted'); end if;
  if d.declined_at is not null then return jsonb_build_object('error', 'already_declined'); end if;
  if d.due_on is not null and d.due_on < current_date then return jsonb_build_object('error', 'expired'); end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then return jsonb_build_object('error', 'invalid_name'); end if;

  update public.documents set accepted_at = now(), accepted_name = v_name where id = d.id;
  if d.order_id is not null then
    update public.orders set offer_sent = true, offer_accepted = true where id = d.order_id and user_id = d.user_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Angebot ablehnen (mit optionaler Nachricht)
create or replace function public.offer_decline(p_token text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
begin
  if p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into d from public.documents where public_token = p_token and kind = 'offer' for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if d.accepted_at is not null then return jsonb_build_object('error', 'already_accepted'); end if;
  if d.declined_at is not null then return jsonb_build_object('error', 'already_declined'); end if;
  update public.documents
    set declined_at = now(), decline_note = nullif(left(trim(coalesce(p_note, '')), 1000), '')
    where id = d.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.offer_view(text) from public;
revoke all on function public.offer_accept(text, text) from public;
revoke all on function public.offer_decline(text, text) from public;
grant execute on function public.offer_view(text) to anon, authenticated;
grant execute on function public.offer_accept(text, text) to anon, authenticated;
grant execute on function public.offer_decline(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Versandprotokoll: was die App per E-Mail verschickt hat (auch als
--    Bremse gegen zu viele E-Mails in kurzer Zeit)
-- ---------------------------------------------------------------------------
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  kind text not null check (kind in ('offer', 'invoice', 'reminder', 'review', 'other')),
  to_email text not null check (char_length(to_email) between 3 and 320),
  subject text not null check (char_length(subject) between 1 and 200),
  provider_id text check (char_length(provider_id) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists email_log_user_idx on public.email_log (user_id, created_at desc);

alter table public.email_log enable row level security;

drop policy if exists "email_log_select_own" on public.email_log;
create policy "email_log_select_own" on public.email_log
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "email_log_insert_own" on public.email_log;
create policy "email_log_insert_own" on public.email_log
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())))
  );

-- Protokoll: lesen und anlegen – nicht ändern oder löschen
grant select, insert on public.email_log to authenticated;
