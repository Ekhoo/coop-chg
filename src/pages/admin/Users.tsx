import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck, ShieldOff, UserCheck, UserX, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'
import { ActiveBadge, InactiveBadge, RoleBadge } from '@/components/Badge'
import { formatDate } from '@/lib/format'
import type { Profile, Role } from '@/lib/database.types'

async function callCreateUserFn(body: object) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { error?: string; ok?: boolean; user_id?: string }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

export function UsersPage() {
  const { profile: me } = useAuth()
  const [creating, setCreating] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Profile[]
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Comptes</h1>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Nouveau compte
        </button>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500">Chargement…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Nom</th>
                <th className="text-left px-3 py-2">Rôle</th>
                <th className="text-left px-3 py-2">Statut</th>
                <th className="text-left px-3 py-2">Créé le</th>
                <th className="px-3 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <UserRow key={u.id} user={u} isMe={me?.id === u.id} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && <CreateUserModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function UserRow({ user, isMe }: { user: Profile; isMe: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()

  const setRole = useMutation({
    mutationFn: async (role: Role) => callCreateUserFn({ action: 'set_role', user_id: user.id, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Rôle mis à jour')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  const setActive = useMutation({
    mutationFn: async (active: boolean) =>
      callCreateUserFn({ action: 'set_active', user_id: user.id, active }),
    onSuccess: (_d, active) => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      toast.success(active ? 'Compte réactivé' : 'Compte désactivé')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  return (
    <tr className={user.active ? '' : 'opacity-50'}>
      <td className="px-3 py-2 font-medium">{user.display_name}</td>
      <td className="px-3 py-2">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-3 py-2">{user.active ? <ActiveBadge /> : <InactiveBadge />}</td>
      <td className="px-3 py-2 text-slate-500">{formatDate(user.created_at)}</td>
      <td className="px-3 py-2 text-right space-x-1">
        {!isMe && (
          <>
            <button
              onClick={() => setRole.mutate(user.role === 'admin' ? 'seller' : 'admin')}
              className="text-slate-400 hover:text-purple-700 p-1"
              title={user.role === 'admin' ? 'Rétrograder en vendeur' : 'Promouvoir admin'}
              disabled={setRole.isPending}
            >
              {user.role === 'admin' ? (
                <ShieldOff className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setActive.mutate(!user.active)}
              className="text-slate-400 hover:text-red-600 p-1"
              title={user.active ? 'Désactiver' : 'Réactiver'}
              disabled={setActive.isPending}
            >
              {user.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            </button>
          </>
        )}
      </td>
    </tr>
  )
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('seller')

  const create = useMutation({
    mutationFn: async () =>
      callCreateUserFn({
        action: 'create',
        email: email.trim().toLowerCase(),
        password,
        display_name: displayName.trim(),
        role,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Compte créé')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    create.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau compte"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={handleSubmit} className="btn-primary" disabled={create.isPending}>
            Créer
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nom affiché</label>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label">
            <Mail className="inline h-3 w-3 mr-1" /> Email
          </label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Mot de passe initial (8 car. min)</label>
          <input
            className="input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            À communiquer en main propre. L'utilisateur pourra le changer ensuite.
          </p>
        </div>
        <div>
          <label className="label">Rôle</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="seller">Vendeur (vente uniquement)</option>
            <option value="admin">Admin (tous droits)</option>
          </select>
        </div>
      </form>
    </Modal>
  )
}
