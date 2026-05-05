import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './database.types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single<Profile>()
      if (error) {
        console.error('[auth] loadProfile error', error)
        setProfile(null)
        return
      }
      setProfile(data)
    } catch (e) {
      console.error('[auth] loadProfile exception', e)
      setProfile(null)
    }
  }

  useEffect(() => {
    let mounted = true

    // onAuthStateChange émet INITIAL_SESSION dès l'abonnement, donc pas besoin
    // d'appeler getSession() en plus (évite une race condition au refresh).
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      ;(async () => {
        setSession(newSession)
        try {
          if (newSession) {
            await loadProfile(newSession.user.id)
          } else {
            setProfile(null)
          }
        } finally {
          if (mounted) setLoading(false)
        }
      })()
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: translateAuthError(error.message) }
    return {}
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être appelé dans <AuthProvider>')
  return ctx
}

function translateAuthError(msg: string): string {
  if (msg.toLowerCase().includes('invalid login')) return 'Email ou mot de passe incorrect.'
  if (msg.toLowerCase().includes('email not confirmed')) return 'Email non confirmé.'
  return msg
}
