import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Pencil, Plus, Image as ImageIcon, Archive, ArchiveRestore, Minus, Search,
} from 'lucide-react'
import { supabase, publicImageUrl } from '@/lib/supabase'
import { useProducts, useCategories } from '@/hooks/useProducts'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'
import { ArchivedBadge, StockBadge } from '@/components/Badge'
import { formatPrice, parsePriceToCents } from '@/lib/format'
import {
  availableUnits,
  clientPriceCents,
  formatGrams,
  isWeightBased,
  type Product,
} from '@/lib/database.types'
import { CategoriesSection } from './Categories'

export function ProductsPage() {
  const { data: products = [], isLoading } = useProducts({ includeArchived: true })
  const { data: categories = [] } = useCategories({ includeArchived: true })
  const [editing, setEditing] = useState<Product | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (!showArchived && p.archived) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [products, search, showArchived])

  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Stock</h1>

      <CategoriesSection />

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Articles</h2>
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Nouvel article
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Rechercher un article…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Inclure archivés
        </label>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-slate-500">Aucun article.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 w-14"></th>
                <th className="text-left px-3 py-2">Nom</th>
                <th className="text-left px-3 py-2">Catégorie</th>
                <th className="text-right px-3 py-2 w-24">Achat</th>
                <th className="text-right px-3 py-2 w-24">Vente</th>
                <th className="text-right px-3 py-2 w-24">Comm.</th>
                <th className="text-right px-3 py-2 w-24">Client</th>
                <th className="text-center px-3 py-2 w-44">Stock</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  categoryName={p.category_id ? categoryById[p.category_id] : undefined}
                  onEdit={() => setEditing(p)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

        {creating && <ProductFormModal categories={categories} onClose={() => setCreating(false)} />}
        {editing && (
          <ProductFormModal
            product={editing}
            categories={categories}
            onClose={() => setEditing(null)}
          />
        )}
      </section>
    </div>
  )
}

