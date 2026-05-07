import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  FileText,
  Wallet,
  Building2,
  Sparkles,
  ShoppingBag,
  TrendingUp,
  Receipt,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { startOfMonth, endOfMonth, startOfDay, endOfDay, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { formatPrice, formatDateTime, formatDate } from '@/lib/format'
import { DbHealth } from '@/components/DbHealth'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { usePurgeTransactions } from '@/hooks/useDbStats'
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Rapports</h1>
        <div className="flex items-center gap-2">
          <PurgeButton
            from={fromDate}
            to={toDate}
            count={stats.txCount}
            disabled={isLoading}
          />
          <button
            onClick={handleExportPdf}
            disabled={!data || data.length === 0}
            className="btn-primary"
          >
            <Download className="h-4 w-4" /> Export PDF
          </button>
        </div>
      </div>

      <DbHealth />

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
        <Kpi
          label="Total client"
          value={formatPrice(stats.clientTotal)}
          icon={<Wallet className="h-5 w-5" />}
          color="brand"
        />
        <Kpi
          label="Part caserne"
          value={formatPrice(stats.caserneTotal)}
          icon={<Building2 className="h-5 w-5" />}
          color="sky"
        />
        <Kpi
          label="Caisse noire"
          value={formatPrice(stats.commissionTotal)}
          icon={<Sparkles className="h-5 w-5" />}
          color="purple"
        />
        <Kpi
          label="Coût d'achat"
          value={formatPrice(stats.costTotal)}
          icon={<ShoppingBag className="h-5 w-5" />}
          color="slate"
        />
        <Kpi
          label="Marge caserne"
          value={formatPrice(stats.caserneMargin)}
          icon={<TrendingUp className="h-5 w-5" />}
          color={stats.caserneMargin >= 0 ? 'emerald' : 'rose'}
        />
        <Kpi
          label="Transactions"
          value={`${stats.txCount}`}
          subtitle={`⌀ ${formatPrice(Math.round(ticketAvg))}`}
          icon={<Receipt className="h-5 w-5" />}
          color="amber"
        />
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

type KpiColor = 'brand' | 'purple' | 'emerald' | 'rose' | 'sky' | 'amber' | 'slate'

const kpiColorMap: Record<KpiColor, { bg: string; text: string; valueText: string }> = {
  brand: { bg: 'bg-brand-50', text: 'text-brand-600', valueText: 'text-brand-700' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', valueText: 'text-purple-700' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', valueText: 'text-emerald-700' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', valueText: 'text-rose-700' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-600', valueText: 'text-sky-700' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', valueText: 'text-amber-700' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600', valueText: 'text-slate-700' },
}

function Kpi({
  label,
  value,
  subtitle,
  icon,
  color = 'slate',
}: {
  label: string
  value: string
  subtitle?: string
  icon: ReactNode
  color?: KpiColor
}) {
  const c = kpiColorMap[color]
  return (
    <div className="card p-3 flex items-start gap-3">
      <div className={`shrink-0 rounded-xl p-2 ${c.bg} ${c.text}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 truncate">{label}</div>
        <div className={`text-lg font-bold mt-0.5 ${c.valueText}`}>{value}</div>
        {subtitle && <div className="text-[11px] text-slate-400 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  )
}

function PurgeButton({
  from,
  to,
  count,
  disabled,
}: {
  from: Date
  to: Date
  count: number
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const purge = usePurgeTransactions()
  const toast = useToast()

  async function handleConfirm() {
    try {
      const deleted = await purge.mutateAsync({ from, to })
      toast.success(
        deleted === 0
          ? 'Aucune transaction à supprimer sur cette période.'
          : `${deleted} transaction${deleted > 1 ? 's' : ''} supprimée${deleted > 1 ? 's' : ''}.`
      )
      setOpen(false)
      setConfirmText('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la purge')
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled || count === 0}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={count === 0 ? 'Aucune transaction sur cette période' : 'Supprimer les transactions de la période'}
      >
        <Trash2 className="h-4 w-4" />
        Purger
      </button>

      {open && (
        <Modal
          open
          onClose={() => {
            setOpen(false)
            setConfirmText('')
          }}
          title="Purger les transactions"
          footer={
            <>
              <button
                onClick={() => {
                  setOpen(false)
                  setConfirmText('')
                }}
                className="btn-secondary"
                disabled={purge.isPending}
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={purge.isPending || confirmText !== 'PURGER'}
                className="btn-danger"
              >
                <Trash2 className="h-4 w-4" />
                {purge.isPending ? 'Suppression…' : `Supprimer ${count} transaction${count > 1 ? 's' : ''}`}
              </button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <div className="font-semibold">Action irréversible</div>
                <p className="mt-1">
                  Tu vas supprimer définitivement <strong>{count}</strong> transaction
                  {count > 1 ? 's' : ''} entre le <strong>{formatDate(from.toISOString())}</strong>{' '}
                  et le <strong>{formatDate(to.toISOString())}</strong>.
                </p>
              </div>
            </div>

            <div className="text-slate-600 space-y-2">
              <p>
                Pense à <strong>exporter le PDF</strong> de cette période avant la purge si tu veux
                garder une trace.
              </p>
              <p className="text-xs text-slate-500">
                Note : l'espace disque est récupéré progressivement par PostgreSQL après la
                suppression. Le pourcentage de la base peut mettre quelques minutes à diminuer.
              </p>
            </div>

            <div>
              <label className="label">
                Pour confirmer, tape <code className="text-red-700 font-mono">PURGER</code>{' '}
                ci-dessous :
              </label>
              <input
                className="input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="PURGER"
                autoFocus
              />
            </div>
          </div>
        </Modal>
      )}
    </>
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
