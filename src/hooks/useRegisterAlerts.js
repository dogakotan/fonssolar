import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { alertCounts } from '../lib/menu/sidebarMenu'

const REFRESH_MS = 5 * 60 * 1000

// v_register_alerts (security_invoker; kullanıcı yalnızca erişebildiği projelerin satırlarını görür). Menü rozetleri
// ve Genel ekran kartları için tür başına sayım; rolün göremediği register'ın uyarıları sayılmaz (sidebarMenu.canSeeAlert).
// Hata menüyü bozmasın diye sessiz: sayımlar boş kalır.
export function useRegisterAlerts() {
  const { role, user } = useAuth()
  const userId = user?.id ?? null
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    if (!userId) return undefined
    let active = true
    async function load() {
      const { data, error } = await supabase.from('v_register_alerts').select('alert_type, register_code, project_id')
      if (!active) return
      if (error) {
        console.error('v_register_alerts error:', error)
        return
      }
      setAlerts(data || [])
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    function onVisible() { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])

  return useMemo(() => alertCounts(alerts, role), [alerts, role])
}
