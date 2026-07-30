import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  // ProtectedRoute `loading` true iken tüm Dashboard ağacını unmount edip
  // "Yükleniyor…" ekranı gösteriyor — bu yalnızca İLK oturum çözümlemesinde
  // doğru. supabase.auth.onAuthStateChange rutin arka plan token
  // yenilemelerinde de tetikleniyor; bu satır olmadan HER yenilemede
  // setLoading(true) çağrılıyor, Dashboard'un tüm local state'i (aktif sekme,
  // proje detayı, form ilerlemesi vb.) sıfırlanıp kullanıcı farkında olmadan
  // varsayılan sekmeye/sayfaya atılıyordu — özellikle uzun süren bir formda
  // (proje sihirbazı gibi) arka planda bir yenileme olursa fark ediliyordu
  // (2026-07-30'da bulunan bug). Bu ref sayesinde `loading` yalnızca ilk
  // çözümlemede true'ya çekiliyor, sonraki oturum olaylarında profil
  // sessizce arka planda güncelleniyor.
  const hasResolvedOnce = useRef(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!active) return
        const u = session?.user ?? null
        setUser(u)
        if (u) {
          setLoading(true)
          fetchProfile(u).finally(() => { hasResolvedOnce.current = true })
        }
        else {
          setLoading(false)
          hasResolvedOnce.current = true
        }
      })
      .catch(() => {
        if (!active) return
        setUser(null)
        setProfile(null)
        setAuthError('Oturum bilgisi okunamadi.')
        setLoading(false)
        hasResolvedOnce.current = true
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        if (!hasResolvedOnce.current) setLoading(true)
        fetchProfile(u).finally(() => { hasResolvedOnce.current = true })
      }
      else {
        setProfile(null)
        setLoading(false)
        hasResolvedOnce.current = true
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(authUser) {
    try {
      setAuthError('')
      const [
        { data: roleData, error: roleError },
        { data: projectData, error: projectsError },
        { data: profileData, error: profileError },
      ] = await Promise.all([
        supabase.rpc('get_my_role'),
        supabase.rpc('get_my_projects'),
        supabase.from('profiles').select('full_name, project_id').eq('id', authUser.id).maybeSingle(),
      ])

      if (roleError) throw roleError
      if (projectsError) throw projectsError
      if (profileError) throw profileError

      const roleKey = normalizeRole(roleData)
      if (!roleKey) {
        setAuthError('Hesap icin rol bulunamadi. get_my_role bos dondu.')
        setProfile(null)
        return
      }

      // Sekme/sidebar izinleri artık navigation.js'te hardcoded değil, roles
      // tablosundan okunuyor (allowed_tabs/default_tab/sidebar_items) — yeni bir
      // rol eklendiğinde/rol izinleri değiştiğinde tek yer burasıdır.
      const { data: roleRow, error: roleRowError } = await supabase
        .from('roles')
        .select(`
          display_name,
          is_manager,
          tabs_unrestricted,
          default_tab,
          role_allowed_tabs(tab_key, order_index),
          role_sidebar_items(item_key, order_index)
        `)
        .eq('key', roleKey)
        .maybeSingle()
      if (roleRowError) throw roleRowError
      const allowedTabs = [...(roleRow?.role_allowed_tabs || [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map(item => item.tab_key)
      const sidebarItems = [...(roleRow?.role_sidebar_items || [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map(item => item.item_key)

      const projects = Array.isArray(projectData) ? projectData : []
      const homeProjectId = profileData?.project_id ?? null
      // Tek projeli kullanıcı doğrudan o projeyi kullanır. Birden fazla proje
      // erişimi varsa profiles.project_id kullanıcının ana/varsayılan projesidir;
      // eski kod bunu yok sayıp null döndürdüğü için günlük rapor formu
      // "PROJE —" durumunda kalıyor ve kaydedilemiyordu.
      const assignedProjectId = projects.length === 1
        ? projects[0]?.id ?? null
        : projects.some(project => project.id === homeProjectId)
          ? homeProjectId
          : null

      setProfile({
        id: authUser.id,
        email: authUser.email,
        full_name: profileData?.full_name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email,
        role_key: roleKey,
        project_id: assignedProjectId,
        role_label: roleRow?.display_name || roleKey,
        is_manager: roleRow?.is_manager ?? false,
        navigation: {
          tabs: roleRow?.tabs_unrestricted ? null : allowedTabs,
          defaultTab: roleRow?.default_tab ?? null,
          sidebarItems,
        },
      })
    } catch (err) {
      setAuthError(err?.message || 'Profil ve rol bilgisi yuklenemedi.')
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const role       = profile?.role_key ?? null
  const isAdmin    = role === 'admin'
  const isMuhasebe = role === 'muhasebe'
  const projectId  = profile?.project_id ?? null
  const roleLabel  = profile?.role_label ?? null
  const isManager  = profile?.is_manager ?? false
  const navigation = profile?.navigation ?? null

  const value = { user, profile, role, isAdmin, isMuhasebe, loading, projectId, authError, roleLabel, isManager, navigation }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Provider ve hook aynı modülde tutuluyor; hook bir React bileşeni olmadığı için
// Fast Refresh kuralına bilinçli, tek-export istisnası.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}

function normalizeRole(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return normalizeRole(value[0])
  return value.role_key || value.role || value.get_my_role || value.name || value.key || null
}
