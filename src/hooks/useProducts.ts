import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Category, Product } from '@/lib/database.types'

export function useProducts(opts?: { includeArchived?: boolean }) {
  return useQuery({
    queryKey: ['products', { archived: opts?.includeArchived ?? false }],
    queryFn: async (): Promise<Product[]> => {
      let q = supabase.from('products').select('*').order('name', { ascending: true })
      if (!opts?.includeArchived) q = q.eq('archived', false)
      const { data, error } = await q
      if (error) throw error
      return data as Product[]
    },
  })
}

export function useCategories(opts?: { includeArchived?: boolean }) {
  return useQuery({
    queryKey: ['categories', { archived: opts?.includeArchived ?? false }],
    queryFn: async (): Promise<Category[]> => {
      let q = supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (!opts?.includeArchived) q = q.eq('archived', false)
      const { data, error } = await q
      if (error) throw error
      return data as Category[]
    },
  })
}
