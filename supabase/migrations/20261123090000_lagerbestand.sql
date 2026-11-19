-- ===========================================================================
-- Lagerbestand (vorher „Inventar“): Geräte & Werkzeug UND Produkte & Material
--
-- Baut auf public.inventory_items aus 20261120090000_feinschliff.sql auf.
--   * kind         'geraet' (wird benutzt) oder 'produkt' (wird verkauft/verbraucht)
--   * unit         Einheit der Menge: Stück, kg, l, m, Packung …
--   * quantity     jetzt mit Nachkommastellen (z. B. 2,5 kg)
--   * min_quantity Mindestbestand → „Wird knapp“, wenn die Menge darunter fällt
--   * sale_price   Verkaufspreis pro Einheit (Produkte, optional)
-- Dazu inventory_adjust(): Menge mit +/− ändern, ohne dass sich zwei Geräte
-- (oder zwei Leute im Team) gegenseitig überschreiben.
-- Mehrfach ausführbar.
-- ===========================================================================

alter table public.inventory_items
  add column if not exists kind text not null default 'geraet',
  add column if not exists unit text not null default 'Stück',
  add column if not exists min_quantity numeric(12, 3),
  add column if not exists sale_price numeric(12, 2);

alter table public.inventory_items drop constraint if exists inventory_items_kind_check;
alter table public.inventory_items add constraint inventory_items_kind_check check (kind in ('geraet', 'produkt'));
alter table public.inventory_items drop constraint if exists inventory_items_unit_check;
alter table public.inventory_items add constraint inventory_items_unit_check check (char_length(unit) between 1 and 20);
alter table public.inventory_items drop constraint if exists inventory_items_min_quantity_check;
alter table public.inventory_items add constraint inventory_items_min_quantity_check check (min_quantity >= 0);
alter table public.inventory_items drop constraint if exists inventory_items_sale_price_check;
alter table public.inventory_items add constraint inventory_items_sale_price_check check (sale_price >= 0);

-- Menge mit Nachkommastellen (bestehende ganze Zahlen bleiben gleich)
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory_items' and column_name = 'quantity') = 'integer' then
    alter table public.inventory_items alter column quantity type numeric(12, 3) using quantity::numeric;
  end if;
end;
$$;

create index if not exists inventory_items_kind_idx on public.inventory_items (user_id, kind);

-- Menge um p_delta ändern (nie unter 0). Läuft mit den Rechten des Nutzers –
-- die Zeilen-Regeln (eigenes Business bzw. Team) gelten wie beim normalen Speichern.
create or replace function public.inventory_adjust(p_id uuid, p_delta numeric)
returns setof public.inventory_items
language sql
security invoker
set search_path = public
as $$
  update public.inventory_items
     set quantity = least(greatest(quantity + p_delta, 0), 999999999)
   where id = p_id
  returning *;
$$;
revoke all on function public.inventory_adjust(uuid, numeric) from public, anon;
grant execute on function public.inventory_adjust(uuid, numeric) to authenticated;
