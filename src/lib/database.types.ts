export type Role = 'admin' | 'seller'

export interface Profile {
  id: string
  role: Role
  display_name: string
  active: boolean
  created_at: string
}

export interface Category {
  id: string
  name: string
  sort_order: number
  archived: boolean
  created_at: string
}

export interface Product {
  id: string
  category_id: string | null
  name: string
  cost_price_cents: number
  sale_price_cents: number
  commission_cents: number
  /**
   * Stock du produit.
   *   - portion_grams = null  → stock en nombre de pièces
   *   - portion_grams = N > 0 → stock en grammes (vente au poids)
   */
  stock: number
  /**
   * Si non null, l'article se vend au poids :
   * une "unité vendue" décrémente le stock de portion_grams grammes.
   * null = vente à l'unité (défaut).
   */
  portion_grams: number | null
  image_path: string | null
  archived: boolean
  created_at: string
}

export interface Transaction {
  id: string
  seller_id: string
  total_cents: number
  note: string | null
  created_at: string
}

export interface TransactionItem {
  id: string
  transaction_id: string
  product_id: string | null
  product_name: string
  unit_cost_cents: number
  unit_sale_cents: number
  unit_commission_cents: number
  /** Snapshot du portion_grams au moment de la vente (null = vendu à l'unité). */
  unit_portion_grams: number | null
  qty: number
}

export interface CheckoutItem {
  product_id: string
  qty: number
}

export function clientPriceCents(p: Pick<Product, 'sale_price_cents' | 'commission_cents'>): number {
  return p.sale_price_cents + p.commission_cents
}

export function lineClientCents(
  it: Pick<TransactionItem, 'unit_sale_cents' | 'unit_commission_cents' | 'qty'>
): number {
  return (it.unit_sale_cents + it.unit_commission_cents) * it.qty
}

/**
 * Nombre d'unités vendables d'un produit.
 *   - article à l'unité : c'est `stock` lui-même
 *   - article au poids  : `floor(stock_grammes / portion_grams)`
 */
export function availableUnits(
  p: Pick<Product, 'stock' | 'portion_grams'>
): number {
  if (p.portion_grams && p.portion_grams > 0) {
    return Math.floor(p.stock / p.portion_grams)
  }
  return p.stock
}

export function isWeightBased(
  p: Pick<Product, 'portion_grams'>
): boolean {
  return p.portion_grams != null && p.portion_grams > 0
}

/** Formate un poids en g ou kg pour l'affichage. */
export function formatGrams(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000
    return `${kg.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`
  }
  return `${grams} g`
}
