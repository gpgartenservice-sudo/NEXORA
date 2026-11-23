-- Lunaxora: Kündigungsbutton „Verträge hier kündigen“ (§ 312k BGB)
--          und Widerrufsbutton „Vertrag widerrufen“ (§ 356a BGB) für Verträge mit LUNAXORA
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: 20261204090000_sicherheit.sql.
-- Danach: Funktion "mail" neu einspielen und den Ordner kuendigen/ auf
-- lunaxora.de hochladen (Quelle: web-kuendigen/).
--
-- Wer ein bezahltes Abo bei LUNAXORA hat, muss es über eine gut sichtbare
-- Schaltfläche kündigen können – ohne Anmeldung. Die Seite lunaxora.de/kuendigen/
-- schickt Name, E-Mail, Vertrag, Art der Kündigung und den Zeitpunkt an
-- contract_cancel. Danach verschickt die Funktion "mail" (kind "cancellation")
-- sofort die Eingangsbestätigung mit Inhalt, Datum und Uhrzeit des Eingangs und
-- dem Ende des Vertrags – an die angegebene E-Mail, Kopie an kontakt@lunaxora.de.
--
-- Dieselbe Seite mit ?widerrufen ist die Widerrufsfunktion für Verbraucher (kind
-- 'widerruf'): Name, E-Mail, Vertrag -> „Widerruf bestätigen“ -> sofort eine
-- Eingangsbestätigung mit Inhalt der Erklärung, Datum und Uhrzeit (§ 356a Abs. 4 BGB).
--
-- Datenschutz: Die Antwort an die Seite verrät nie, ob es zu der E-Mail ein Konto
-- gibt. Was zum Konto gefunden wurde (Tarif, Ende des bezahlten Zeitraums), steht
-- nur in der Bestätigung, und die geht nur an genau diese E-Mail-Adresse.
--
-- Beenden des Abos selbst: vorerst von Hand (Stripe-Dashboard -> Abo -> „Am Ende
-- des Zeitraums kündigen“, danach done_at setzen). Abos aus dem App Store oder
-- von Google Play kündigt der Kunde in den Abo-Einstellungen seines Geräts.

-- ---------------------------------------------------------------------------
-- 1. Kündigungen (nur über die Funktionen unten, nie direkt lesbar)
-- ---------------------------------------------------------------------------
create table if not exists public.contract_cancellations (
  id uuid primary key default gen_random_uuid(),
  -- geheimer Schlüssel, mit dem die Funktion "mail" die Bestätigung holt
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  received_at timestamptz not null default now(),
  -- so, wie der Kunde es abgeschickt hat
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) between 6 and 254),
  company text check (company is null or char_length(company) <= 120),
  -- abo = LUNAXORA-Abo (Pro, Business, Teams), zusatzfirma = zusätzliche Firma,
  -- konto = ganzes Konto beenden (Abo und Konto)
  contract text not null check (contract in ('abo', 'zusatzfirma', 'konto')),
  -- widerruf = Widerruf nach § 355 BGB (Verbraucher, 14 Tage ab Vertragsschluss)
  kind text not null check (kind in ('ordentlich', 'ausserordentlich', 'widerruf')),
  reason text check (reason is null or char_length(reason) <= 1000),
  -- gewünschter Zeitpunkt, leer = zum nächstmöglichen Zeitpunkt
  wished_on date,
  source text not null default 'web' check (source in ('web', 'app')),
  -- vom Server ergänzt
  user_id uuid references auth.users (id) on delete set null,
  plan text,
  plan_source text,
  period_end timestamptz,
  trial_ends_at timestamptz,
  extra_companies integer,
  -- period_end | wished | store | trial | free | no_extra | immediate | check | withdrawal
  effect text not null,
  ends_on date,
  mails smallint not null default 0 check (mails between 0 and 3),
  mailed_at timestamptz,
  -- von LUNAXORA erledigt (Abo beendet, Konto gelöscht …)
  done_at timestamptz,
  check (kind <> 'ausserordentlich' or char_length(coalesce(reason, '')) >= 3)
);
-- falls die Tabelle schon mit der ersten Fassung angelegt wurde
alter table public.contract_cancellations drop constraint if exists contract_cancellations_kind_check;
alter table public.contract_cancellations add constraint contract_cancellations_kind_check
  check (kind in ('ordentlich', 'ausserordentlich', 'widerruf'));
