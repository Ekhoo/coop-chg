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

interface ProductBreakdown {
  product_name: string
  qty: number
  client_cents: number
  caserne_cents: number
  commission_cents: number
  cost_cents: number
  margin_cents: number
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
    let clientTotal = 0
    let caserneTotal = 0
    let commissionTotal = 0
    let costTotal = 0
    const txCount = txs.length
    const byProductMap = new Map<string, ProductBreakdown>()
    const bySellerMap = new Map<
      string,
      { seller_name: string; qty: number; client_cents: number }
    >()

    for (const t of txs) {
      const sellerEntry = bySellerMap.get(t.seller_id) ?? {
        seller_name: t.seller_name,
        qty: 0,
        client_cents: 0,
      }
      sellerEntry.client_cents += t.total_cents

      for (const it of t.items) {
        const lineClient = (it.unit_sale_cents + it.unit_commission_cents) * it.qty
        const lineCaserne = it.unit_sale_cents * it.qty
        const lineCommission = it.unit_commission_cents * it.qty
        const lineCost = it.unit_cost_cents * it.qty

        clientTotal += lineClient
        caserneTotal += lineCaserne
        commissionTotal += lineCommission
        costTotal += lineCost
        sellerEntry.qty += it.qty

        const entry =
          byProductMap.get(it.product_name) ??
          ({
            product_name: it.product_name,
            qty: 0,
            client_cents: 0,
            caserne_cents: 0,
            commission_cents: 0,
            cost_cents: 0,
            margin_cents: 0,
          } satisfies ProductBreakdown)
        entry.qty += it.qty
        entry.client_cents += lineClient
        entry.caserne_cents += lineCaserne
        entry.commission_cents += lineCommission
        entry.cost_cents += lineCost
        entry.margin_cents += lineCaserne - lineCost
        byProductMap.set(it.product_name, entry)
      }
      bySellerMap.set(t.seller_id, sellerEntry)
    }
    const byProduct = [...byProductMap.values()].sort((a, b) => b.client_cents - a.client_cents)
    const bySeller = [...bySellerMap.values()].sort((a, b) => b.client_cents - a.client_cents)
    return {
      clientTotal,
      caserneTotal,
      commissionTotal,
      costTotal,
      caserneMargin: caserneTotal - costTotal,
      txCount,
      byProduct,
      bySeller,
    }
  }, [data])

  async function handleExportPdf() {
    if (!data) return
    const { generateSalesPdf } = await import('@/lib/pdf')
    generateSalesPdf({
      from: fromDate,
      to: toDate,
      clientTotal: stats.clientTotal,
      caserneTotal: stats.caserneTotal,
      commissionTotal: stats.commissionTotal,
      costTotal: stats.costTotal,
      caserneMargin: stats.caserneMargin,
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

  const ticketAvg = stats.txCount > 0 ? stats.clientTotal / stats.txCount : 0

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Total client" value={formatPrice(stats.clientTotal)} accent="brand" />
        <Kpi label="Part caserne" value={formatPrice(stats.caserneTotal)} />
        <Kpi label="Caisse noire" value={formatPrice(stats.commissionTotal)} accent="purple" />
        <Kpi label="Coût d'achat" value={formatPrice(stats.costTotal)} muted />
        <Kpi
          label="Marge caserne"
          value={formatPrice(stats.caserneMargin)}
          accent={stats.caserneMargin >= 0 ? 'green' : 'red'}
        />
        <Kpi label="Transactions" value={`${stats.txCount} • ⌀ ${formatPrice(Math.round(ticketAvg))}`} />
      </div>

      <div className="card overflow-x-auto">
        <div className="px-4 py-2 border-b border-slate-200 font-semibold text-sm">
          Ventilation par article
        </div>
        {stats.byProduct.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">Aucune vente sur la période.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Article</th>
                <th className="text-right px-3 py-2">Qté</th>
                <th className="text-right px-3 py-2">Client</th>
                <th className="text-right px-3 py-2">Caserne</th>
                <th className="text-right px-3 py-2">Caisse noire</th>
                <th className="text-right px-3 py-2">Coût</th>
                <th className="text-right px-3 py-2">Marge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.byProduct.map((r) => (
                <tr key={r.product_name}>
                  <td className="px-3 py-2 font-medium">{r.product_name}</td>
                  <td className="px-3 py-2 text-right">{r.qty}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatPrice(r.client_cents)}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(r.caserne_cents)}</td>
                  <td className="px-3 py-2 text-right text-purple-700">
                    {formatPrice(r.commission_cents)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">
                    {formatPrice(r.cost_cents)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      r.margin_cents < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {formatPrice(r.margin_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto">
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
                <th className="text-right px-3 py-2 w-28">Articles</th>
                <th className="text-right px-3 py-2 w-28">Total client</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.bySeller.map((r) => (
                <tr key={r.seller_name}>
                  <td className="px-3 py-2">{r.seller_name}</td>
                  <td className="px-3 py-2 text-right">{r.qty}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatPrice(r.client_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
          <div className="overflow-x-auto">
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
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  accent,
  muted,
}: {
  label: string
  value: string
  accent?: 'brand' | 'purple' | 'green' | 'red'
  muted?: boolean
}) {
  const valueColor =
    accent === 'brand'
      ? 'text-brand-700'
      : accent === 'purple'
        ? 'text-purple-700'
        : accent === 'green'
          ? 'text-emerald-700'
          : accent === 'red'
            ? 'text-red-600'
            : muted
              ? 'text-slate-500'
              : 'text-slate-900'
  return (
    <div className="card p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${valueColor}`}>{value}</div>
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
