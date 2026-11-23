-- =============================================================================
-- Lunaxora: Konto direkt in der App löschen (App Store 5.1.1(v), Art. 17 DSGVO)
--
-- Im Supabase-Dashboard -> SQL Editor einfügen und ausführen. Darf mehrfach
-- laufen. Voraussetzung: alle bisherigen Skripte bis 20261205090000_kuendigung.sql.
-- Danach die neue Edge Function "account" anlegen (supabase/README.md, Abschnitt 18)
-- und "billing" neu einspielen.
--
-- Wie das Löschen abläuft (Funktion "account", mode "delete"):
--   1. account_deletion_info: Was hängt am Konto? Läuft noch ein Stripe-Abo,
--      wird nicht gelöscht – erst kündigen (sonst bucht Stripe weiter ab).
--   2. account_delete_prepare (unten): Abo noch einmal prüfen und aufräumen,
--      was nicht von selbst mitgelöscht wird.
--   3. Belege im Speicher "receipts" aller eigenen Firmen löscht die Funktion
--      über die Storage-API (direktes Löschen in storage.objects ist gesperrt).
--   4. Konto löschen über die Auth-Admin-API. Alles Weitere löscht die
--      Datenbank selbst (on delete cascade): Profil, Abo-Eintrag, Kontingent,
--      Geräte, Push-Tokens, TikTok/Instagram-Verbindungen, alle eigenen Firmen
--      (erste und weitere) mit Kunden, Aufträgen, Rechnungen, Finanzen,
--      Terminen, Kalender-Link, Logo, To-dos, Lager, Social – und deren Teams:
--      die Mitglieder verlieren den Zugang, ihre eigenen Konten bleiben.
--
-- Was dieses Skript ändert:
--   A. Team-Daten bleiben bei der Firma. Löscht ein TEAMMITGLIED sein Konto,
--      bleiben seine Arbeitsstunden, Abwesenheiten, Einsätze im Arbeitsplan und
--      Chat-Nachrichten in der Firma (wie beim Verlassen eines Teams). Für diese
--      Daten ist die Firma verantwortlich (Datenschutzerklärung § 6, AV-Vertrag),
--      z. B. für die Lohnabrechnung. Bisher hätte das Löschen sie mitgenommen.
--      Die App zeigt die Person dann als „Ehemaliges Mitglied“.
--   B. Zahlen für unsere Buchhaltung bleiben ohne Personenbezug: kosten.zahlungen
--      (Einnahmen) und kosten.nutzung (Kosten je Anfrage) verlieren beim Löschen
--      nur die Konto-ID. Die Rechnungen selbst liegen bei Stripe.
--   C. account_deletion_info / account_delete_prepare (nur Service-Schlüssel).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A. Team-Daten bleiben bei der Firma (Fremdschlüssel auf auth.users entfernen;
--    die Firma selbst löscht sie weiterhin mit: company_id -> companies cascade)
-- ---------------------------------------------------------------------------
do $$
declare
  cols text[][] := array[
    ['work_hours', 'member_id'], ['work_shifts', 'member_id'], ['absences', 'member_id'],
    ['team_messages', 'sender_id'], ['team_messages', 'recipient_id']];
  i integer;
  r record;
begin
  for i in 1 .. array_length(cols, 1) loop
    if to_regclass('public.' || cols[i][1]) is null then continue; end if;
    for r in
      select c.conname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = ('public.' || cols[i][1])::regclass and c.contype = 'f'
         and c.confrelid = 'auth.users'::regclass and a.attname = cols[i][2]
    loop
      execute format('alter table public.%I drop constraint %I', cols[i][1], r.conname);
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- B. Einnahmen und Kosten: Zahlen bleiben, Konto-ID wird leer
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['zahlungen', 'nutzung'] loop
    if to_regclass('kosten.' || t) is null then continue; end if;
    execute format('alter table kosten.%I alter column user_id drop not null', t);
    for r in
      select c.conname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = ('kosten.' || t)::regclass and c.contype = 'f'
         and c.confrelid = 'auth.users'::regclass and a.attname = 'user_id'
    loop
      execute format('alter table kosten.%I drop constraint %I', t, r.conname);
    end loop;
    execute format('alter table kosten.%I add constraint %I foreign key (user_id) references auth.users (id) on delete set null',
                   t, t || '_user_id_fkey');
  end loop;
end;
$$;

-- Stripe meldet eine bezahlte Rechnung zu einem gelöschten Konto (z. B. verspätet):
-- Einnahme trotzdem eintragen, nur ohne Konto (statt Fehler und endlosen Wiederholungen)
do $$
begin
  if to_regclass('kosten.zahlungen') is null then return; end if;
  execute $f$
    create or replace function public.log_payment(
      p_user uuid,
      p_betrag numeric,
      p_quelle text default 'stripe',
      p_intervall text default null,
      p_stufe text default null,
      p_rechnung text default null,
      p_beschreibung text default null,
      p_bezahlt_am timestamptz default null
    )
    returns void
    language sql
    security definer
    set search_path = ''
    as $body$
      insert into kosten.zahlungen (user_id, betrag_eur, quelle, intervall, stufe, rechnung, beschreibung, bezahlt_am)
      values (
        (select u.id from auth.users u where u.id = p_user),
        round(p_betrag, 2),
        p_quelle,
        case when p_intervall in ('month', 'year') then p_intervall end,
        case when p_stufe in ('pro', 'business') then p_stufe end,
        nullif(p_rechnung, ''),
        left(p_beschreibung, 300),
        coalesce(p_bezahlt_am, now())
      )
      on conflict (rechnung) do nothing;
    $body$
  $f$;
  revoke all on function public.log_payment(uuid, numeric, text, text, text, text, text, timestamptz) from public, anon, authenticated;
  grant execute on function public.log_payment(uuid, numeric, text, text, text, text, text, timestamptz) to service_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- C1. Was passiert beim Löschen? (für die Warnungen in der App und die Prüfung)