alter table public.contract_cancellations drop constraint if exists contract_cancellations_check;
alter table public.contract_cancellations add constraint contract_cancellations_check
  check (kind <> 'ausserordentlich' or char_length(coalesce(reason, '')) >= 3);

create index if not exists contract_cancellations_email_idx
  on public.contract_cancellations (lower(email), received_at);
create index if not exists contract_cancellations_received_idx
  on public.contract_cancellations (received_at);

alter table public.contract_cancellations enable row level security;
revoke all on public.contract_cancellations from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Wirkung der Kündigung: wann endet was?
-- ---------------------------------------------------------------------------
--   period_end  bezahlter Zeitraum endet am ends_on, danach geht es mit Gratis weiter
--   wished      Wunschtermin liegt nach dem bezahlten Zeitraum: Ende des
--               Abrechnungszeitraums, in den der Wunschtermin fällt
--   store       Abo läuft über App Store / Google Play -> dort kündigen
--   trial       Testphase endet von selbst (trial_ends_at), es kostet nichts
--   free        kein bezahltes Abo zu dieser E-Mail (oder kein Konto)
--   no_extra    keine zusätzliche Firma gebucht
--   immediate   fristlos mit Eingang, wenn ein wichtiger Grund vorliegt
--   check       Sonderfall (z. B. von Hand eingerichtetes Abo) -> wir melden uns
--   withdrawal  Widerruf eines bezahlten Abos: endet mit Eingang, Geld zurück, wenn die
--               Widerrufsfrist noch lief (prüft LUNAXORA von Hand)
create or replace function public.nexora_cancel_effect(
  p_contract text,
  p_kind text,
  p_wished date,
  p_received timestamptz,
  s public.subscriptions
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := (p_received at time zone 'Europe/Berlin')::date;
  v_paid boolean := s.user_id is not null and s.status = 'active' and coalesce(s.source, '') not in ('trial', 'admin');
  v_end date := (s.current_period_end at time zone 'Europe/Berlin')::date;
begin
  if s.user_id is not null and s.source in ('apple', 'google') and s.status = 'active' then
    return jsonb_build_object('effect', 'store');
  end if;
  if p_contract = 'zusatzfirma' and v_paid and coalesce(s.extra_companies, 0) = 0 then
    return jsonb_build_object('effect', 'no_extra');
  end if;
  if not v_paid then
    if s.user_id is not null and s.status = 'trial' and s.trial_ends_at > p_received then
      return jsonb_build_object('effect', 'trial');
    end if;
    if s.user_id is not null and s.source = 'admin' then
      return jsonb_build_object('effect', 'check');
    end if;
    return jsonb_build_object('effect', 'free');
  end if;
  if p_kind = 'widerruf' then
    return jsonb_build_object('effect', 'withdrawal', 'ends_on', v_today);
  end if;
  if p_kind = 'ausserordentlich' then
    return jsonb_build_object('effect', 'immediate', 'ends_on', v_today);
  end if;
  if v_end is null then
    return jsonb_build_object('effect', 'check');
  end if;
  if p_wished is not null and p_wished > v_end then
    return jsonb_build_object('effect', 'wished');
  end if;
  return jsonb_build_object('effect', 'period_end', 'ends_on', v_end);
end;
$$;
revoke all on function public.nexora_cancel_effect(text, text, date, timestamptz, public.subscriptions)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Kündigung abschicken (Seite lunaxora.de/kuendigen/, ohne Anmeldung)
-- ---------------------------------------------------------------------------
create or replace function public.contract_cancel(
  p_name text,
  p_email text,
  p_contract text,
  p_kind text,
  p_reason text default null,
  p_wished_on date default null,
  p_company text default null,
  p_source text default 'web'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '[[:cntrl:]]+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_company text := nullif(regexp_replace(trim(coalesce(p_company, '')), '[[:cntrl:]]+', ' ', 'g'), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_kind text := coalesce(p_kind, '');
  v_at timestamptz := now();
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_user uuid;
  s public.subscriptions;
  v_eff jsonb;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 100 then return jsonb_build_object('error', 'invalid_name'); end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@<>(),;:"]+@[^[:space:]@<>(),;:"]+\.[^[:space:]@<>(),;:"]{2,}$' then
    return jsonb_build_object('error', 'invalid_email');
  end if;
  if v_company is not null and char_length(v_company) > 120 then return jsonb_build_object('error', 'invalid_company'); end if;
  if coalesce(p_contract, '') not in ('abo', 'zusatzfirma', 'konto') then return jsonb_build_object('error', 'invalid_contract'); end if;
  if v_kind not in ('ordentlich', 'ausserordentlich', 'widerruf') then return jsonb_build_object('error', 'invalid_kind'); end if;
  if v_kind = 'ausserordentlich' and char_length(coalesce(v_reason, '')) < 3 then return jsonb_build_object('error', 'missing_reason'); end if;
  if v_reason is not null and char_length(v_reason) > 1000 then return jsonb_build_object('error', 'invalid_reason'); end if;
  if p_wished_on is not null and (p_wished_on < v_today or p_wished_on > v_today + 730) then
    return jsonb_build_object('error', 'invalid_date');
  end if;
  if coalesce(p_source, 'web') not in ('web', 'app') then return jsonb_build_object('error', 'invalid_source'); end if;

  -- gegen Missbrauch: höchstens 3 je E-Mail und Stunde, 60 insgesamt je Stunde
  if (select count(*) from public.contract_cancellations
       where lower(email) = v_email and received_at > v_at - interval '1 hour') >= 3
     or (select count(*) from public.contract_cancellations where received_at > v_at - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'too_many');
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email order by u.created_at limit 1;
  if v_user is not null then
    select * into s from public.subscriptions where user_id = v_user;
  end if;
  v_eff := public.nexora_cancel_effect(p_contract, v_kind, case when v_kind = 'ordentlich' then p_wished_on end, v_at, s);

  insert into public.contract_cancellations (
    token, received_at, name, email, company, contract, kind, reason, wished_on, source,
    user_id, plan, plan_source, period_end, trial_ends_at, extra_companies, effect, ends_on
  ) values (
    v_token, v_at, v_name, trim(p_email), v_company, p_contract, v_kind, v_reason,
    case when v_kind = 'ordentlich' then p_wished_on end, coalesce(p_source, 'web'),
    v_user,
    case when s.user_id is null then null when s.status = 'active' then coalesce(s.tier, 'pro') else s.status end,
    s.source, s.current_period_end, s.trial_ends_at, s.extra_companies,
    v_eff ->> 'effect', (v_eff ->> 'ends_on')::date
  );

  -- Nur das, was der Kunde selbst abgeschickt hat, plus Eingang und Schlüssel –
  -- nichts darüber, ob es ein Konto gibt.
  return jsonb_build_object('ok', true, 'token', v_token, 'received_at', v_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Für die Funktion "mail": Daten der Bestätigung holen / als verschickt vermerken
-- ---------------------------------------------------------------------------
create or replace function public.contract_cancel_mail(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contract_cancellations;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into c from public.contract_cancellations where token = p_token for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if c.mailed_at is not null then return jsonb_build_object('error', 'already_sent'); end if;
  if c.mails >= 3 then return jsonb_build_object('error', 'too_many'); end if;
  update public.contract_cancellations set mails = mails + 1 where id = c.id;
  return jsonb_build_object(
    'received_at', c.received_at,
    'name', c.name,
    'email', c.email,
    'company', c.company,
    'contract', c.contract,
    'kind', c.kind,
    'reason', c.reason,
    'wished_on', c.wished_on,
    'plan', c.plan,
    'period_end', c.period_end,
    'trial_ends_at', c.trial_ends_at,
    'extra_companies', c.extra_companies,
    'effect', c.effect,
    'ends_on', c.ends_on
  );
end;
$$;

create or replace function public.contract_cancel_mailed(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  update public.contract_cancellations set mailed_at = now() where token = p_token and mailed_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.contract_cancel(text, text, text, text, text, date, text, text) from public;
revoke all on function public.contract_cancel_mail(text) from public, anon, authenticated;
revoke all on function public.contract_cancel_mailed(text) from public, anon, authenticated;
grant execute on function public.contract_cancel(text, text, text, text, text, date, text, text) to anon, authenticated;
grant execute on function public.contract_cancel_mail(text) to service_role;
grant execute on function public.contract_cancel_mailed(text) to service_role;

notify pgrst, 'reload schema';
