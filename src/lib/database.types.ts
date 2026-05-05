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
  price_cents: number
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
  unit_price_cents: number
  qty: number
}

export interface CheckoutItem {
  product_id: string
  qty: number
}
