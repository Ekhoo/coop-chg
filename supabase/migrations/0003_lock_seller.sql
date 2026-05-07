-- Coop Nico — verrouillage des vendeurs
--
-- Restreint la lecture des transactions et de leurs lignes :
--   * Un vendeur ne voit QUE ses propres ventes
--   * Un admin voit tout
--
-- Les ventes restent insérables par tout vendeur actif (via la RPC checkout).

-- =========================================================
-- transactions : lecture limitée à ses propres ventes
-- =========================================================

drop policy if exists transactions_read on public.transactions;
create policy transactions_read on public.transactions
  for select using (
    public.is_admin()
    or seller_id = auth.uid()
  );

-- =========================================================
-- transaction_items : lecture limitée aux items de ses propres ventes
-- =========================================================

drop policy if exists tx_items_read on public.transaction_items;
create policy tx_items_read on public.transaction_items
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.seller_id = auth.uid()
    )
  );
