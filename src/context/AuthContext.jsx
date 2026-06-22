import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!active) return
        const u = session?.user ?? null
        setUser(u)
        if (u) fetchProfile(u.id)
        else setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setUser(null)
        setProfile(null)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role_key, project_id')
        .eq('id', userId)
        .single()
      setProfile(data ?? null)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const role       = profile?.role_key ?? null
  // role null ise (profiles'da kayıt yoksa) tam erişim — sadece 'muhasebe' açıkça set edilince kısıtla
  const isAdmin    = role === null || role === 'admin'
  const isMuhasebe = role === 'muhasebe'
  const projectId  = profile?.project_id ?? null

  const value = { user, profile, role, isAdmin, isMuhasebe, loading, projectId }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