-- ---------------------------------------------------------------------------
--   subscription.running        Stripe-Abo läuft und ist nicht gekündigt -> erst kündigen
--   subscription.store          Abo über App Store / Google Play -> dort kündigen
--   subscription.cancel_pending Kündigung über lunaxora.de/kuendigen/ ist eingegangen,
--                               aber noch nicht bei Stripe eingetragen
--   companies                   eigene Firmen (erste + weitere) mit Zahl der Teammitglieder
--   team_people                 so viele Personen verlieren den Zugang zu deinen Firmen
--   memberships                 Teams anderer Firmen, in denen du Mitglied bist
create or replace function public.account_deletion_info(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.subscriptions;
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    return null;
  end if;
  select * into s from public.subscriptions where user_id = p_user;
  return jsonb_build_object(
    'subscription', case when s.user_id is null then null else jsonb_build_object(
      'status', s.status,
      'source', s.source,
      'tier', s.tier,
      'current_period_end', s.current_period_end,
      'running', s.source = 'stripe' and s.status = 'active'
                 and (s.current_period_end is null or s.current_period_end > now()),
      'store', s.source in ('apple', 'google') and s.status = 'active'
               and (s.current_period_end is null or s.current_period_end > now()),
      'cancel_pending', exists (
        select 1 from public.contract_cancellations k
         where k.user_id = p_user and k.done_at is null and k.contract in ('abo', 'konto'))) end,
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'name', public.nexora_company_name(c.id),
               'primary', c.id = c.owner_id,
               'members', (select count(*) from public.team_members m where m.company_id = c.id))
             order by (c.id = c.owner_id) desc, c.created_at)
        from public.companies c
       where c.owner_id = p_user), '[]'::jsonb),
    'team_people', (
      select count(distinct m.member_id)
        from public.team_members m
        join public.companies c on c.id = m.company_id
       where c.owner_id = p_user and m.member_id <> p_user),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object('company_id', m.company_id, 'name', public.nexora_company_name(m.company_id))
             order by m.joined_at)
        from public.team_members m
       where m.member_id = p_user), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.account_deletion_info(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_info(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- C2. Direkt vor dem Löschen: aufräumen, was nicht von selbst mitgelöscht wird
-- ---------------------------------------------------------------------------
--   * Läuft noch ein Stripe-Abo: Abbruch (subscription_active) – zweite Sicherung
--     nach der Prüfung in der Funktion "account".
--   * Kündigung „Mein ganzes LUNAXORA-Konto“ (lunaxora.de/kuendigen/) gilt als erledigt.
--   * Einträge zum Missbrauchsschutz (nexora_attempts, ohne Fremdschlüssel) löschen.
--   * Teams anderer Firmen: deren Kalender-Link neu erstellen lassen (die Person
--     kannte ihn – wie beim Entfernen aus dem Team, 20261204090000_sicherheit.sql).
--   * Dateien, die die Person in einer fremden Firma hochgeladen hat (Belege als
--     Teammitglied), gehören der Firma: Besitz lösen, damit das Löschen des Kontos
--     nicht daran hängen bleibt. Die Belege der eigenen Firmen löscht die Funktion
--     "account" danach über die Storage-API.
-- Rückgabe: { companies: [IDs der eigenen Firmen], files_released: Anzahl }
create or replace function public.account_delete_prepare(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_companies uuid[];
  v_files integer := 0;
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'user_not_found' using errcode = 'PT404';
  end if;
  if exists (select 1 from public.subscriptions s
              where s.user_id = p_user and s.source = 'stripe' and s.status = 'active'
                and (s.current_period_end is null or s.current_period_end > now())) then
    raise exception 'subscription_active' using errcode = 'PT409';
  end if;

  select coalesce(array_agg(c.id order by c.created_at), '{}') into v_companies
    from public.companies c where c.owner_id = p_user;

  update public.contract_cancellations set done_at = now()
   where user_id = p_user and contract = 'konto' and done_at is null;

  delete from public.nexora_attempts where user_id = p_user;

  delete from public.calendar_feeds f
   using public.team_members m
   where m.member_id = p_user and f.user_id = m.company_id and not (m.company_id = any (v_companies));

  begin
    update storage.objects set owner = null, owner_id = null
     where owner = p_user or owner_id = p_user::text;
    get diagnostics v_files = row_count;
  exception
    when undefined_column then
      -- ältere Speicher-Tabelle ohne owner_id
      update storage.objects set owner = null where owner = p_user;
      get diagnostics v_files = row_count;
    when insufficient_privilege then
      -- ohne Recht auf storage.objects: weiter (hängt das Löschen dann doch, meldet es die Funktion)
      raise warning 'account_delete_prepare: storage.objects nicht änderbar (%)', sqlerrm;
      v_files := -1;
  end;

  return jsonb_build_object('companies', to_jsonb(v_companies), 'files_released', v_files);
end;
$$;
revoke all on function public.account_delete_prepare(uuid) from public, anon, authenticated;
grant execute on function public.account_delete_prepare(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
