import { ShieldCheck, ShoppingBag, Archive, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Role } from '@/lib/database.types'

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'info'
  | 'purple'
  | 'amber'

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/20',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  icon?: ReactNode
  className?: string
}

export function Badge({ variant = 'neutral', children, icon, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${variantClasses[variant]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}

/* ---------- Variantes spécialisées ---------- */

export function StockBadge({ stock, threshold = 5 }: { stock: number; threshold?: number }) {
  if (stock <= 0) {
    return (
      <Badge variant="danger" icon={<XCircle className="h-3 w-3" />}>
        Rupture
      </Badge>
    )
  }
  if (stock <= threshold) {
    return (
      <Badge variant="warning" icon={<AlertTriangle className="h-3 w-3" />}>
        Stock faible
      </Badge>
    )
  }
  return (
    <Badge variant="success" icon={<CheckCircle2 className="h-3 w-3" />}>
      En stock
    </Badge>
  )
}

export function RoleBadge({ role }: { role: Role }) {
  if (role === 'admin') {
    return (
      <Badge variant="purple" icon={<ShieldCheck className="h-3 w-3" />}>
        Admin
      </Badge>
    )
  }
  return (
    <Badge variant="neutral" icon={<ShoppingBag className="h-3 w-3" />}>
      Vendeur
    </Badge>
  )
}

export function ArchivedBadge() {
  return (
    <Badge variant="neutral" icon={<Archive className="h-3 w-3" />}>
      Archivé
    </Badge>
  )
}

export function ActiveBadge() {
  return <Badge variant="success">Actif</Badge>
}

export function InactiveBadge() {
  return <Badge variant="neutral">Désactivé</Badge>
}