function ProductRow({
  product,
  categoryName,
  onEdit,
}: {
  product: Product
  categoryName?: string
  onEdit: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const imageUrl = publicImageUrl(product.image_path)

  // Pour les articles au poids, +/- ajuste d'une portion (= portion_grams g).
  // Pour les articles à l'unité, +/- 1.
  const stockStep = product.portion_grams ?? 1
  const adjustStock = useMutation({
    mutationFn: async (delta: number) => {
      const next = Math.max(0, product.stock + delta * stockStep)
      const { error } = await supabase
        .from('products')
        .update({ stock: next })
        .eq('id', product.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  const sellableUnits = availableUnits(product)
  const weight = isWeightBased(product)

  return (
    <tr className={product.archived ? 'opacity-50' : ''}>
      <td className="px-3 py-2">
        <div className="h-10 w-10 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-slate-300" />
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{product.name}</span>
          {weight && product.portion_grams != null && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-600/20">
              {formatGrams(product.portion_grams)}/portion
            </span>
          )}
          {product.archived && <ArchivedBadge />}
        </div>
      </td>
      <td className="px-3 py-2 text-slate-600">{categoryName ?? '—'}</td>
      <td className="px-3 py-2 text-right text-slate-500">
        {formatPrice(product.cost_price_cents)}
      </td>
      <td className="px-3 py-2 text-right">{formatPrice(product.sale_price_cents)}</td>
      <td className="px-3 py-2 text-right text-purple-700">
        {formatPrice(product.commission_cents)}
      </td>
      <td className="px-3 py-2 text-right font-bold text-brand-700">
        {formatPrice(clientPriceCents(product))}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => adjustStock.mutate(-1)}
              disabled={product.stock <= 0 || adjustStock.isPending}
              className="rounded-md border border-slate-300 p-1 hover:bg-slate-50 disabled:opacity-30"
              title={weight ? `−1 portion (${stockStep} g)` : '−1'}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-10 text-center font-semibold tabular-nums">
              {sellableUnits}
            </span>
            <button
              onClick={() => adjustStock.mutate(+1)}
              disabled={adjustStock.isPending}
              className="rounded-md border border-slate-300 p-1 hover:bg-slate-50"
              title={weight ? `+1 portion (${stockStep} g)` : '+1'}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <StockBadge stock={sellableUnits} />
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={onEdit}
          className="text-slate-400 hover:text-brand-600 p-1"
          title="Modifier"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

function ProductFormModal({
  product,
  categories,
  onClose,
}: {
  product?: Product
  categories: { id: string; name: string }[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState<string>(product?.category_id ?? '')
  const centsToText = (c: number) => (c / 100).toString().replace('.', ',')
  const [costText, setCostText] = useState(product ? centsToText(product.cost_price_cents) : '')
  const [saleText, setSaleText] = useState(product ? centsToText(product.sale_price_cents) : '')
  const [commissionText, setCommissionText] = useState(
    product ? centsToText(product.commission_cents) : '0'
  )
  const [stock, setStock] = useState(String(product?.stock ?? 0))
  const [imagePath, setImagePath] = useState<string | null>(product?.image_path ?? null)
  const [archived, setArchived] = useState(product?.archived ?? false)
  const [uploading, setUploading] = useState(false)

  // Mode "vente au poids" : peut être modifié à tout moment.
  // Si l'admin change le mode en édition, on l'avertit que le stock change de sens.
  const isEditing = !!product
  const initialWeightBased = product?.portion_grams != null && product.portion_grams > 0
  const [weightBased, setWeightBased] = useState(initialWeightBased)
  const [portionGramsText, setPortionGramsText] = useState(
    product?.portion_grams ? String(product.portion_grams) : ''
  )
  const modeChanged = isEditing && weightBased !== initialWeightBased

  const saleCentsPreview = parsePriceToCents(saleText) ?? 0
  const commissionCentsPreview = parsePriceToCents(commissionText) ?? 0
  const clientCentsPreview = saleCentsPreview + commissionCentsPreview

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: false })
      if (error) throw error
      setImagePath(path)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload impossible')
    } finally {
      setUploading(false)
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const cost = parsePriceToCents(costText)
      const sale = parsePriceToCents(saleText)
      const commission = parsePriceToCents(commissionText)
      if (cost === null) throw new Error("Prix d'achat invalide")
      if (sale === null) throw new Error('Prix de vente invalide')
      if (commission === null) throw new Error('Commission invalide')
      const stockNum = Number(stock)
      if (!Number.isInteger(stockNum) || stockNum < 0) throw new Error('Stock invalide')

      // portion_grams : peut être modifié à tout moment.
      let portionGrams: number | null = null
      if (weightBased) {
        const pg = Number(portionGramsText)
        if (!Number.isInteger(pg) || pg <= 0) {
          throw new Error('Poids par portion invalide (doit être un entier > 0)')
        }
        portionGrams = pg
      }

      const payload = {
        name: name.trim(),
        category_id: categoryId || null,
        cost_price_cents: cost,
        sale_price_cents: sale,
        commission_cents: commission,
        stock: stockNum,
        image_path: imagePath,
        archived,
        portion_grams: portionGrams,
      }
      if (product) {
        const { error } = await supabase.from('products').update(payload).eq('id', product.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success(product ? 'Article mis à jour' : 'Article créé')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    save.mutate()
  }

  const previewUrl = publicImageUrl(imagePath)

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? 'Modifier l\'article' : 'Nouvel article'}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button
            onClick={handleSubmit}
            className="btn-primary"
            disabled={save.isPending || uploading}
          >
            Enregistrer
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-24 w-24 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-8 w-8 text-slate-300" />
            )}
          </div>
          <div className="flex-1">
            <label className="label">Image (optionnelle)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
              className="text-sm w-full"
              disabled={uploading}
            />
            {imagePath && (
              <button
                type="button"
                onClick={() => setImagePath(null)}
                className="text-xs text-red-600 hover:underline mt-1"
              >
                Retirer l'image
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="label">Nom</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div>
          <label className="label">Catégorie</label>
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— Sans catégorie —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Prix d'achat (€)</label>
            <input
              className="input"
              inputMode="decimal"
              value={costText}
              onChange={(e) => setCostText(e.target.value)}
              placeholder="1,00"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">Ce que la caserne paye.</p>
          </div>
          <div>
            <label className="label">Prix de vente (€)</label>
            <input
              className="input"
              inputMode="decimal"
              value={saleText}
              onChange={(e) => setSaleText(e.target.value)}
              placeholder="1,50"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">Revient au foyer.</p>
          </div>
          <div>
            <label className="label">Commission (€)</label>
            <input
              className="input"
              inputMode="decimal"
              value={commissionText}
              onChange={(e) => setCommissionText(e.target.value)}
              placeholder="0,10"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">Caisse noire.</p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Prix client (vente + commission)</span>
            <span className="font-bold text-brand-700">{formatPrice(clientCentsPreview)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 space-y-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={weightBased}
              onChange={(e) => setWeightBased(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Vente au poids</span>
              <span className="block text-[11px] text-slate-500">
                Cocher si l'article se vend par portions de poids fixe (ex. 100 g de bonbons).
              </span>
            </span>
          </label>

          {weightBased && (
            <div>
              <label className="label">Poids par portion (g)</label>
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={portionGramsText}
                onChange={(e) => setPortionGramsText(e.target.value)}
                placeholder="100"
                required
              />
            </div>
          )}

          <div>
            <label className="label">
              {weightBased ? 'Stock total (g)' : 'Stock (unités)'}
            </label>
            <input
              className="input"
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              required
            />
            {weightBased && portionGramsText && Number(portionGramsText) > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                ≈ {Math.floor((Number(stock) || 0) / Number(portionGramsText))} portions de{' '}
                {portionGramsText} g
              </p>
            )}
          </div>

          {modeChanged && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800 flex gap-2">
              <span className="text-amber-600 shrink-0">⚠️</span>
              <span>
                Tu changes le mode de vente. La valeur du stock va être interprétée différemment
                ({weightBased ? 'en grammes' : 'en pièces'} après enregistrement). Pense à
                ajuster le champ Stock ci-dessus avant d'enregistrer si la valeur n'est plus la
                bonne.
              </span>
            </div>
          )}
        </div>

        {product && (
          <button
            type="button"
            onClick={() => setArchived((a) => !a)}
            className="btn-secondary"
          >
            {archived ? (
              <><ArchiveRestore className="h-4 w-4" /> Restaurer</>
            ) : (
              <><Archive className="h-4 w-4" /> Archiver</>
            )}
          </button>
        )}
      </form>
    </Modal>
  )
}
