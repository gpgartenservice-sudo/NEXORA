-- Lunaxora: Angebot online widerrufen (Widerrufsfunktion nach § 356a BGB)
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: 20261113090000_offer_links_mail.sql (Angebots-Link) und
-- 20261127090000_mehrere_firmen.sql (Mitteilung bei Antwort auf ein Angebot).
-- Danach: Funktion "mail" neu einspielen und die Angebotsseite neu hochladen.
--
-- Nimmt ein Privatkunde ein Angebot über den Link an, ist das ein Fernabsatzvertrag.
-- Dann muss es auf derselben Seite während der Widerrufsfrist die Schaltfläche
-- „Vertrag widerrufen“ geben: Name, Vertrag und E-Mail angeben oder bestätigen,
-- „Widerruf bestätigen“ – und sofort eine Eingangsbestätigung per E-Mail
-- (verschickt die Funktion "mail", kind "withdrawal").

-- ---------------------------------------------------------------------------
-- 1. Widerruf am Angebot speichern
-- ---------------------------------------------------------------------------
alter table public.documents add column if not exists withdrawn_at timestamptz;
-- { name, contract, email } – so, wie der Kunde es abgeschickt hat
alter table public.documents add column if not exists withdrawal jsonb;
-- Versuche, die Eingangsbestätigung zu verschicken (höchstens 3) und wann sie rausging
alter table public.documents add column if not exists withdrawal_mails smallint not null default 0;
alter table public.documents add column if not exists withdrawal_mailed_at timestamptz;

alter table public.documents drop constraint if exists documents_withdrawal_check;
alter table public.documents add constraint documents_withdrawal_check check (
  (withdrawn_at is null or accepted_at is not null)
  and ((withdrawn_at is null) = (withdrawal is null))
  and (withdrawal is null or pg_column_size(withdrawal) <= 2000)
  and withdrawal_mails between 0 and 3
);

-- ---------------------------------------------------------------------------
-- 2. Ende der Widerrufsfrist
--    14 Tage ab dem Tag nach der Annahme (§§ 187, 188 BGB). Fällt der letzte Tag
--    auf Samstag, Sonntag oder einen Feiertag, zählt der nächste Werktag (§ 193 BGB).
--    Feiertage aller Bundesländer zusammen: so endet die Frist nie zu früh.
-- ---------------------------------------------------------------------------
create or replace function public.nexora_easter(p_year int)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  a int := p_year % 19;
  b int := p_year / 100;
  c int := p_year % 100;
  h int;
  l int;
  m int;
begin
  h := (19 * a + b - b / 4 - (b - (b + 8) / 25 + 1) / 3 + 15) % 30;
  l := (32 + 2 * (b % 4) + 2 * (c / 4) - h - c % 4) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_year, (h + l - 7 * m + 114) / 31, (h + l - 7 * m + 114) % 31 + 1);
end;
$$;

create or replace function public.nexora_any_holiday(p_day date)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  y int := extract(year from p_day)::int;
  bb date := make_date(y, 11, 22);
begin
  if to_char(p_day, 'MM-DD') in ('01-01', '01-06', '03-08', '05-01', '08-15', '09-20', '10-03', '10-31', '11-01', '12-25', '12-26') then
    return true;
  end if;
  -- Karfreitag, Ostersonntag, Ostermontag, Himmelfahrt, Pfingstsonntag, Pfingstmontag, Fronleichnam
  if p_day - public.nexora_easter(y) in (-2, 0, 1, 39, 49, 50, 60) then return true; end if;
  -- Buß- und Bettag: Mittwoch vor dem 23. November
  bb := bb - ((extract(dow from bb)::int - 3 + 7) % 7);
  return p_day = bb;
end;
$$;

create or replace function public.nexora_withdrawal_until(p_accepted timestamptz)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  d date;
begin
  if p_accepted is null then return null; end if;
  d := (p_accepted at time zone 'Europe/Berlin')::date + 14;
  while extract(isodow from d) in (6, 7) or public.nexora_any_holiday(d) loop
    d := d + 1;
  end loop;
  return d;
end;
$$;

-- Kann der Kunde dieses Angebot gerade online widerrufen?
create or replace function public.nexora_withdrawal_open(d public.documents)
returns boolean
language sql
stable
set search_path = ''
as $$
  select d.kind = 'offer'
     and d.accepted_at is not null
     and d.withdrawn_at is null
     and coalesce(trim(d.data -> 'buyer' ->> 'company'), '') = ''
     and (now() at time zone 'Europe/Berlin')::date <= public.nexora_withdrawal_until(d.accepted_at);
$$;

