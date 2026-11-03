-- NEXORA: Steuer-Überblick
--
-- Einmalig im Supabase-Dashboard ausführen: SQL Editor -> New query ->
-- diesen kompletten Inhalt einfügen -> Run.
-- Voraussetzung: die Skripte für Angebote & Rechnungen (20261104090000_business_documents.sql)
-- und Finanzen (20261106090000_finances.sql).

-- Steuer-Topf: wie viel Prozent vom Gewinn zurückgelegt werden sollen
alter table public.business_settings add column if not exists tax_reserve_percent numeric(4, 1);
alter table public.business_settings drop constraint if exists business_settings_tax_reserve_check;
alter table public.business_settings add constraint business_settings_tax_reserve_check
  check (tax_reserve_percent is null or (tax_reserve_percent >= 0 and tax_reserve_percent <= 60));

-- Umsatzsteuer, die in einer Ausgabe steckt (Vorsteuer) – nur bei Regelbesteuerung wichtig
alter table public.expenses add column if not exists vat_amount numeric(12, 2);
alter table public.expenses drop constraint if exists expenses_vat_check;
alter table public.expenses add constraint expenses_vat_check
  check (vat_amount is null or (vat_amount >= 0 and vat_amount < amount));
