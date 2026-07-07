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
        if (u) {
          setLoading(true)
          fetchProfile(u)
        }
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
      if (u) {
        setLoading(true)
        fetchProfile(u)
      }
      else { setProfile(null); setLoading(false) }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(authUser) {
    try {
      const [{ data: roleData, error: roleError }, { data: projectData }] = await Promise.all([
        supabase.rpc('get_my_role'),
        supabase.rpc('get_my_projects'),
      ])

      if (roleError) throw roleError

      const roleKey = normalizeRole(roleData)
      if (!roleKey) {
        setProfile(null)
        return
      }

      const projects = Array.isArray(projectData) ? projectData : []
      const assignedProjectId = projects.length === 1 ? projects[0]?.id ?? null : null

      setProfile({
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email,
        role_key: roleKey,
        project_id: assignedProjectId,
      })
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const role       = profile?.role_key ?? null
  const isAdmin    = role === 'admin'
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

function normalizeRole(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return normalizeRole(value[0])
  return value.role_key || value.role || value.get_my_role || null
}
