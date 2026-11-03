-- NEXORA: Belege zu Ausgaben (Foto oder PDF)
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: das Skript für Finanzen (20261106090000_finances.sql).
--
-- Die Dateien liegen im privaten Speicher "receipts" (Supabase Storage),
-- jeder Nutzer in seinem eigenen Ordner: <Nutzer-ID>/<Datei>. Nur der
-- Nutzer selbst kann sie hochladen, ansehen und löschen.

-- ---------------------------------------------------------------------------
-- Speicher (privat, höchstens 10 MB je Datei, nur Bilder und PDF)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts_select_own" on storage.objects;
create policy "receipts_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "receipts_update_own" on storage.objects;
create policy "receipts_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Beleg an der Ausgabe: Pfad im Speicher (nur im eigenen Ordner) und Art
-- ---------------------------------------------------------------------------
alter table public.expenses add column if not exists receipt_path text;
alter table public.expenses add column if not exists receipt_mime text;

alter table public.expenses drop constraint if exists expenses_receipt_check;
alter table public.expenses add constraint expenses_receipt_check check (
  (receipt_path is null and receipt_mime is null)
  or (
    receipt_path is not null
    and receipt_mime is not null
    and receipt_mime in ('image/jpeg', 'image/png', 'application/pdf')
    and receipt_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|pdf)$'
    and split_part(receipt_path, '/', 1) = user_id::text
  )
);
