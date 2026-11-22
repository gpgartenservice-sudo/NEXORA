-- Krankmeldungen + Team-Chat (Antworten, Gelesen, „schreibt gerade …“ und online)
-- Voraussetzung: 20261128090000_teams.sql (absences, team_messages, team_chat_reads, nexora_member_role).
--
-- * Krankmeldung: „beim Arzt gewesen“ (Krankschreibung/eAU kommt), die Leitung bestätigt mit
--   „Gesehen“ (seen_at), Mitarbeiter können die eigene Krankmeldung verlängern oder als
--   „wieder gesund“ verkürzen – dann sieht die Leitung sie wieder als neu.
-- * Chat: Antwort auf eine Nachricht (reply_to), wer bis wann gelesen hat (team_chat_readers),
--   Live-Kanäle für „schreibt gerade …“ und „online“ nur für Leute aus der Firma
--   (Supabase Realtime, private Kanäle „team:<Firma>“ und „team:<Firma>:<Chat>“).
--
-- Läuft als eine Transaktion: Klappt etwas nicht, bleibt alles wie vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Krankmeldungen
-- ---------------------------------------------------------------------------
alter table public.absences add column if not exists doctor boolean not null default false;
alter table public.absences add column if not exists seen_by uuid references auth.users (id) on delete set null;
-- Bisherige Krankmeldungen gelten als gesehen (nur beim ersten Mal, wenn es die Spalte noch nicht gibt)
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'absences' and column_name = 'seen_at') then
    alter table public.absences add column seen_at timestamptz;
    update public.absences set seen_at = created_at where kind = 'krank';
  end if;
end;
$$;

-- Status (und „gesehen“) setzt immer die Datenbank: krank = gemeldet, von Personal eingetragen =
-- genehmigt bzw. schon gesehen, sonst offen
create or replace function public.nexora_absence_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hr boolean := auth.uid() is not null and public.nexora_may('personal', 'write');
begin
  new.decided_by := null;
  new.decided_at := null;
  new.decision_note := null;
  new.seen_by := null;
  new.seen_at := null;
  if new.kind = 'krank' then
    new.status := 'gemeldet';
    if hr then
      new.seen_by := auth.uid();
      new.seen_at := now();
    end if;
  elsif hr then
    new.status := 'genehmigt';
    new.decided_by := auth.uid();
    new.decided_at := now();
  else
    new.doctor := false;
    new.status := 'offen';
  end if;
  return new;
end;
$$;
revoke all on function public.nexora_absence_status() from public, anon, authenticated;

-- Leitung: Krankmeldung gesehen
create or replace function public.absence_seen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if not public.nexora_may('personal', 'write') then raise exception 'role_forbidden:personal' using errcode = 'PT403'; end if;
  update public.absences
     set seen_by = auth.uid(), seen_at = now()
   where id = p_id and company_id = ws and kind = 'krank';
  if not found then raise exception 'absence_not_found' using errcode = 'PT404'; end if;
end;
$$;

