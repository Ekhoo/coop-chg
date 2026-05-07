-- Coop Nico — supervision de la base + purge
-- À exécuter dans Supabase SQL Editor après 0001_init.sql.
--
-- Fournit :
--   * public.get_db_stats() — renvoie taille DB, taille Storage, compteurs
--   * public.purge_transactions(from, to) — supprime les transactions d'une plage

-- =========================================================
-- get_db_stats() — réservé aux admins
-- =========================================================

create or replace function public.get_db_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_db_size_bytes          bigint;
  v_storage_size_bytes     bigint := 0;
  v_transactions_count     bigint;
  v_transaction_items_count bigint;
  v_products_count         bigint;
  v_oldest_tx              timestamptz;
  v_newest_tx              timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux admins' using errcode = '42501';
  end if;

  v_db_size_bytes := pg_database_size(current_database());

  -- Taille totale du bucket d'images (peut échouer si schéma storage indisponible)
  begin
    select coalesce(sum((metadata->>'size')::bigint), 0)
    into v_storage_size_bytes
    from storage.objects;
  exception when others then
    v_storage_size_bytes := 0;
  end;

  select count(*) into v_transactions_count       from public.transactions;
  select count(*) into v_transaction_items_count  from public.transaction_items;
  select count(*) into v_products_count           from public.products;

  select min(created_at), max(created_at)
  into v_oldest_tx, v_newest_tx
  from public.transactions;

  return jsonb_build_object(
    'db_size_bytes',            v_db_size_bytes,
    'storage_size_bytes',       v_storage_size_bytes,
    'transactions_count',       v_transactions_count,
    'transaction_items_count',  v_transaction_items_count,
    'products_count',           v_products_count,
    'oldest_transaction',       v_oldest_tx,
    'newest_transaction',       v_newest_tx
  );
end;
$$;

revoke all on function public.get_db_stats() from public;
grant execute on function public.get_db_stats() to authenticated;

-- =========================================================
-- purge_transactions(from, to) — réservé aux admins
-- Supprime les transactions sur la plage [from, to] (inclusif).
-- Les transaction_items partent en cascade (FK ON DELETE CASCADE).
-- Renvoie le nombre de transactions supprimées.
-- =========================================================

create or replace function public.purge_transactions(from_ts timestamptz, to_ts timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux admins' using errcode = '42501';
  end if;

  if from_ts is null or to_ts is null or from_ts > to_ts then
    raise exception 'Plage de dates invalide' using errcode = '22023';
  end if;

  delete from public.transactions
  where created_at >= from_ts and created_at <= to_ts;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_transactions(timestamptz, timestamptz) from public;
grant execute on function public.purge_transactions(timestamptz, timestamptz) to authenticated;
