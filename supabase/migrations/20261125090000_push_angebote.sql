-- Push-Mitteilungen aufs iPhone: Nimmt ein Kunde ein Angebot online an (oder lehnt es ab),
-- bekommt das Business sofort eine Mitteilung – auch wenn Lunaxora gerade zu ist.
-- Weg: App meldet ihr Push-Kennzeichen (Expo) → Tabelle push_tokens. Bei einer Antwort auf ein
-- Angebot schickt ein Trigger über pg_net eine Nachricht an den Expo-Push-Dienst.
-- Datenschutz: Die Mitteilung enthält nur die Angebotsnummer, keine Namen oder Beträge
-- (die stehen erst in der App). Voraussetzung: 20261113090000_offer_links_mail.sql.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Push-Kennzeichen der Geräte (eins je Gerät; gehört immer dem gerade angemeldeten Konto)
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 10 and 300),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
-- nur über die Funktionen unten (ein Gerät kann das Konto wechseln)
revoke all on public.push_tokens from anon, authenticated;

create or replace function public.push_register(p_token text, p_platform text default 'ios')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'PT401'; end if;
  if p_token is null or char_length(p_token) not between 10 and 300 then
    raise exception 'bad_token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), case when p_platform = 'android' then 'android' else 'ios' end, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.push_unregister(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.push_register(text, text) from public, anon;
revoke all on function public.push_unregister(text) from public, anon;
grant execute on function public.push_register(text, text) to authenticated;
grant execute on function public.push_unregister(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Antwort auf ein Angebot → Mitteilung an Inhaber und Team
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
  v_tokens jsonb;
begin
  if new.kind <> 'offer' or not (v_accepted or v_declined) then return new; end if;

  select jsonb_agg(t.token) into v_tokens
    from public.push_tokens t
   where t.user_id = new.user_id
      or t.user_id in (select m.member_id from public.team_members m where m.owner_id = new.user_id);
  if v_tokens is null then return new; end if;

  -- Fehler beim Verschicken dürfen das Annehmen durch den Kunden nie aufhalten
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object(
        'to', v_tokens,
        'title', 'Angebot ' || new.number || case when v_accepted then ' angenommen' else ' abgelehnt' end,
        'body', case when v_accepted
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
  after update of accepted_at, declined_at on public.documents
  for each row execute function public.nexora_offer_reply_push();

notify pgrst, 'reload schema';
