import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth'

interface Props {
  children: ReactNode
  adminOnly?: boolean
}

export function ProtectedRoute({ children, adminOnly = false }: Props) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-slate-500">Chargement…</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile || !profile.active) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-slate-700">Votre compte est inactif ou non configuré.</p>
        <p className="text-sm text-slate-500">Contactez l'administrateur du snack.</p>
      </div>
    )
  }

  if (adminOnly && profile.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
