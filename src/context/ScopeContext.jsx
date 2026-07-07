import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const ScopeContext = createContext(null)

const STORAGE_KEY = 'dashboard-scope-project'

// Kullanıcının erişebildiği proje listesini (get_my_projects — get_project_scope ile
// aynı yetki mantığını kullanır) tutar ve üst bardaki kapsam seçicisinin seçili
// project_id'sini (null = Tüm Projeler) global olarak sağlar. Tüm dashboard RPC'leri
// bu seçime göre p_project_id ile çağrılmalı.
export function ScopeProvider({ children }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [scopeProjectId, setScopeProjectIdState] = useState(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) || null } catch { return null }
  })

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

  // Kaydedilmiş seçim artık erişilebilir listede yoksa (rol/proje ataması değişmiş
  // olabilir) sessizce "Tüm Projeler"e dön — kullanıcı bunu fark etmeden erişimi
  // olmayan bir kapsamda kalmasın.
  useEffect(() => {
    if (loadingProjects) return
    if (scopeProjectId && !projects.some(p => p.id === scopeProjectId)) {
      setScopeProjectIdState(null)
      try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
    }
  }, [projects, loadingProjects, scopeProjectId])

  function setScopeProjectId(id) {
    setScopeProjectIdState(id)
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id)
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }

  const showAllOption = projects.length > 1
  // Tek proje erişimi olan kullanıcı için seçici zaten gizlenir — o durumda
  // kapsam doğrudan o tek projedir, "Tüm Projeler" seçeneği anlamsızdır.
  const effectiveProjectId = projects.length === 1 ? projects[0].id : scopeProjectId

  const value = {
    projects,
    loadingProjects,
    showAllOption,
    scopeProjectId: effectiveProjectId,
    setScopeProjectId,
    refetchProjects: loadProjects,
  }

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useScope() {
  return useContext(ScopeContext)
}
