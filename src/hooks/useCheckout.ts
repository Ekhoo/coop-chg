import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CheckoutItem } from '@/lib/database.types'

export function useCheckout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, note }: { items: CheckoutItem[]; note?: string }) => {
      const { data, error } = await supabase.rpc('checkout', {
        items: items as unknown as object,
        note: note ?? null,
      })
      if (error) throw error
      return data as string // transaction id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
