import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { availableUnits, type Product } from '@/lib/database.types'

export interface CartLine {
  product_id: string
  name: string
  unit_sale_cents: number
  unit_commission_cents: number
  qty: number
  /**
   * Nombre maximum d'unités vendables (= portions disponibles pour les
   * articles au poids, = stock pour les articles à l'unité).
   */
  stock: number
  /** Si défini, l'article est vendu au poids ; chaque qty = 1 portion. */
  portion_grams: number | null
}

interface CartStore {
  lines: CartLine[]
  add: (product: Product) => void
  setQty: (product_id: string, qty: number) => void
  remove: (product_id: string) => void
  clear: () => void
}

export const useCart = create<CartStore>()(
  persist(
    (set) => ({
      lines: [],
      add: (product) =>
        set((state) => {
          // Stock interprété en "unités vendables" : pour weight-based,
          // c'est le nombre de portions qu'il reste.
          const sellableUnits = availableUnits(product)
          const existing = state.lines.find((l) => l.product_id === product.id)
          if (existing) {
            if (existing.qty + 1 > sellableUnits) return state
            return {
              lines: state.lines.map((l) =>
                l.product_id === product.id ? { ...l, qty: l.qty + 1 } : l
              ),
            }
          }
          if (sellableUnits <= 0) return state
          return {
            lines: [
              ...state.lines,
              {
                product_id: product.id,
                name: product.name,
                unit_sale_cents: product.sale_price_cents,
                unit_commission_cents: product.commission_cents,
                qty: 1,
                stock: sellableUnits,
                portion_grams: product.portion_grams,
              },
            ],
          }
        }),
      setQty: (product_id, qty) =>
        set((state) => ({
          lines: state.lines
            .map((l) =>
              l.product_id === product_id
                ? { ...l, qty: Math.max(0, Math.min(l.stock, qty)) }
                : l
            )
            .filter((l) => l.qty > 0),
        })),
      remove: (product_id) =>
        set((state) => ({ lines: state.lines.filter((l) => l.product_id !== product_id) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'coop-nico-cart', version: 3 }
  )
)

export function lineUnitCents(line: CartLine): number {
  return line.unit_sale_cents + line.unit_commission_cents
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineUnitCents(l) * l.qty, 0)
}
