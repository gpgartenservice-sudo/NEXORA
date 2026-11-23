-- =============================================================================
-- Lunaxora – Sicherheits-Fixes (Prüfung vom 23.11.2026) und Auftragsbestätigung
-- per E-Mail nach der Online-Annahme (§ 312f BGB)
--
-- Im Supabase-Dashboard -> SQL Editor einfügen und ausführen. Darf mehrfach
-- laufen. Danach die Edge Functions "mail" und "assistant" neu bereitstellen
-- (die neuen Fassungen brauchen dieses Skript – und dieses Skript die neuen
-- Fassungen: Kontingent-Rückgabe und Widerrufs-Mail gehen nur noch über den
-- Server).
--
--  1. Kontingent: zurückgeben nur noch der Server (vorher konnte jeder Nutzer
--     seinen Zähler selbst senken = Luna, Belege, Vorlesen ohne Grenze).
--     Spracherkennung zählt jetzt auch.
--  2. Belege im Speicher: Recht „Finanzen“ der Firma, der der Ordner gehört
--     (nicht der Firma aus der Kopfzeile der Anfrage).
--  3. Angebote/Rechnungen: in der App nur noch „bezahlt am“ und den
--     Angebots-Link ändern – Betrag, Nummer, Inhalt, Annahme, Widerruf nicht
--     (GoBD). Die Standard-Rechte von Supabase hatten alles erlaubt.
--  4. Versandprotokoll schreibt nur noch die Funktion "mail" (vor dem Versand).
--  5. Online-Widerruf: Bestätigungs-Mail nur noch über den Server; die Kopie
--     geht an die E-Mail aus den Firmendaten (nicht aus dem Angebot).
--  6. Auftragsbestätigung nach der Online-Annahme (§ 312f BGB): E-Mail-Adresse
--     bei der Annahme, Bestätigung mit Vertragsinhalt und Widerrufsbelehrung.
--  7. Team-Einladungen: 12 Zeichen, 14 Tage gültig. Gutscheine: höchstens 10
--     Fehlversuche pro Stunde.
--  8. Kalender-Abo: wer aus dem Team entfernt wird, verliert den Zugang
--     (der Link wird gelöscht und kann neu erstellt werden).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kontingent
-- ---------------------------------------------------------------------------
alter table public.usage_counters drop constraint if exists usage_counters_kind_check;
alter table public.usage_counters
  add constraint usage_counters_kind_check check (kind in ('nexy', 'receipt', 'voice', 'transcribe'));

create or replace function public.consume_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.nexora_account();
  p text;
  lim integer;
  m text := public.nexora_month();
  n integer;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if p_kind not in ('nexy', 'receipt', 'voice', 'transcribe') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  perform public.nexora_ensure_subscription(uid);
  p := public.nexora_plan(uid);
  lim := public.nexora_limit(p, p_kind);
  if p_kind in ('nexy', 'voice', 'transcribe') and not public.nexora_may('luna', 'write') then
    return jsonb_build_object('allowed', false, 'forbidden', true, 'plan', p, 'limit', lim, 'used', 0);
  end if;
  insert into public.usage_counters as u (user_id, month, kind, used)
  values (uid, m, p_kind, 1)
  on conflict (user_id, month, kind) do update set used = u.used + 1 where u.used < lim
  returning u.used into n;
  if n is null then
    return jsonb_build_object('allowed', false, 'plan', p, 'limit', lim,
      'used', (select used from public.usage_counters where user_id = uid and month = m and kind = p_kind));
  end if;
  -- account/month: damit der Server bei einem Fehler genau diesen Zähler zurückgeben kann
  return jsonb_build_object('allowed', true, 'plan', p, 'limit', lim, 'used', n, 'account', uid, 'month', m);
end;
$$;
revoke all on function public.consume_quota(text) from public, anon;
grant execute on function public.consume_quota(text) to authenticated;

-- alte Rückgabe: nicht mehr für Nutzer
revoke all on function public.refund_quota(text) from public, anon, authenticated;

