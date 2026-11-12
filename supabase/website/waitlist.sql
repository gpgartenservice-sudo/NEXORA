-- Lunaxora: Warteliste auf der Website (lunaxora.de)
--
-- Läuft in einem eigenen Supabase-Projekt nur für die Website (foqjsghohiykixqtruwq), nicht im
-- Projekt der App. Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run. Zweimal ausführen schadet nicht.
--
-- So funktioniert es:
-- * Besucher tragen auf lunaxora.de ihre E-Mail-Adresse ein. Die Server-Funktion
--   "waitlist" (supabase/functions/waitlist) schickt eine E-Mail von
--   emails@lunaxora.de mit "Platz bestätigen" (Double-Opt-in).
-- * Erst nach der Bestätigung steht die Adresse auf der Warteliste und bekommt ihren
--   Platz (1, 2, 3 …). Die ersten 20 bestätigten Plätze (waitlist_counter.bonus_slots)
--   bekommen 3 Monate Pro kostenlos – das schaltet ihr zum Start von Hand in der App frei
--   (Liste: supabase/README.md, Abschnitt 14). Liegt bewusst nicht in migrations/ (das sind die
--   Skripte der App).
--   Plätze werden nicht neu vergeben. Ausnahme: Trägt sich der zuletzt vergebene
--   Platz wieder aus, bevor jemand nach ihm bestätigt hat, wird seine Nummer wieder frei
--   (so verbraucht z. B. ein eigener Test mit Bestätigen + Austragen keinen Pro-Platz).
-- * Nicht bestätigte Einträge werden nach 30 Tagen gelöscht (stündlich per pg_cron und bei
--   jeder Anmeldung/Bestätigung), "Austragen" (Link in jeder E-Mail) löscht den Eintrag sofort.
-- * Gegen Missbrauch: höchstens alle 10 Minuten eine E-Mail je Adresse (insgesamt 6),
--   höchstens 5 Anmeldungen pro Stunde je Internet-Anschluss (nur als verschlüsselter
--   Fingerabdruck gespeichert, nach einer Stunde nicht mehr gebraucht und beim nächsten
--   Aufräumen gelöscht) und 120 E-Mails pro Stunde insgesamt.
-- * Nur die Server-Funktion (service_role) liest und schreibt. Besucher und
--   App-Nutzer haben keinen Zugriff.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(email) and length(email) between 6 and 254 and email like '_%@_%._%'),
  -- geheimer Schlüssel für die Links "Platz bestätigen" und "Austragen" in den E-Mails
  token text not null unique check (length(token) >= 32),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  place integer unique,                       -- Platz auf der Warteliste (ab Bestätigung)
  bonus boolean not null default false,       -- unter den ersten bonus_slots: 3 Monate Pro
  consent text,                               -- Fassung des Hinweises bei der Anmeldung (Nachweis)
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,                   -- Zeitpunkt der Bestätigung (Nachweis)
  mail_sent_at timestamptz,                   -- letzte E-Mail an die Adresse (Bremse)
  mails_sent integer not null default 0 check (mails_sent >= 0),
  bonus_granted_at timestamptz,               -- 3 Monate Pro freigeschaltet (von Hand eintragen)
  check ((status = 'confirmed') = (place is not null and confirmed_at is not null))
);

create index if not exists waitlist_mail_sent_at_idx on public.waitlist (mail_sent_at);

-- Zähler für die Plätze (eine Zeile). bonus_slots = wie viele Plätze 3 Monate Pro bekommen.
create table if not exists public.waitlist_counter (
  id boolean primary key default true check (id),
  last_place integer not null default 0 check (last_place >= 0),
  bonus_slots integer not null default 20 check (bonus_slots >= 0)
);
insert into public.waitlist_counter (id) values (true) on conflict (id) do nothing;

