import { Database, HardDrive, AlertTriangle } from 'lucide-react'
import {
  useDbStats,
  formatBytes,
  FREE_TIER_DB_BYTES,
  FREE_TIER_STORAGE_BYTES,
} from '@/hooks/useDbStats'
import { formatDate } from '@/lib/format'

export function DbHealth() {
  const { data, isLoading, error } = useDbStats()

  if (isLoading) {
    return (
      <div className="card p-4 text-sm text-slate-500">
        Chargement de l'état de la base…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="card p-4 text-sm text-red-700 bg-red-50 border-red-200">
        Impossible de récupérer l'état de la base. La fonction{' '}
        <code className="text-xs">get_db_stats()</code> est-elle bien créée côté Supabase ?
      </div>
    )
  }

  const dbPct = (data.db_size_bytes / FREE_TIER_DB_BYTES) * 100
  const storagePct = (data.storage_size_bytes / FREE_TIER_STORAGE_BYTES) * 100
  const worstPct = Math.max(dbPct, storagePct)

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Database className="h-5 w-5 text-slate-500" />
          État de la base
        </h2>
        {worstPct >= 80 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full ring-1 ring-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            Pensez à purger
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <UsageBar
          icon={<Database className="h-4 w-4" />}
          label="Base de données"
          usedBytes={data.db_size_bytes}
          totalBytes={FREE_TIER_DB_BYTES}
        />
        <UsageBar
          icon={<HardDrive className="h-4 w-4" />}
          label="Stockage images"
          usedBytes={data.storage_size_bytes}
          totalBytes={FREE_TIER_STORAGE_BYTES}
        />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 pt-2 border-t border-slate-100">
        <span>
          <strong className="text-slate-700">{data.transactions_count.toLocaleString('fr-FR')}</strong>{' '}
          transactions
        </span>
        <span>
          <strong className="text-slate-700">
            {data.transaction_items_count.toLocaleString('fr-FR')}
          </strong>{' '}
          lignes vendues
        </span>
        <span>
          <strong className="text-slate-700">{data.products_count}</strong> articles
        </span>
        {data.oldest_transaction && data.newest_transaction && (
          <span>
            Période :{' '}
            <strong className="text-slate-700">
              {formatDate(data.oldest_transaction)} → {formatDate(data.newest_transaction)}
            </strong>
          </span>
        )}
      </div>
    </div>
  )
}

function UsageBar({
  icon,
  label,
  usedBytes,
  totalBytes,
}: {
  icon: React.ReactNode
  label: string
  usedBytes: number
  totalBytes: number
}) {
  const pct = Math.min(100, (usedBytes / totalBytes) * 100)
  const color =
    pct >= 90
      ? { bar: 'bg-red-500', text: 'text-red-700' }
      : pct >= 75
        ? { bar: 'bg-amber-500', text: 'text-amber-700' }
        : { bar: 'bg-emerald-500', text: 'text-emerald-700' }

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="flex items-center gap-1.5 text-slate-600 font-medium">
          {icon}
          {label}
        </span>
        <span className={`tabular-nums font-semibold ${color.text}`}>
          {pct.toFixed(1)} %
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color.bar} transition-all duration-500`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
        {formatBytes(usedBytes)} / {formatBytes(totalBytes)}
      </div>
    </div>
  )
}
