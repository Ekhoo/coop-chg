-- Coopérative CHG — vente au poids
--
-- Ajoute la possibilité de vendre certains articles "au poids" :
--   * portion_grams = NULL  → article vendu à l'unité (comportement actuel, défaut)
--   * portion_grams = N > 0 → article vendu au poids ; stock en grammes,
--                              chaque "unité vendue" décrémente le stock de N grammes.
--
-- À exécuter dans Supabase SQL Editor.

-- =========================================================
-- 1) Colonnes
-- =========================================================

alter table public.products
  add column if not exists portion_grams int
  check (portion_grams is null or portion_grams > 0);

alter table public.transaction_items
  add column if not exists unit_portion_grams int;

-- =========================================================
-- 2) Mise à jour de la RPC checkout
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
  v_decrement int;
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

    -- Décrément stock = nb d'unités OU portion_grams * nb_portions
    v_decrement := case
      when v_product.portion_grams is null then v_qty
      else v_product.portion_grams * v_qty
    end;

    if v_product.stock < v_decrement then
      raise exception 'Stock insuffisant pour %: dispo=%, demandé=%',
        v_product.name, v_product.stock, v_decrement using errcode = '22023';
    end if;

    update public.products
    set stock = stock - v_decrement
    where id = v_product.id;

    insert into public.transaction_items (
      transaction_id, product_id, product_name,
      unit_cost_cents, unit_sale_cents, unit_commission_cents,
      unit_portion_grams, qty
    ) values (
      v_tx_id, v_product.id, v_product.name,
      v_product.cost_price_cents, v_product.sale_price_cents, v_product.commission_cents,
      v_product.portion_grams, v_qty
    );

    v_total := v_total + ((v_product.sale_price_cents + v_product.commission_cents) * v_qty);
  end loop;

  update public.transactions
  set total_cents = v_total
  where id = v_tx_id;

  return v_tx_id;
end;
$$;
