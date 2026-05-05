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
  stock: number
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
