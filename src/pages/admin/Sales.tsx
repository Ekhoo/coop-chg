import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText } from 'lucide-react'
import { startOfMonth, endOfMonth, startOfDay, endOfDay, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { formatPrice, formatDateTime } from '@/lib/format'
import type { Profile, Transaction, TransactionItem } from '@/lib/database.types'

interface TxWithDetails extends Transaction {
  items: TransactionItem[]
  seller_name: string
}

export function SalesPage() {
  const today = new Date()
  const [from, setFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))

  const fromDate = startOfDay(new Date(from))
  const toDate = endOfDay(new Date(to))

  const { data, isLoading } = useQuery({
    queryKey: ['sales', from, to],
    queryFn: async (): Promise<TxWithDetails[]> => {
      const { data: txs, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
        .order('created_at', { ascending: false })
      if (txErr) throw txErr
      const transactions = (txs ?? []) as Transaction[]
      if (transactions.length === 0) return []

      const ids = transactions.map((t) => t.id)
      const { data: items, error: itErr } = await supabase
        .from('transaction_items')
        .select('*')
        .in('transaction_id', ids)
      if (itErr) throw itErr

      const sellerIds = Array.from(new Set(transactions.map((t) => t.seller_id)))
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', sellerIds)
      if (pErr) throw pErr
      const profileById = Object.fromEntries(
        (profiles as Pick<Profile, 'id' | 'display_name'>[]).map((p) => [p.id, p.display_name])
      )

      const itemsByTx = new Map<string, TransactionItem[]>()
      for (const it of (items ?? []) as TransactionItem[]) {
        const arr = itemsByTx.get(it.transaction_id) ?? []
        arr.push(it)
        itemsByTx.set(it.transaction_id, arr)
      }

      return transactions.map((t) => ({
        ...t,
        items: itemsByTx.get(t.id) ?? [],
        seller_name: profileById[t.seller_id] ?? '—',
      }))
    },
  })

  const stats = useMemo(() => {
    const txs = data ?? []
    const totalCents = txs.reduce((s, t) => s + t.total_cents, 0)
    const txCount = txs.length
    const byProductMap = new Map<string, { product_name: string; qty: number; revenue_cents: number }>()
    const bySellerMap = new Map<string, { seller_name: string; qty: number; revenue_cents: number }>()
    for (const t of txs) {
      const sellerKey = t.seller_id
      const sellerEntry = bySellerMap.get(sellerKey) ?? {
        seller_name: t.seller_name,
        qty: 0,
        revenue_cents: 0,
      }
      sellerEntry.revenue_cents += t.total_cents
      for (const it of t.items) {
        sellerEntry.qty += it.qty
        const key = it.product_name
        const entry = byProductMap.get(key) ?? {
          product_name: it.product_name,
          qty: 0,
          revenue_cents: 0,
        }
        entry.qty += it.qty
        entry.revenue_cents += it.qty * it.unit_price_cents
        byProductMap.set(key, entry)
      }
      bySellerMap.set(sellerKey, sellerEntry)
    }
    const byProduct = [...byProductMap.values()].sort((a, b) => b.revenue_cents - a.revenue_cents)
    const bySeller = [...bySellerMap.values()].sort((a, b) => b.revenue_cents - a.revenue_cents)
    return { totalCents, txCount, byProduct, bySeller }
  }, [data])

  async function handleExportPdf() {
    if (!data) return
    const { generateSalesPdf } = await import('@/lib/pdf')
    generateSalesPdf({
      from: fromDate,
      to: toDate,
      totalCents: stats.totalCents,
      txCount: stats.txCount,
      byProduct: stats.byProduct,
      bySeller: stats.bySeller,
      transactions: data.map((t) => ({
        created_at: t.created_at,
        seller_name: t.seller_name,
        items_count: t.items.reduce((s, it) => s + it.qty, 0),
        total_cents: t.total_cents,
      })),
    })
  }

  const ticketAvg = stats.txCount > 0 ? stats.totalCents / stats.txCount : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Ventes</h1>
        <button
          onClick={handleExportPdf}
          disabled={!data || data.length === 0}
          className="btn-primary"
        >
          <Download className="h-4 w-4" /> Export PDF
        </button>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Du</label>
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            max={to}
          />
        </div>
        <div>
          <label className="label">Au</label>
          <input
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            min={from}
          />
        </div>
        <DatePresets onPick={(f, t) => { setFrom(f); setTo(t) }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Total des ventes" value={formatPrice(stats.totalCents)} />
        <Kpi label="Transactions" value={String(stats.txCount)} />
        <Kpi label="Ticket moyen" value={formatPrice(Math.round(ticketAvg))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 font-semibold text-sm">
            Top articles
          </div>
          {stats.byProduct.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">Aucune vente sur la période.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Article</th>
                  <th className="text-right px-3 py-2 w-20">Qté</th>
                  <th className="text-right px-3 py-2 w-24">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.byProduct.map((r) => (
                  <tr key={r.product_name}>
                    <td className="px-3 py-2">{r.product_name}</td>
                    <td className="px-3 py-2 text-right">{r.qty}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatPrice(r.revenue_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 font-semibold text-sm">
            Par vendeur
          </div>
          {stats.bySeller.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">—</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Vendeur</th>
                  <th className="text-right px-3 py-2 w-20">Articles</th>
                  <th className="text-right px-3 py-2 w-24">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.bySeller.map((r) => (
                  <tr key={r.seller_name}>
                    <td className="px-3 py-2">{r.seller_name}</td>
                    <td className="px-3 py-2 text-right">{r.qty}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatPrice(r.revenue_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 font-semibold text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Transactions ({stats.txCount})
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-slate-500">Chargement…</div>
        ) : (data ?? []).length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">Aucune transaction.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Vendeur</th>
                <th className="text-left px-3 py-2">Articles</th>
                <th className="text-right px-3 py-2 w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                  <td className="px-3 py-2">{t.seller_name}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {t.items.map((it) => `${it.qty}× ${it.product_name}`).join(', ')}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatPrice(t.total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  )
}

function DatePresets({ onPick }: { onPick: (from: string, to: string) => void }) {
  const today = new Date()
  return (
    <div className="flex gap-1 ml-auto">
      <button
        type="button"
        className="btn-secondary text-xs"
        onClick={() => {
          const d = format(today, 'yyyy-MM-dd')
          onPick(d, d)
        }}
      >
        Aujourd'hui
      </button>
      <button
        type="button"
        className="btn-secondary text-xs"
        onClick={() => {
          onPick(
            format(startOfMonth(today), 'yyyy-MM-dd'),
            format(endOfMonth(today), 'yyyy-MM-dd')
          )
        }}
      >
        Ce mois
      </button>
    </div>
  )
}
