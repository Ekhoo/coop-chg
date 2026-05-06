import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCategories } from '@/hooks/useProducts'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'
import type { Category } from '@/lib/database.types'

export function CategoriesSection() {
  const { data: categories = [], isLoading } = useCategories({ includeArchived: true })
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Catégories</h2>
        <button onClick={() => setCreating(true)} className="btn-secondary">
          <Plus className="h-4 w-4" /> Nouvelle catégorie
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-slate-500">Chargement…</div>
        ) : categories.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">
            Aucune catégorie. Crées-en une pour pouvoir grouper les articles.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Nom</th>
                <th className="text-left px-3 py-2 w-24">Ordre</th>
                <th className="text-left px-3 py-2 w-28">Statut</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id} className={c.archived ? 'opacity-60' : ''}>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-slate-500">{c.sort_order}</td>
                  <td className="px-3 py-2">
                    {c.archived ? (
                      <span className="text-slate-500">Archivée</span>
                    ) : (
                      <span className="text-emerald-700">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditing(c)}
                      className="text-slate-400 hover:text-brand-600 p-1"
                      title="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && <CategoryFormModal onClose={() => setCreating(false)} />}
      {editing && (
        <CategoryFormModal category={editing} onClose={() => setEditing(null)} />
      )}
    </section>
  )
}

function CategoryFormModal({
  category,
  onClose,
}: {
  category?: Category
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(category?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0))
  const [archived, setArchived] = useState(category?.archived ?? false)

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        sort_order: Number(sortOrder) || 0,
        archived,
      }
      if (category) {
        const { error } = await supabase.from('categories').update(payload).eq('id', category.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('categories').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success(category ? 'Catégorie mise à jour' : 'Catégorie créée')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erreur'),
  })

  const remove = useMutation({
    mutationFn: async () => {
      if (!category) return
      const { error } = await supabase.from('categories').delete().eq('id', category.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Catégorie supprimée')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Suppression impossible'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      footer={
        <>
          {category && (
            <button
              onClick={() => {
                if (confirm(`Supprimer définitivement "${category.name}" ?`)) remove.mutate()
              }}
              className="btn-danger mr-auto"
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4" /> Supprimer
            </button>
          )}
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={handleSubmit} className="btn-primary" disabled={save.isPending}>
            Enregistrer
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="label">Ordre d'affichage</label>
          <input
            className="input"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        {category && (
          <button
            type="button"
            onClick={() => setArchived((a) => !a)}
            className="btn-secondary"
          >
            {archived ? (
              <>
                <ArchiveRestore className="h-4 w-4" /> Restaurer
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" /> Archiver
              </>
            )}
          </button>
        )}
      </form>
    </Modal>
  )
}