create or replace function public.refund_quota_for(p_account uuid, p_kind text, p_month text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.usage_counters set used = used - 1
  where user_id = p_account and month = p_month and kind = p_kind and used > 0;
$$;
revoke all on function public.refund_quota_for(uuid, text, text) from public, anon, authenticated;
grant execute on function public.refund_quota_for(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Belege im Speicher: Rechte der Firma, der der Ordner gehört
-- ---------------------------------------------------------------------------
create or replace function public.nexora_may_folder(p_name text, p_area text, p_level text)
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
  return public.nexora_can_access(f::uuid) and public.nexora_may_in(f::uuid, p_area, p_level);
end;
$$;
revoke all on function public.nexora_may_folder(text, text, text) from public, anon;
grant execute on function public.nexora_may_folder(text, text, text) to authenticated;

do $$
declare
  r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'receipts_%' loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end;
$$;
create policy "receipts_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.nexora_may_folder(name, 'finanzen', 'read'));
create policy "receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.nexora_may_folder(name, 'finanzen', 'write'));
create policy "receipts_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and public.nexora_may_folder(name, 'finanzen', 'write'))
  with check (bucket_id = 'receipts' and public.nexora_may_folder(name, 'finanzen', 'write'));
create policy "receipts_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.nexora_may_folder(name, 'finanzen', 'write'));

-- ---------------------------------------------------------------------------
-- 3. Angebote/Rechnungen: anlegen nur über issue_document(), Antworten nur über
--    den Kunden-Link; in der App änderbar: nur "bezahlt am" und der Link
-- ---------------------------------------------------------------------------
revoke all on public.documents from anon, authenticated;
grant select on public.documents to authenticated;
grant update (paid_at, public_token) on public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Versandprotokoll: schreibt nur die Funktion "mail" (mit dem Server-Schlüssel,
--    VOR dem Versand – sonst zählt die Bremse nicht). Lesen bleibt.
-- ---------------------------------------------------------------------------
revoke all on public.email_log from anon, authenticated;
grant select on public.email_log to authenticated;
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('offer', 'invoice', 'reminder', 'review', 'invite', 'other', 'acceptance', 'withdrawal'));

-- ---------------------------------------------------------------------------
-- 5. + 6. Kunden-Link: Bestätigungs-Mails nur über den Server
-- ---------------------------------------------------------------------------
alter table public.documents add column if not exists accepted_email text;
alter table public.documents add column if not exists acceptance_mails smallint not null default 0;
alter table public.documents add column if not exists acceptance_mailed_at timestamptz;
alter table public.documents drop constraint if exists documents_acceptance_mail_check;
alter table public.documents add constraint documents_acceptance_mail_check check (
  (accepted_email is null or (char_length(accepted_email) <= 254 and accepted_at is not null))
  and acceptance_mails between 0 and 3
);

-- Absender für Kunden-Mails: Name/Anschrift aus dem Angebot, E-Mail aus den Firmendaten
create or replace function public.nexora_offer_seller(d public.documents)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (coalesce(d.data -> 'seller', '{}'::jsonb) - 'email')
         || jsonb_build_object('email', (select nullif(trim(b.email), '') from public.business_settings b where b.user_id = d.user_id));
$$;
revoke all on function public.nexora_offer_seller(public.documents) from public, anon, authenticated;

-- Annahme: jetzt mit E-Mail für die Bestätigung (freiwillig für die Datenbank,
-- die Angebotsseite verlangt sie bei Privatkunden)
drop function if exists public.offer_accept(text, text);
create or replace function public.offer_accept(p_token text, p_name text, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  v_name text := trim(coalesce(p_name, ''));
  v_email text := nullif(trim(coalesce(p_email, '')), '');
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
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^[:space:]@<>()",;:]+@[^[:space:]@<>()",;:]+\.[^[:space:]@<>()",;:]{2,}$') then
    return jsonb_build_object('error', 'invalid_email');
  end if;

  update public.documents set accepted_at = now(), accepted_name = v_name, accepted_email = v_email where id = d.id;
  if d.order_id is not null then
    update public.orders set offer_sent = true, offer_accepted = true where id = d.order_id and user_id = d.user_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Daten für die Auftragsbestätigung (zählt einen Versuch, höchstens 3)
create or replace function public.offer_acceptance_mail(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into d from public.documents where public_token = p_token and kind = 'offer' for update;
  if not found or d.accepted_at is null or d.accepted_email is null then return jsonb_build_object('error', 'not_found'); end if;
  if d.acceptance_mailed_at is not null then return jsonb_build_object('error', 'already_sent'); end if;
  if d.acceptance_mails >= 3 then return jsonb_build_object('error', 'too_many'); end if;
  update public.documents set acceptance_mails = acceptance_mails + 1 where id = d.id;
  return jsonb_build_object(
    'document_id', d.id,
    'company_id', d.user_id,
    'number', d.number,
    'issued_on', d.issued_on,
    'valid_until', d.due_on,
    'accepted_at', d.accepted_at,
    'accepted_name', d.accepted_name,
    'accepted_email', d.accepted_email,
    'data', d.data - 'seller',
    'seller', public.nexora_offer_seller(d)
  );
end;
$$;

create or replace function public.offer_acceptance_mailed(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.documents
     set acceptance_mailed_at = now()
   where public_token = p_token and kind = 'offer' and accepted_at is not null and acceptance_mailed_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- Widerruf: Absender-E-Mail aus den Firmendaten
create or replace function public.offer_withdrawal_mail(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into d from public.documents where public_token = p_token and kind = 'offer' for update;
  if not found or d.withdrawn_at is null then return jsonb_build_object('error', 'not_found'); end if;
  if d.withdrawal_mailed_at is not null then return jsonb_build_object('error', 'already_sent'); end if;
  if d.withdrawal_mails >= 3 then return jsonb_build_object('error', 'too_many'); end if;
  update public.documents set withdrawal_mails = withdrawal_mails + 1 where id = d.id;
  return jsonb_build_object(
    'document_id', d.id,
    'company_id', d.user_id,
    'number', d.number,
    'issued_on', d.issued_on,
    'accepted_at', d.accepted_at,
    'withdrawn_at', d.withdrawn_at,
    'withdrawal', d.withdrawal,
    'seller', public.nexora_offer_seller(d)
  );
end;
$$;

-- Angebotsseite: sieht auch, ob die Auftragsbestätigung raus ist
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
    'accepted_email', d.accepted_email,
    'acceptance_mailed_at', d.acceptance_mailed_at,
    'declined_at', d.declined_at,
    'decline_note', d.decline_note,
    'withdrawn_at', d.withdrawn_at,
    'withdrawal', d.withdrawal,
    'withdrawal_mailed_at', d.withdrawal_mailed_at,
    'withdrawal_open', public.nexora_withdrawal_open(d),
    'logo', (
      select jsonb_build_object('mime', l.mime, 'data', l.data, 'width', l.width, 'height', l.height)
      from public.business_logos l
      where l.user_id = d.user_id and l.id::text = d.data -> 'seller' ->> 'logo_id'
    )
  )
  from public.documents d
  where p_token ~ '^[A-Za-z0-9_-]{32,64}$' and d.public_token = p_token and d.kind = 'offer';
$$;

revoke all on function public.offer_view(text) from public;
revoke all on function public.offer_accept(text, text, text) from public;
revoke all on function public.offer_acceptance_mail(text) from public, anon, authenticated;
revoke all on function public.offer_acceptance_mailed(text) from public, anon, authenticated;
revoke all on function public.offer_withdrawal_mail(text) from public, anon, authenticated;
revoke all on function public.offer_withdrawal_mailed(text) from public, anon, authenticated;
grant execute on function public.offer_view(text) to anon, authenticated;
grant execute on function public.offer_accept(text, text, text) to anon, authenticated;
grant execute on function public.offer_acceptance_mail(text) to service_role;
grant execute on function public.offer_acceptance_mailed(text) to service_role;
grant execute on function public.offer_withdrawal_mail(text) to service_role;
grant execute on function public.offer_withdrawal_mailed(text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Codes: Team-Einladungen länger und befristet, Gutscheine mit Bremse
-- ---------------------------------------------------------------------------
-- Zufallscode aus 32 gut lesbaren Zeichen (ohne I, O, 0, 1), 5 Bit je Zeichen,
-- aus der sicheren Zufallsquelle von gen_random_uuid()
create or replace function public.nexora_random_code(p_len integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- Bytes ohne die festen Versions-/Varianten-Bits der UUIDs (6, 8, 22, 24)
  pos constant integer[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15,
                                  16, 17, 18, 19, 20, 21, 23, 25, 26, 27, 28, 29, 30, 31];
  b bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  v_out text := '';
  i integer;
begin
  for i in 1 .. least(greatest(p_len, 1), array_length(pos, 1)) loop
    v_out := v_out || substr(alphabet, (get_byte(b, pos[i]) % 32) + 1, 1);
  end loop;
  return v_out;
end;
$$;
revoke all on function public.nexora_random_code(integer) from public, anon, authenticated;

alter table public.team_invites drop constraint if exists team_invites_code_check;
alter table public.team_invites add constraint team_invites_code_check
  check (code ~ '^[A-Z0-9]{8}$' or code ~ '^[A-Z2-9]{12}$');
alter table public.team_invites add column if not exists expires_at timestamptz;
update public.team_invites set expires_at = now() + interval '14 days' where expires_at is null and accepted_by is null;
alter table public.team_invites alter column expires_at set default now() + interval '14 days';

create or replace function public.team_invite(p_email text, p_role text default 'mitarbeiter')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid := public.nexora_workspace();
  me text;
  acct uuid;
  v_role text := coalesce(nullif(trim(p_role), ''), 'mitarbeiter');
  used integer;
  new_code text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  me := public.nexora_member_role(ws, uid);
  if me is null or me not in ('inhaber', 'mitgruender') then
    raise exception 'team_member_cannot_invite' using errcode = 'PT403';
  end if;
  if v_role not in ('mitgruender', 'teamleitung', 'mitarbeiter') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if v_role = 'mitgruender' and me <> 'inhaber' then raise exception 'owner_only' using errcode = 'PT403'; end if;
  acct := (select c.owner_id from public.companies c where c.id = ws);
  -- Business und Teams (in der Testphase zum Ausprobieren ebenfalls)
  if public.nexora_plan(acct) not in ('business', 'teams', 'trial') then raise exception 'business_required' using errcode = 'PT402'; end if;
  perform 1 from public.subscriptions where user_id = acct for update;
  -- abgelaufene Einladungen belegen keinen Platz mehr
  delete from public.team_invites where owner_id = acct and accepted_by is null and expires_at < now();
  select 1 + (select count(distinct member_id) from public.team_members where owner_id = acct)
           + (select count(*) from public.team_invites where owner_id = acct and accepted_by is null)
    into used;
  if used >= public.nexora_seats(acct) then raise exception 'team_full' using errcode = 'PT409'; end if;
  loop
    new_code := public.nexora_random_code(12);
    exit when not exists (select 1 from public.team_invites where code = new_code);
  end loop;
  insert into public.team_invites (code, owner_id, company_id, email, role, expires_at)
  values (new_code, acct, ws, nullif(trim(p_email), ''), v_role, now() + interval '14 days');
  return new_code;
end;
$$;

create or replace function public.team_join(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.team_invites;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  select * into inv from public.team_invites where code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')) for update;
  if not found or inv.accepted_by is not null or (inv.expires_at is not null and inv.expires_at < now()) then
    raise exception 'invite_invalid' using errcode = 'PT404';
  end if;
  if inv.owner_id = uid then raise exception 'invite_own' using errcode = 'PT409'; end if;
  insert into public.team_members (member_id, owner_id, company_id, role) values (uid, inv.owner_id, inv.company_id, inv.role)
  on conflict (member_id, company_id) do nothing;
  update public.team_invites set accepted_by = uid, accepted_at = now() where code = inv.code;
  return jsonb_build_object('owner_id', inv.company_id, 'company_id', inv.company_id,
                            'owner_name', public.nexora_company_name(inv.company_id), 'role', inv.role);
end;
$$;

-- Fehlversuche (z. B. Gutscheincodes raten)
create table if not exists public.nexora_attempts (
  user_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists nexora_attempts_idx on public.nexora_attempts (user_id, kind, at desc);
alter table public.nexora_attempts enable row level security;
revoke all on public.nexora_attempts from anon, authenticated;

-- Gutschein: falscher Code = Antwort statt Fehler, damit der Fehlversuch gespeichert bleibt
create or replace function public.redeem_voucher(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v public.vouchers;
  s public.subscriptions;
  until timestamptz;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if (select count(*) from public.nexora_attempts a
       where a.user_id = uid and a.kind = 'voucher' and a.at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;
  select * into v from public.vouchers where code = upper(trim(p_code)) for update;
  if not found then
    insert into public.nexora_attempts (user_id, kind) values (uid, 'voucher');
    delete from public.nexora_attempts where at < now() - interval '7 days';
    return jsonb_build_object('error', 'voucher_invalid');
  end if;
  if v.redeemed_by is not null then raise exception 'voucher_used' using errcode = 'PT409'; end if;
  perform public.nexora_ensure_subscription(uid);
  select * into s from public.subscriptions where user_id = uid for update;
  if s.source = 'stripe' and s.status = 'active' then raise exception 'voucher_paid' using errcode = 'PT409'; end if;
  until := greatest(now(), coalesce(case when s.status = 'active' then s.current_period_end end, now()))
           + make_interval(months => v.months);
  update public.subscriptions
     set status = 'active', tier = v.tier, source = 'voucher', current_period_end = until, updated_at = now()
   where user_id = uid;
  update public.vouchers set redeemed_by = uid, redeemed_at = now() where code = v.code;
  return jsonb_build_object('months', v.months, 'tier', v.tier, 'until', until);
end;
$$;
-- Neue Gutscheine bitte so anlegen (60 Bit statt 24):
--   insert into public.vouchers (code, months, tier, note)
--   values ('LUNA-' || public.nexora_random_code(12), 3, 'pro', 'Notiz');

-- ---------------------------------------------------------------------------
-- 8. Aus dem Team entfernt: Kalender-Link der Firma ungültig machen
-- ---------------------------------------------------------------------------
create or replace function public.team_remove(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
  me text := public.nexora_member_role(ws, auth.uid());
  target text := (select m.role from public.team_members m where m.company_id = ws and m.member_id = p_member);
begin
  if me is null or me not in ('inhaber', 'mitgruender') then raise exception 'not_team_admin' using errcode = 'PT403'; end if;
  if target is null then return; end if;
  if target = 'mitgruender' and me <> 'inhaber' then raise exception 'owner_only' using errcode = 'PT403'; end if;
  delete from public.team_members where member_id = p_member and company_id = ws;
  -- die Person kannte evtl. den Kalender-Link -> neu erstellen lassen
  delete from public.calendar_feeds where user_id = ws;
end;
$$;

revoke all on function public.team_invite(text, text) from public, anon;
revoke all on function public.team_join(text) from public, anon;
revoke all on function public.team_remove(uuid) from public, anon;
revoke all on function public.redeem_voucher(text) from public, anon;
grant execute on function public.team_invite(text, text) to authenticated;
grant execute on function public.team_join(text) to authenticated;
grant execute on function public.team_remove(uuid) to authenticated;
grant execute on function public.redeem_voucher(text) to authenticated;

notify pgrst, 'reload schema';
