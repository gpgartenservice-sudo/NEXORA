-- NEXORA: Bezahlen mit Stripe – Verknüpfung Nutzer <-> Stripe-Kunde/-Abo
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: 20261116090000_plans.sql und 20261117090000_plan_tiers.sql.
--
-- Die Server-Funktion "billing" trägt hier ein, welcher Stripe-Kunde und welches
-- Stripe-Abo zu einem Nutzer gehören. Status, Stufe (Pro/Business) und Laufzeitende
-- setzt sie bei jeder Meldung von Stripe (Webhook) in derselben Zeile.
-- Die App kann diese Spalten nur lesen (wie den Rest von subscriptions).

alter table public.subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists subscriptions_stripe_customer_id_key
  on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;