-- Bremse je Internet-Anschluss: verschlüsselter Fingerabdruck der IP-Adresse (nicht umkehrbar),
-- wird nach einer Stunde nicht mehr gebraucht und beim nächsten Aufräumen gelöscht
create table if not exists public.waitlist_hits (
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists waitlist_hits_idx on public.waitlist_hits (ip_hash, at);

alter table public.waitlist enable row level security;
alter table public.waitlist_counter enable row level security;
alter table public.waitlist_hits enable row level security;
-- keine Policies: anon/authenticated sehen und ändern nichts
revoke all on public.waitlist, public.waitlist_counter, public.waitlist_hits from anon, authenticated;
grant select, insert, update, delete on public.waitlist, public.waitlist_counter, public.waitlist_hits to service_role;

-- ---------------------------------------------------------------------------
-- Funktionen (nur für die Server-Funktion "waitlist")
-- ---------------------------------------------------------------------------

-- Aufräumen: unbestätigte Einträge nach 30 Tagen, Anschluss-Fingerabdrücke nach einer Stunde
create or replace function public.waitlist_cleanup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.waitlist w
  where w.status = 'pending' and coalesce(w.mail_sent_at, w.created_at) < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.waitlist_hits h where h.at < now() - interval '1 hour';
  return n;
end;
$$;

-- Eintragen: legt die Adresse an (oder findet sie) und sagt, welche E-Mail raus soll.
-- o_action: 'confirm' (Bestätigungs-E-Mail schicken), 'already' (ist schon bestätigt –
-- Erinnerung mit Platz schicken), 'throttled' (vor Kurzem schon gemailt – nichts tun),
-- 'ip_limit' (zu viele Anmeldungen von diesem Anschluss), 'busy' (zu viele insgesamt).
-- o_bonus_left / o_slots: freie Pro-Plätze / Pro-Plätze insgesamt (für den Text der E-Mail).
drop function if exists public.waitlist_join(text, text, text);
drop function if exists public.waitlist_join(text, text, text, text);
create or replace function public.waitlist_join(p_email text, p_token text, p_consent text, p_ip_hash text default null)
returns table (o_action text, o_token text, o_place integer, o_bonus boolean, o_bonus_left integer, o_slots integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  r public.waitlist%rowtype;
  v_left integer;
  v_slots integer;
begin
  perform public.waitlist_cleanup();

  select greatest(c.bonus_slots - c.last_place, 0), c.bonus_slots into v_left, v_slots
  from public.waitlist_counter c where c.id;

  -- Bremse für alle zusammen: höchstens 120 E-Mails pro Stunde
  if (select count(*) from public.waitlist w where w.mail_sent_at > now() - interval '1 hour') >= 120 then
    return query select 'busy'::text, null::text, null::integer, null::boolean, v_left, v_slots;
    return;
  end if;

  -- Bremse je Anschluss: höchstens 5 E-Mails pro Stunde
  if p_ip_hash is not null
     and (select count(*) from public.waitlist_hits h
          where h.ip_hash = p_ip_hash and h.at > now() - interval '1 hour') >= 5 then
    return query select 'ip_limit'::text, null::text, null::integer, null::boolean, v_left, v_slots;
    return;
  end if;

  insert into public.waitlist (email, token, consent)
  values (v_email, p_token, p_consent)
  on conflict (email) do nothing;

  select * into r from public.waitlist w where w.email = v_email for update;

  -- Bremse je Adresse: höchstens alle 10 Minuten eine E-Mail, insgesamt höchstens 6
  if r.mail_sent_at is not null and (r.mail_sent_at > now() - interval '10 minutes' or r.mails_sent >= 6) then
    return query select 'throttled'::text, null::text, null::integer, null::boolean, v_left, v_slots;
    return;
  end if;

  update public.waitlist w
  set mail_sent_at = now(),
      mails_sent = w.mails_sent + 1,
      consent = case when w.status = 'pending' then p_consent else w.consent end
  where w.id = r.id;

  if p_ip_hash is not null then
    insert into public.waitlist_hits (ip_hash) values (p_ip_hash);
  end if;

  return query select
    case when r.status = 'confirmed' then 'already' else 'confirm' end,
    r.token, r.place, r.bonus, v_left, v_slots;
end;
$$;

-- E-Mail konnte nicht verschickt werden: Bremse für diese Adresse zurücknehmen und – wenn der
-- Fehler am eigenen Mailserver lag (p_ip_hash gesetzt) – auch den Versuch dieses Anschlusses
drop function if exists public.waitlist_mail_failed(text);
create or replace function public.waitlist_mail_failed(p_email text, p_ip_hash text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.waitlist w
  set mail_sent_at = null, mails_sent = greatest(w.mails_sent - 1, 0)
  where w.email = lower(trim(p_email));
  if p_ip_hash is not null then
    delete from public.waitlist_hits h
    where h.ctid = (select x.ctid from public.waitlist_hits x where x.ip_hash = p_ip_hash order by x.at desc limit 1);
  end if;
end;
$$;

-- Bestätigen: vergibt den nächsten Platz.
-- Keine Zeile = Link ungültig/abgelaufen. o_new = false, wenn schon vorher bestätigt.
-- o_slots: Pro-Plätze insgesamt (für den Text der E-Mail).
drop function if exists public.waitlist_confirm(text);
create or replace function public.waitlist_confirm(p_token text)
returns table (o_email text, o_place integer, o_bonus boolean, o_new boolean, o_slots integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.waitlist%rowtype;
  v_place integer;
  v_slots integer;
begin
  -- abgelaufene Links (über 30 Tage unbestätigt) gelten nicht mehr
  perform public.waitlist_cleanup();

  select * into r from public.waitlist w where w.token = p_token for update;
  if not found then
    return;
  end if;
  if r.status = 'confirmed' then
    return query select r.email, r.place, r.bonus, false, (select c.bonus_slots from public.waitlist_counter c where c.id);
    return;
  end if;

  -- nächster Platz (die Zeile sperrt, damit zwei Bestätigungen nie denselben Platz bekommen)
  update public.waitlist_counter c set last_place = c.last_place + 1
  where c.id
  returning c.last_place, c.bonus_slots into v_place, v_slots;

  update public.waitlist w
  set status = 'confirmed', confirmed_at = now(), place = v_place, bonus = v_place <= v_slots
  where w.id = r.id;

  return query select r.email, v_place, v_place <= v_slots, true, v_slots;
end;
$$;

-- Austragen (Link in jeder E-Mail): löscht den Eintrag. true = es gab ihn.
-- War es der zuletzt vergebene Platz (und noch nichts freigeschaltet), wird die Nummer wieder frei.
create or replace function public.waitlist_leave(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place integer;
  v_granted timestamptz;
begin
  delete from public.waitlist w where w.token = p_token
  returning w.place, w.bonus_granted_at into v_place, v_granted;
  if not found then
    return false;
  end if;
  if v_place is not null and v_granted is null then
    update public.waitlist_counter c set last_place = c.last_place - 1
    where c.id and c.last_place = v_place;
  end if;
  return true;
end;
$$;

-- Für die Anzeige auf der Website: wie viele Pro-Plätze sind noch frei?
create or replace function public.waitlist_stats()
returns table (o_bonus_left integer, o_bonus_slots integer)
language sql
stable
security definer
set search_path = public
as $$
  select greatest(c.bonus_slots - c.last_place, 0), c.bonus_slots
  from public.waitlist_counter c
  where c.id;
$$;

-- Frühere Fassung hatte eine automatische Pro-Freischaltung; die gibt es hier nicht (von Hand).
drop function if exists public.waitlist_grant_bonus();

revoke all on function public.waitlist_cleanup() from public, anon, authenticated;
revoke all on function public.waitlist_join(text, text, text, text) from public, anon, authenticated;
revoke all on function public.waitlist_mail_failed(text, text) from public, anon, authenticated;
revoke all on function public.waitlist_confirm(text) from public, anon, authenticated;
revoke all on function public.waitlist_leave(text) from public, anon, authenticated;
revoke all on function public.waitlist_stats() from public, anon, authenticated;
grant execute on function public.waitlist_cleanup() to service_role;
grant execute on function public.waitlist_join(text, text, text, text) to service_role;
grant execute on function public.waitlist_mail_failed(text, text) to service_role;
grant execute on function public.waitlist_confirm(text) to service_role;
grant execute on function public.waitlist_leave(text) to service_role;
grant execute on function public.waitlist_stats() to service_role;

-- Stündlich aufräumen (jeweils Minute 17), auch wenn sich niemand anmeldet. Braucht die
-- Erweiterung pg_cron; gibt es sie nicht, räumt die Funktion bei jeder Anmeldung/Bestätigung auf.
-- Prüfen: select jobname, schedule from cron.job where jobname = 'lunaxora-waitlist-cleanup';
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('lunaxora-waitlist-cleanup', '17 * * * *', 'select public.waitlist_cleanup()');
exception when others then
  raise notice 'pg_cron nicht verfügbar (%). Aufgeräumt wird bei jeder Anmeldung und Bestätigung.', sqlerrm;
end;
$$;