-- Krankmeldung verlängern oder verkürzen („wieder gesund“): die eigene oder als Leitung jede.
-- Ändert die Person selbst, sieht die Leitung sie wieder als neu.
create or replace function public.absence_sick_update(p_id uuid, p_until date, p_doctor boolean default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := public.nexora_workspace();
  hr boolean := public.nexora_may('personal', 'write');
  a public.absences;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  select * into a from public.absences where id = p_id and company_id = ws and kind = 'krank' for update;
  if not found or (a.member_id <> auth.uid() and not hr) then
    raise exception 'absence_not_found' using errcode = 'PT404';
  end if;
  if p_until is null or p_until < a.starts_on or p_until - a.starts_on > 366 then
    raise exception 'invalid_until' using errcode = '22023';
  end if;
  update public.absences
     set ends_on = p_until,
         doctor = coalesce(p_doctor, doctor),
         seen_by = case when hr then auth.uid() else null end,
         seen_at = case when hr then now() else null end
   where id = p_id;
end;
$$;

revoke all on function public.absence_seen(uuid) from public, anon;
revoke all on function public.absence_sick_update(uuid, date, boolean) from public, anon;
grant execute on function public.absence_seen(uuid) to authenticated;
grant execute on function public.absence_sick_update(uuid, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Chat: Antworten
-- ---------------------------------------------------------------------------
alter table public.team_messages add column if not exists reply_to uuid references public.team_messages (id) on delete set null;

-- Nur Antworten auf Nachrichten aus demselben Chat – sonst ohne Bezug speichern
create or replace function public.nexora_chat_reply_check()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.team_messages t
     where t.id = new.reply_to
       and t.company_id = new.company_id
       and t.channel = new.channel
       and (new.channel <> 'direkt'
            or (least(t.sender_id, t.recipient_id) = least(new.sender_id, new.recipient_id)
                and greatest(t.sender_id, t.recipient_id) = greatest(new.sender_id, new.recipient_id)))) then
    new.reply_to := null;
  end if;
  return new;
end;
$$;
drop trigger if exists team_messages_reply on public.team_messages;
create trigger team_messages_reply before insert on public.team_messages
  for each row execute function public.nexora_chat_reply_check();

-- ---------------------------------------------------------------------------
-- 3. Chat: wer hat bis wann gelesen (für „Gelesen“ unter den eigenen Nachrichten)
-- ---------------------------------------------------------------------------
create or replace function public.team_chat_readers(p_chat text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid := public.nexora_workspace();
  me text;
  other uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  me := public.nexora_member_role(ws, uid);
  if me is null then return '[]'::jsonb; end if;
  if p_chat = 'alle' or (p_chat = 'leitung' and me in ('inhaber', 'mitgruender')) then
    return coalesce((
      select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'read_at', r.read_at))
        from public.team_chat_reads r
       where r.company_id = ws and r.chat = p_chat and r.user_id <> uid
         and (p_chat = 'alle' and public.nexora_member_role(ws, r.user_id) is not null
              or public.nexora_member_role(ws, r.user_id) in ('inhaber', 'mitgruender'))), '[]'::jsonb);
  end if;
  if p_chat ~ '^direkt:[0-9a-f-]{36}$' then
    other := substr(p_chat, 8)::uuid;
    return coalesce((
      select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'read_at', r.read_at))
        from public.team_chat_reads r
       where r.company_id = ws and r.user_id = other and r.chat = 'direkt:' || uid::text), '[]'::jsonb);
  end if;
  return '[]'::jsonb;
end;
$$;
revoke all on function public.team_chat_readers(text) from public, anon;
grant execute on function public.team_chat_readers(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Live: „schreibt gerade …“ und „online“ (Realtime, nur für Leute aus der Firma)
--    team:<Firma>                         → wer ist online
--    team:<Firma>:alle | :leitung | :direkt-<Person>-<Person> → wer schreibt gerade
-- ---------------------------------------------------------------------------
create or replace function public.nexora_team_topic_ok(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[];
  role text;
begin
  if auth.uid() is null
     or p_topic !~ '^team:[0-9a-f-]{36}(:(alle|leitung|direkt-[0-9a-f-]{36}-[0-9a-f-]{36}))?$' then
    return false;
  end if;
  parts := string_to_array(p_topic, ':');
  role := public.nexora_member_role(parts[2]::uuid, auth.uid());
  if role is null then return false; end if;
  if array_length(parts, 1) = 2 or parts[3] = 'alle' then return true; end if;
  if parts[3] = 'leitung' then return role in ('inhaber', 'mitgruender'); end if;
  return position(auth.uid()::text in parts[3]) > 0;
end;
$$;
revoke all on function public.nexora_team_topic_ok(text) from public, anon;
grant execute on function public.nexora_team_topic_ok(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "lunaxora_team_live_read" on realtime.messages';
    execute 'create policy "lunaxora_team_live_read" on realtime.messages for select to authenticated '
         || 'using (extension in (''broadcast'', ''presence'') and public.nexora_team_topic_ok(realtime.topic()))';
    execute 'drop policy if exists "lunaxora_team_live_write" on realtime.messages';
    execute 'create policy "lunaxora_team_live_write" on realtime.messages for insert to authenticated '
         || 'with check (extension in (''broadcast'', ''presence'') and public.nexora_team_topic_ok(realtime.topic()))';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
