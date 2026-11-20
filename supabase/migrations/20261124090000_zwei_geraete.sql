-- Zwei Geräte gleichzeitig (ein Handy + ein Computer) und Admin-Abos
-- Voraussetzung: 20261120090000_feinschliff.sql (account_devices, device_claim, device_status).
--
-- 1. Pro, Business und Testphase: ein Konto darf auf einem Handy (iPhone) UND einem Computer
--    (Mac-App bzw. Browser) gleichzeitig angemeldet sein. Ein weiteres Gerät übernimmt das Konto
--    nicht mehr, sondern zeigt „Melde dich zuerst auf dem anderen Gerät ab“. Abmelden gibt den
--    Platz frei (device_release). Gratis bleibt ohne Grenze.
-- 2. Abo-Herkunft 'admin': von Hand vergebene Abos (z. B. eigene Konten) – ohne Stripe, es wird
--    nichts abgebucht; die Server-Funktion "billing" verkauft solchen Konten nichts.

-- ---------------------------------------------------------------------------
-- 1. Geräte: ein Platz je Art ('phone' / 'computer')
-- ---------------------------------------------------------------------------
alter table public.account_devices add column if not exists kind text;
update public.account_devices
   set kind = case when device_name in ('Mac-App', 'Browser') then 'computer' else 'phone' end
 where kind is null;
alter table public.account_devices alter column kind set default 'phone';
alter table public.account_devices alter column kind set not null;
alter table public.account_devices drop constraint if exists account_devices_kind_check;
alter table public.account_devices add constraint account_devices_kind_check check (kind in ('phone', 'computer'));
alter table public.account_devices drop constraint if exists account_devices_pkey;
alter table public.account_devices add primary key (user_id, kind);

-- alte Fassungen (ein Gerät, „Hier weiter nutzen“ übernimmt) ersetzen
drop function if exists public.device_claim(text, text);
drop function if exists public.device_status(text);
drop function if exists public.device_claim(text, text, text);
drop function if exists public.device_status(text, text, text);

-- Art des Geräts: was die App schickt; ältere App-Versionen schicken nichts – dann die Art,
-- unter der dieses Gerät schon eingetragen ist (sonst Handy)
create or replace function public.nexora_device_kind(p_user uuid, p_device text, p_kind text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind in ('phone', 'computer') then p_kind
    else coalesce((select d.kind from public.account_devices d where d.user_id = p_user and d.device_id = p_device limit 1), 'phone')
  end;
$$;
revoke all on function public.nexora_device_kind(uuid, text, text) from public, anon, authenticated;

-- Angemeldete Geräte des Kontos (für „Konto“ in der App)
create or replace function public.nexora_devices(p_user uuid, p_device text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', d.kind, 'name', d.device_name, 'since', d.claimed_at, 'seen', d.seen_at,
           'mine', d.device_id = p_device) order by d.kind), '[]'::jsonb)
  from public.account_devices d
  where d.user_id = p_user;
$$;
revoke all on function public.nexora_devices(uuid, text) from public, anon, authenticated;

-- Dieses Gerät eintragen – nur wenn sein Platz frei ist oder ihm schon gehört (Gratis: immer).
-- Antwort: true = eingetragen, false = Platz belegt (erst auf dem anderen Gerät abmelden).
create or replace function public.device_claim(p_device text, p_name text, p_kind text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k text := public.nexora_device_kind(auth.uid(), p_device, p_kind);
  d public.account_devices;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if p_device is null or char_length(p_device) not between 8 and 80 then
    raise exception 'bad_device' using errcode = '22023';
  end if;
  select * into d from public.account_devices where user_id = uid and kind = k;
  if found and d.device_id <> p_device and public.nexora_plan(public.nexora_workspace()) <> 'free' then
    return false;
  end if;
  -- ein Gerät belegt immer nur einen Platz
  delete from public.account_devices where user_id = uid and device_id = p_device and kind <> k;
  insert into public.account_devices (user_id, kind, device_id, device_name, claimed_at, seen_at)
  values (uid, k, p_device, left(p_name, 80), now(), now())
  on conflict (user_id, kind) do update
    set device_name = case when account_devices.device_id = excluded.device_id
                           then coalesce(excluded.device_name, account_devices.device_name)
                           else excluded.device_name end,
        claimed_at = case when account_devices.device_id = excluded.device_id
                          then account_devices.claimed_at else now() end,
        device_id = excluded.device_id,
        seen_at = now();
  return true;
end;
$$;

-- Darf dieses Gerät gerade? Dazu die Liste der angemeldeten Geräte.
create or replace function public.device_status(p_device text, p_kind text default null, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k text := public.nexora_device_kind(auth.uid(), p_device, p_kind);
  limited boolean;
  d public.account_devices;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  limited := public.nexora_plan(public.nexora_workspace()) <> 'free';
  select * into d from public.account_devices where user_id = uid and kind = k;
  if found and d.device_id <> p_device then
    if limited then
      return jsonb_build_object('active', false, 'limited', true, 'other', d.device_name, 'other_kind', k,
                                'since', d.claimed_at, 'devices', public.nexora_devices(uid, p_device));
    end if;
    -- Gratis: beliebig viele Geräte, der Platz bleibt beim ersten
    return jsonb_build_object('active', true, 'limited', false, 'devices', public.nexora_devices(uid, p_device));
  end if;
  perform public.device_claim(p_device, p_name, k);
  return jsonb_build_object('active', true, 'limited', limited, 'devices', public.nexora_devices(uid, p_device));
end;
$$;

-- Abmelden: Platz dieses Geräts freigeben
create or replace function public.device_release(p_device text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  delete from public.account_devices where user_id = uid and device_id = p_device;
end;
$$;

revoke all on function public.device_claim(text, text, text) from public, anon;
revoke all on function public.device_status(text, text, text) from public, anon;
revoke all on function public.device_release(text) from public, anon;
grant execute on function public.device_claim(text, text, text) to authenticated;
grant execute on function public.device_status(text, text, text) to authenticated;
grant execute on function public.device_release(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Abo-Herkunft 'admin' (von Hand vergeben, ohne Bezahlung)
--    Vergeben z. B. so (Business, unbefristet):
--      update public.subscriptions
--         set status = 'active', tier = 'business', source = 'admin', current_period_end = null, updated_at = now()
--       where user_id = '<Konto-ID>';
-- ---------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('trial', 'manual', 'apple', 'google', 'stripe', 'voucher', 'admin'));

notify pgrst, 'reload schema';
