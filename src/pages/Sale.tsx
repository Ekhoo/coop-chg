import { useMemo, useState } from 'react'
import { Minus, Plus, ShoppingCart, Trash2, Image as ImageIcon, Check } from 'lucide-react'
import { useProducts, useCategories } from '@/hooks/useProducts'
import { useCart, cartTotal } from '@/hooks/useCart'
import { useCheckout } from '@/hooks/useCheckout'
import { useToast } from '@/components/Toast'
import { formatPrice } from '@/lib/format'
import { publicImageUrl } from '@/lib/supabase'
import type { Product } from '@/lib/database.types'

export function Sale() {
  const { data: products = [], isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const cart = useCart()
  const total = cartTotal(cart.lines)
  const checkout = useCheckout()
  const toast = useToast()
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all')
  const [showCart, setShowCart] = useState(false)

  const filtered = useMemo(() => {
    if (selectedCategory === 'all') return products
    return products.filter((p) => p.category_id === selectedCategory)
  }, [products, selectedCategory])

  async function handleValidate() {
    if (cart.lines.length === 0) return
    try {
      await checkout.mutateAsync({
        items: cart.lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
      })
      toast.success(`Vente validée : ${formatPrice(total)}`)
      cart.clear()
      setShowCart(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la vente'
      toast.error(msg)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <CategoryTabs
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        {isLoading ? (
          <div className="text-slate-500 py-8 text-center">Chargement des articles…</div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 py-8 text-center">Aucun article dans cette catégorie.</div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 mt-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={() => cart.add(p)} />
            ))}
          </div>
        )}
      </div>

      <aside className="hidden lg:block">
        <CartPanel
          total={total}
          onValidate={handleValidate}
          submitting={checkout.isPending}
        />
      </aside>

      <button
        onClick={() => setShowCart(true)}
        className="lg:hidden fixed bottom-4 right-4 z-30 btn-primary shadow-lg"
        disabled={cart.lines.length === 0}
      >
        <ShoppingCart className="h-5 w-5" />
        {cart.lines.length > 0 && (
          <>
            <span>{cart.lines.reduce((s, l) => s + l.qty, 0)}</span>
            <span className="font-bold">{formatPrice(total)}</span>
          </>
        )}
      </button>

      {showCart && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/50"
          onClick={() => setShowCart(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <CartPanel
              total={total}
              onValidate={handleValidate}
              submitting={checkout.isPending}
              onClose={() => setShowCart(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryTabs({
  categories,
  selected,
  onSelect,
}: {
  categories: { id: string; name: string }[]
  selected: string | 'all'
  onSelect: (id: string | 'all') => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      <CategoryTab active={selected === 'all'} onClick={() => onSelect('all')}>
        Tous
      </CategoryTab>
      {categories.map((c) => (
        <CategoryTab key={c.id} active={selected === c.id} onClick={() => onSelect(c.id)}>
          {c.name}
        </CategoryTab>
      ))}
    </div>
  )
}

function CategoryTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const out = product.stock <= 0
  const imageUrl = publicImageUrl(product.image_path)

  return (
    <button
      onClick={onAdd}
      disabled={out}
      className={`card flex flex-col text-left overflow-hidden transition-transform active:scale-95 ${
        out ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md cursor-pointer'
      }`}
    >
      <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-10 w-10 text-slate-300" />
        )}
      </div>
      <div className="p-2 flex-1 flex flex-col">
        <div className="font-medium text-sm leading-tight line-clamp-2 text-slate-900">
          {product.name}
        </div>
        <div className="mt-auto pt-1 flex items-end justify-between">
          <span className="font-bold text-brand-700">{formatPrice(product.price_cents)}</span>
          <span className={`text-xs ${out ? 'text-red-600' : 'text-slate-500'}`}>
            {out ? 'Rupture' : `Stock: ${product.stock}`}
          </span>
        </div>
      </div>
    </button>
  )
}

function CartPanel({
  total,
  onValidate,
  submitting,
  onClose,
}: {
  total: number
  onValidate: () => void
  submitting: boolean
  onClose?: () => void
}) {
  const cart = useCart()

  return (
    <div className="card flex flex-col h-full max-h-full lg:sticky lg:top-4">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="h-4 w-4" />
          Panier
        </div>
        {cart.lines.length > 0 && (
          <button
            onClick={() => cart.clear()}
            className="text-xs text-slate-500 hover:text-red-600"
          >
            Vider
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {cart.lines.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            Sélectionnez des articles
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cart.lines.map((line) => (
              <li key={line.product_id} className="p-3 flex gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{line.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatPrice(line.unit_price_cents)} × {line.qty} ={' '}
                    <span className="font-semibold text-slate-700">
                      {formatPrice(line.unit_price_cents * line.qty)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => cart.setQty(line.product_id, line.qty - 1)}
                    className="rounded-md border border-slate-300 p-1 hover:bg-slate-50"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{line.qty}</span>
                  <button
                    onClick={() => cart.setQty(line.product_id, line.qty + 1)}
                    disabled={line.qty >= line.stock}
                    className="rounded-md border border-slate-300 p-1 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => cart.remove(line.product_id)}
                    className="rounded-md p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between text-lg">
          <span className="font-medium text-slate-700">Total</span>
          <span className="font-bold text-brand-700">{formatPrice(total)}</span>
        </div>
        <button
          onClick={onValidate}
          disabled={cart.lines.length === 0 || submitting}
          className="btn-primary w-full text-base py-3"
        >
          <Check className="h-5 w-5" />
          {submitting ? 'Validation…' : 'Valider la vente'}
        </button>
        {onClose && (
          <button onClick={onClose} className="btn-secondary w-full">
            Continuer
          </button>
        )}
      </div>
    </div>
  )
}
