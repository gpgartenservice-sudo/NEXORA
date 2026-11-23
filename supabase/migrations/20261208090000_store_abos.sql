-- Lunaxora: Abos über App Store und Google Play (In-App-Kauf in den Handy-Apps)
--
-- Im Supabase-Dashboard -> SQL Editor einfügen und ausführen. Darf mehrfach laufen.
-- Voraussetzung: alle bisherigen Skripte bis 20261207090000_dokumente.sql.
-- Danach die Funktionen "store" (neu) und "billing" (geändert) einspielen – supabase/README.md, Abschnitt 20.
--
-- * Die Funktion "store" prüft jeden Kauf direkt bei Apple bzw. Google und trägt das Abo in
--   public.subscriptions ein (source = 'apple' bzw. 'google'), genau wie "billing" bei Stripe.
-- * Neue Spalten merken sich, welches Store-Abo zum Konto gehört:
--     store_original_id  Apple: originalTransactionId (bleibt bei Verlängerung und Stufenwechsel gleich)
--                        Google: purchaseToken des aktuellen Abos (neu bei Stufenwechsel)
--     store_product_id   z. B. pro_month, business_year (gleiche Namen wie die Stripe-Lookup-Keys)
--     store_environment  production, sandbox (Apple-Testkauf) oder test (Google-Testkauf)
-- * Ein Store-Abo gehört höchstens zu einem Lunaxora-Konto (eindeutiger Index).
-- * Gutscheine lassen sich nicht einlösen, solange ein Store-Abo läuft – sonst ginge die
--   Verbindung zum bezahlten Abo verloren.
--
-- Läuft als eine Transaktion: Klappt etwas nicht, bleibt alles wie vorher.

begin;

-- ---------------------------------------------------------------------------
-- 1. Spalten für das Store-Abo
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists store_original_id text,
  add column if not exists store_product_id text,
  add column if not exists store_environment text;

alter table public.subscriptions drop constraint if exists subscriptions_store_environment_check;
alter table public.subscriptions add constraint subscriptions_store_environment_check
  check (store_environment is null or store_environment in ('production', 'sandbox', 'test'));

alter table public.subscriptions drop constraint if exists subscriptions_store_original_id_check;
alter table public.subscriptions add constraint subscriptions_store_original_id_check
  check (store_original_id is null or length(store_original_id) between 1 and 512);

-- Dasselbe Store-Abo kann nicht zwei Konten freischalten
create unique index if not exists subscriptions_store_original_id_key
  on public.subscriptions (source, store_original_id)
  where store_original_id is not null;

comment on column public.subscriptions.store_original_id is
  'Apple: originalTransactionId; Google: purchaseToken des aktuellen Abos (Funktion "store")';
comment on column public.subscriptions.store_product_id is
  'Produkt im App Store bzw. bei Google Play, z. B. pro_month';
comment on column public.subscriptions.store_environment is
  'production, sandbox (Apple-Testkauf) oder test (Google-Testkauf)';

-- ---------------------------------------------------------------------------
-- 2. Gutschein: nicht, solange ein bezahltes Abo läuft (Stripe wie bisher, neu: App Store / Google Play)
--    (sonst gleich wie in 20261204090000_sicherheit.sql)
-- ---------------------------------------------------------------------------
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
  if s.source in ('apple', 'google') and s.status in ('active', 'canceled')
     and (s.current_period_end is null or s.current_period_end > now()) then
    raise exception 'voucher_paid' using errcode = 'PT409';
  end if;
  until := greatest(now(), coalesce(case when s.status = 'active' then s.current_period_end end, now()))
           + make_interval(months => v.months);
  update public.subscriptions
     set status = 'active', tier = v.tier, source = 'voucher', current_period_end = until,
         store_original_id = null, store_product_id = null, store_environment = null, updated_at = now()
   where user_id = uid;
  update public.vouchers set redeemed_by = uid, redeemed_at = now() where code = v.code;
  return jsonb_build_object('months', v.months, 'tier', v.tier, 'until', until);
end;
$$;

revoke all on function public.redeem_voucher(text) from public, anon;
grant execute on function public.redeem_voucher(text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- Prüfen (optional):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'subscriptions' and column_name like 'store_%';
--   -> store_environment, store_original_id, store_product_id
-- ---------------------------------------------------------------------------
