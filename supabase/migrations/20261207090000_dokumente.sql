-- Lunaxora: Dokumente der Firma (Gewerbeanmeldung, ELSTER-Zertifikat, Versicherungen, Verträge …)
--
-- Im Supabase-Dashboard -> SQL Editor einfügen und ausführen. Darf mehrfach laufen.
-- Voraussetzung: alle bisherigen Skripte bis 20261206090000_konto_loeschen.sql.
-- Danach die Funktion "account" neu einspielen (löscht beim Konto-Löschen auch diese Dateien).
--
-- * Tabelle business_files: ein Eintrag je Datei, gehört zur Firma (user_id = Firmen-ID).
-- * Die Dateien liegen im privaten Speicher "business-files": <Firmen-ID>/<Datei-ID>.<Endung>.
-- * Sehen, hochladen, ändern und löschen dürfen nur Inhaber und Mitgründer der Firma –
--   Mitarbeiter nie (auch nicht mit Rechten), weil hier Zugangsdaten wie das ELSTER-Zertifikat liegen.
-- * Höchstens 20 MB je Datei und 500 Dateien je Firma.
--
-- Läuft als eine Transaktion: Klappt etwas nicht, bleibt alles wie vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Speicher (privat): PDF, Fotos, ELSTER-Zertifikat (.pfx/.p12), Word, Excel
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-files', 'business-files', false, 20971520, array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/x-pkcs12',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ist der angemeldete Nutzer Inhaber oder Mitgründer der Firma, der der Ordner gehört?
create or replace function public.nexora_employer_folder(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if f !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.nexora_is_employer(f::uuid);
end;
$$;
revoke all on function public.nexora_employer_folder(text) from public, anon;
grant execute on function public.nexora_employer_folder(text) to authenticated;

drop policy if exists "business_files_select" on storage.objects;
create policy "business_files_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'business-files' and public.nexora_employer_folder(name));
drop policy if exists "business_files_insert" on storage.objects;
create policy "business_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-files' and public.nexora_employer_folder(name));
drop policy if exists "business_files_update" on storage.objects;
create policy "business_files_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'business-files' and public.nexora_employer_folder(name))
  with check (bucket_id = 'business-files' and public.nexora_employer_folder(name));
drop policy if exists "business_files_delete" on storage.objects;
create policy "business_files_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-files' and public.nexora_employer_folder(name));

-- ---------------------------------------------------------------------------
-- 2. Tabelle: Titel, Bereich, gültig bis, Notiz – und wo die Datei liegt
-- ---------------------------------------------------------------------------
create table if not exists public.business_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.nexora_workspace() references public.companies (id) on delete cascade,
  category text not null default 'sonstiges',
  title text not null,
  note text,
  valid_until date,
  file_path text not null,
  file_name text not null,
  mime text not null,
  size_bytes integer not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_files_user_idx on public.business_files (user_id, created_at desc);
create unique index if not exists business_files_path_key on public.business_files (file_path);

alter table public.business_files drop constraint if exists business_files_category_check;
alter table public.business_files add constraint business_files_category_check
  check (category in ('gewerbe', 'finanzamt', 'versicherung', 'vertrag', 'bank', 'nachweis', 'sonstiges'));
alter table public.business_files drop constraint if exists business_files_title_check;
alter table public.business_files add constraint business_files_title_check
  check (char_length(btrim(title)) between 1 and 120);
alter table public.business_files drop constraint if exists business_files_note_check;
alter table public.business_files add constraint business_files_note_check
  check (note is null or char_length(note) <= 1000);
alter table public.business_files drop constraint if exists business_files_name_check;
alter table public.business_files add constraint business_files_name_check
  check (char_length(file_name) between 1 and 200);
alter table public.business_files drop constraint if exists business_files_mime_check;
alter table public.business_files add constraint business_files_mime_check
  check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'application/x-pkcs12',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
alter table public.business_files drop constraint if exists business_files_size_check;
alter table public.business_files add constraint business_files_size_check
  check (size_bytes between 1 and 20971520);
-- Datei nur im Ordner der eigenen Firma
alter table public.business_files drop constraint if exists business_files_path_check;
alter table public.business_files add constraint business_files_path_check check (
  file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|pfx|docx|xlsx)$'
  and split_part(file_path, '/', 1) = user_id::text);

drop trigger if exists business_files_updated_at on public.business_files;
create trigger business_files_updated_at before update on public.business_files
  for each row execute function public.set_updated_at();

-- höchstens 500 Dateien je Firma
create or replace function public.nexora_business_files_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('business_files:' || new.user_id::text));
  if (select count(*) from public.business_files where user_id = new.user_id) >= 500 then
    raise exception 'files_limit' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_business_files_limit() from public, anon, authenticated;
drop trigger if exists business_files_limit on public.business_files;
create trigger business_files_limit before insert on public.business_files
  for each row execute function public.nexora_business_files_limit();

-- ---------------------------------------------------------------------------
-- 3. Wer darf was: nur Inhaber und Mitgründer der gerade offenen Firma
-- ---------------------------------------------------------------------------
alter table public.business_files enable row level security;

drop policy if exists "business_files_select" on public.business_files;
create policy "business_files_select" on public.business_files
  for select to authenticated
  using (user_id = public.nexora_workspace() and public.nexora_is_employer(user_id));
drop policy if exists "business_files_insert" on public.business_files;
create policy "business_files_insert" on public.business_files
  for insert to authenticated
  with check (user_id = public.nexora_workspace() and public.nexora_is_employer(user_id));
drop policy if exists "business_files_update" on public.business_files;
create policy "business_files_update" on public.business_files
  for update to authenticated
  using (user_id = public.nexora_workspace() and public.nexora_is_employer(user_id))
  with check (user_id = public.nexora_workspace() and public.nexora_is_employer(user_id));
drop policy if exists "business_files_delete" on public.business_files;
create policy "business_files_delete" on public.business_files
  for delete to authenticated
  using (user_id = public.nexora_workspace() and public.nexora_is_employer(user_id));

-- Ändern: nur Titel, Bereich, gültig bis und Notiz – Datei, Firma und Uploader bleiben
revoke all on public.business_files from anon, authenticated;
grant select, delete on public.business_files to authenticated;
grant insert (user_id, category, title, note, valid_until, file_path, file_name, mime, size_bytes)
  on public.business_files to authenticated;
grant update (category, title, note, valid_until) on public.business_files to authenticated;

notify pgrst, 'reload schema';

commit;