revoke all on function public.nexora_easter(int) from public, anon, authenticated;
revoke all on function public.nexora_any_holiday(date) from public, anon, authenticated;
revoke all on function public.nexora_withdrawal_until(timestamptz) from public, anon, authenticated;
revoke all on function public.nexora_withdrawal_open(public.documents) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Angebotsseite: zeigt zusätzlich den Widerruf und ob die Schaltfläche da ist
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. „Widerruf bestätigen“: speichert den Widerruf und storniert den Auftrag
-- ---------------------------------------------------------------------------
create or replace function public.offer_withdraw(p_token text, p_name text, p_contract text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents;
  v_name text := trim(coalesce(p_name, ''));
  v_contract text := trim(coalesce(p_contract, ''));
  v_email text := trim(coalesce(p_email, ''));
  v_at timestamptz := now();
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into d from public.documents where public_token = p_token and kind = 'offer' for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if d.withdrawn_at is not null then return jsonb_build_object('error', 'already_withdrawn'); end if;
  if d.accepted_at is null then return jsonb_build_object('error', 'not_accepted'); end if;
  if coalesce(trim(d.data -> 'buyer' ->> 'company'), '') <> '' then return jsonb_build_object('error', 'not_private'); end if;
  if not public.nexora_withdrawal_open(d) then return jsonb_build_object('error', 'too_late'); end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then return jsonb_build_object('error', 'invalid_name'); end if;
  if char_length(v_contract) < 1 or char_length(v_contract) > 200 then return jsonb_build_object('error', 'invalid_contract'); end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@<>(),;:"]+@[^[:space:]@<>(),;:"]+\.[^[:space:]@<>(),;:"]{2,}$' then
    return jsonb_build_object('error', 'invalid_email');
  end if;

  update public.documents
     set withdrawn_at = v_at,
         withdrawal = jsonb_build_object('name', v_name, 'contract', v_contract, 'email', v_email)
   where id = d.id;
  -- Vertrag ist weg: Auftrag storniert (zählt nicht mehr als Umsatz, kein Termin mehr)
  if d.order_id is not null then
    update public.orders set cancelled = true where id = d.order_id and user_id = d.user_id;
  end if;
  return jsonb_build_object('ok', true, 'withdrawn_at', v_at);
end;
$$;

-- Für die Funktion "mail": Daten der Eingangsbestätigung holen (höchstens 3 Versuche)
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
    'number', d.number,
    'issued_on', d.issued_on,
    'accepted_at', d.accepted_at,
    'withdrawn_at', d.withdrawn_at,
    'withdrawal', d.withdrawal,
    'seller', d.data -> 'seller'
  );
end;
$$;

-- Für die Funktion "mail": Eingangsbestätigung ist raus
create or replace function public.offer_withdrawal_mailed(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;
  update public.documents
     set withdrawal_mailed_at = now()
   where public_token = p_token and kind = 'offer' and withdrawn_at is not null and withdrawal_mailed_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.offer_view(text) from public;
revoke all on function public.offer_withdraw(text, text, text, text) from public;
revoke all on function public.offer_withdrawal_mail(text) from public;
revoke all on function public.offer_withdrawal_mailed(text) from public;
grant execute on function public.offer_view(text) to anon, authenticated;
grant execute on function public.offer_withdraw(text, text, text, text) to anon, authenticated;
grant execute on function public.offer_withdrawal_mail(text) to anon, authenticated;
grant execute on function public.offer_withdrawal_mailed(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Mitteilung an Inhaber und Team: jetzt auch bei Widerruf
-- ---------------------------------------------------------------------------
create or replace function public.nexora_offer_reply_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_accepted boolean := new.accepted_at is not null and old.accepted_at is null;
  v_declined boolean := new.declined_at is not null and old.declined_at is null;
  v_withdrawn boolean := new.withdrawn_at is not null and old.withdrawn_at is null;
  v_tokens jsonb;
begin
  if new.kind <> 'offer' or not (v_accepted or v_declined or v_withdrawn) then return new; end if;

  select jsonb_agg(t.token) into v_tokens
    from public.push_tokens t
   where t.user_id = (select c.owner_id from public.companies c where c.id = new.user_id)
      or t.user_id in (select m.member_id from public.team_members m where m.company_id = new.user_id);
  if v_tokens is null then return new; end if;

  -- Fehler beim Verschicken dürfen die Antwort des Kunden nie aufhalten
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object(
        'to', v_tokens,
        'title', 'Angebot ' || new.number || case when v_withdrawn then ' widerrufen'
                                                  when v_accepted then ' angenommen'
                                                  else ' abgelehnt' end,
        'body', case when v_withdrawn
                     then 'Dein Kunde hat den Vertrag online widerrufen. Der Auftrag ist storniert.'
                     when v_accepted
                     then 'Dein Kunde hat das Angebot online angenommen. Tippe, um es anzusehen.'
                     else 'Dein Kunde hat das Angebot abgelehnt. Mehr dazu in Lunaxora.' end,
        'sound', 'default',
        'data', jsonb_build_object('kind', 'offers', 'document_id', new.id, 'order_id', new.order_id)
      ),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'push failed: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.nexora_offer_reply_push() from public, anon, authenticated;

drop trigger if exists offer_reply_push on public.documents;
create trigger offer_reply_push
  after update of accepted_at, declined_at, withdrawn_at on public.documents
  for each row execute function public.nexora_offer_reply_push();

notify pgrst, 'reload schema';
