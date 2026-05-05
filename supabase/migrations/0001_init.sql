-- Coop Nico — schéma initial
-- À exécuter dans Supabase SQL Editor (ou via `supabase db push`).
--
-- Modèle de prix :
--   * cost_price_cents  = prix d'achat unitaire (ce que la caserne paye)
--   * sale_price_cents  = prix de vente unitaire qui revient à la caserne
--   * commission_cents  = commission unitaire qui part en "caisse noire" (activités pompiers)
--   * Total payé par le client = sale_price_cents + commission_cents
--   * Marge caserne = sale_price_cents - cost_price_cents

-- Extensions
create extension if not exists "uuid-ossp";

-- =========================================================
-- Tables
-- =========================================================

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('admin', 'seller')),
  display_name  text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id                uuid primary key default uuid_generate_v4(),
  category_id       uuid references public.categories(id) on delete set null,
  name              text not null,
  cost_price_cents  int  not null default 0  check (cost_price_cents >= 0),
  sale_price_cents  int  not null            check (sale_price_cents >= 0),
  commission_cents  int  not null default 0  check (commission_cents >= 0),
  stock             int  not null default 0  check (stock >= 0),
  image_path        text,
  archived          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_archived_idx on public.products(archived);

create table if not exists public.transactions (
  id          uuid primary key default uuid_generate_v4(),
  seller_id   uuid not null references public.profiles(id),
  total_cents int  not null check (total_cents >= 0),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists transactions_created_idx on public.transactions(created_at desc);
create index if not exists transactions_seller_idx  on public.transactions(seller_id);

create table if not exists public.transaction_items (
  id                    uuid primary key default uuid_generate_v4(),
  transaction_id        uuid not null references public.transactions(id) on delete cascade,
  product_id            uuid references public.products(id) on delete set null,
  product_name          text not null,
  unit_cost_cents       int  not null,
  unit_sale_cents       int  not null,
  unit_commission_cents int  not null,
  qty                   int  not null check (qty > 0)
);
create index if not exists tx_items_transaction_idx on public.transaction_items(transaction_id);
create index if not exists tx_items_product_idx     on public.transaction_items(product_id);

-- =========================================================
-- Helpers
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

-- =========================================================
-- Row Level Security
-- =========================================================

alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.transactions      enable row level security;
alter table public.transaction_items enable row level security;

-- profiles
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- categories
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select using (public.is_active_user());

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- products
drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select using (public.is_active_user());

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- transactions
drop policy if exists transactions_read on public.transactions;
create policy transactions_read on public.transactions
  for select using (public.is_active_user());

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert with check (public.is_active_user() and seller_id = auth.uid());

drop policy if exists transactions_admin_modify on public.transactions;
create policy transactions_admin_modify on public.transactions
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists transactions_admin_delete on public.transactions;
create policy transactions_admin_delete on public.transactions
  for delete using (public.is_admin());

-- transaction_items
drop policy if exists tx_items_read on public.transaction_items;
create policy tx_items_read on public.transaction_items
  for select using (public.is_active_user());

drop policy if exists tx_items_insert on public.transaction_items;
create policy tx_items_insert on public.transaction_items
  for insert with check (
    public.is_active_user()
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.seller_id = auth.uid()
    )
  );

drop policy if exists tx_items_admin_modify on public.transaction_items;
create policy tx_items_admin_modify on public.transaction_items
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================
-- RPC: checkout(items jsonb) -> transaction_id uuid
-- Décrémente le stock + crée la transaction + items en une seule transaction.
-- Format attendu: [{ "product_id": "<uuid>", "qty": 2 }, ...]
-- =========================================================

create or replace function public.checkout(items jsonb, note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_tx_id     uuid;
  v_total     int := 0;
  v_item      jsonb;
  v_product   public.products%rowtype;
  v_qty       int;
  v_unit_total int;
begin
  if v_user_id is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  if not public.is_active_user() then
    raise exception 'Compte désactivé' using errcode = '28000';
  end if;

  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Panier vide' using errcode = '22023';
  end if;

  -- Crée la transaction (total mis à jour à la fin)
  insert into public.transactions (seller_id, total_cents, note)
  values (v_user_id, 0, note)
  returning id into v_tx_id;

  -- Itère sur les lignes
  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := (v_item->>'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantité invalide' using errcode = '22023';
    end if;

    -- Lock la ligne produit pour éviter les races
    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid
    for update;

    if not found then
      raise exception 'Produit introuvable: %', v_item->>'product_id' using errcode = '22023';
    end if;

    if v_product.archived then
      raise exception 'Produit archivé: %', v_product.name using errcode = '22023';
    end if;

    if v_product.stock < v_qty then
      raise exception 'Stock insuffisant pour %: dispo=%, demandé=%',
        v_product.name, v_product.stock, v_qty using errcode = '22023';
    end if;

    update public.products
    set stock = stock - v_qty
    where id = v_product.id;

    insert into public.transaction_items (
      transaction_id, product_id, product_name,
      unit_cost_cents, unit_sale_cents, unit_commission_cents, qty
    ) values (
      v_tx_id, v_product.id, v_product.name,
      v_product.cost_price_cents, v_product.sale_price_cents, v_product.commission_cents, v_qty
    );

    v_unit_total := v_product.sale_price_cents + v_product.commission_cents;
    v_total := v_total + (v_unit_total * v_qty);
  end loop;

  update public.transactions
  set total_cents = v_total
  where id = v_tx_id;

  return v_tx_id;
end;
$$;

revoke all on function public.checkout(jsonb, text) from public;
grant execute on function public.checkout(jsonb, text) to authenticated;

-- =========================================================
-- Vue d'agrégation pour les rapports admin
-- =========================================================

create or replace view public.sales_by_product as
select
  ti.product_id,
  ti.product_name,
  sum(ti.qty)                                                          as qty_sold,
  sum(ti.qty * (ti.unit_sale_cents + ti.unit_commission_cents))        as total_revenue_cents,
  sum(ti.qty * ti.unit_sale_cents)                                     as caserne_revenue_cents,
  sum(ti.qty * ti.unit_commission_cents)                               as commission_cents,
  sum(ti.qty * ti.unit_cost_cents)                                     as cost_cents,
  sum(ti.qty * (ti.unit_sale_cents - ti.unit_cost_cents))              as caserne_margin_cents,
  min(t.created_at)                                                    as first_sold_at,
  max(t.created_at)                                                    as last_sold_at
from public.transaction_items ti
join public.transactions t on t.id = ti.transaction_id
group by ti.product_id, ti.product_name;

-- =========================================================
-- Storage: bucket public pour les images produits
-- (à créer dans le dashboard si la commande échoue)
-- =========================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists product_images_admin_write on storage.objects;
create policy product_images_admin_write on storage.objects
  for all
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
