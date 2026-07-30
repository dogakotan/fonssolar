import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const ScopeContext = createContext(null)

const STORAGE_KEY = 'dashboard-scope-project'

// Kullanıcının erişebildiği proje listesini (get_my_projects — get_project_scope ile
// aynı yetki mantığını kullanır) tutar. Tek proje erişimi olan kullanıcıda kapsam o
// projedir; çok projeli kullanıcıda genel dashboard varsayılan olarak Tüm Projeler'dir.
export function ScopeProvider({ children }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true)
    const { data, error } = await supabase.rpc('get_my_projects')
    if (error) console.error('get_my_projects error:', error)
    setProjects(error ? [] : (data || []))
    setLoadingProjects(false)
  }, [])

  useEffect(() => {
    if (!user) { setProjects([]); setLoadingProjects(false); return }
    loadProjects()
  }, [user, loadProjects])

  useEffect(() => {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  // Tek proje erişimi olan kullanıcı için seçici zaten gizlenir — o durumda
  // kapsam doğrudan o tek projedir, "Tüm Projeler" seçeneği anlamsızdır.
  const effectiveProjectId = projects.length === 1 ? projects[0].id : null

  const value = {
    projects,
    loadingProjects,
    scopeProjectId: effectiveProjectId,
    refetchProjects: loadProjects,
  }

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

// Provider ve ona ait hook tek modülde tutulur; dar kapsamı Fast Refresh istisnası.
// eslint-disable-next-line react-refresh/only-export-components
export function useScope() {
  return useContext(ScopeContext)
}
