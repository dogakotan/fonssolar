import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEBOUNCE_MS = 2000
const POLL_MS = 60000

// Bir ekranın ilgili tablolarında (RLS zaten sunucu tarafında kapsamı daraltıyor)
// INSERT/UPDATE/DELETE olduğunda ekranın RPC'sini debounce'lu şekilde yeniden
// çağırır. Ekran başına TEK kanal (tüm tablolar aynı channel'a .on() ile eklenir).
// Realtime bağlantısı koparsa sessizce 60 sn'lik polling'e düşer, bağlantı
// gelince polling durur.
//
// tables: Array<string | { table, filterColumn }>. Düz string girilirse
// `filter.column` (varsayılan project_id) o tabloya uygulanır; tabloda o kolon
// yoksa (örn. progress_daily'de project_id yok, report_id var) obje formuyla
// `filterColumn: null` verilip o tablo için filtre devre dışı bırakılabilir.
//
// filter: { column, value } verilirse (örn. tek-proje ekranları için
// project_id=eq.<id>) sunucu tarafında ek daraltma yapılır — RLS zaten koruma
// sağlıyor, bu yalnızca gürültüyü azaltan bir optimizasyon.
export function useRealtimeRefresh(tables, refetch, { enabled = true, filter } = {}) {
  const [status, setStatus] = useState('connecting') // 'connecting' | 'live' | 'offline'
  const [lastUpdated, setLastUpdated] = useState(null)
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch
  const tablesKey = JSON.stringify(tables || [])
  const filterKey = filter ? `${filter.column}:${filter.value}` : ''

  useEffect(() => {
    const list = tables || []
    if (!enabled || list.length === 0) return

    let alive = true
    let pollTimer = null
    let debounceTimer = null

    function fireRefetch() {
      refetchRef.current()
      setLastUpdated(new Date())
    }

    function scheduleRefetch() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(fireRefetch, DEBOUNCE_MS)
    }

    function startPolling() {
      if (pollTimer) return
      pollTimer = setInterval(fireRefetch, POLL_MS)
    }

    function stopPolling() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    }

    const tableNames = list.map(entry => typeof entry === 'string' ? entry : entry.table)
    const channelName = `rt-${tableNames.join('-')}${filter ? `-${filter.value}` : ''}`
    let channel = supabase.channel(channelName)
    list.forEach(entry => {
      const table = typeof entry === 'string' ? entry : entry.table
      const filterColumn = typeof entry === 'string' ? filter?.column : entry.filterColumn
      const config = { event: '*', schema: 'public', table }
      if (filter && filterColumn) config.filter = `${filterColumn}=eq.${filter.value}`
      channel = channel.on('postgres_changes', config, scheduleRefetch)
    })

    channel.subscribe(subStatus => {
      if (!alive) return
      if (subStatus === 'SUBSCRIBED') {
        setStatus('live')
        stopPolling()
      } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
        setStatus('offline')
        startPolling()
      }
    })

    return () => {
      alive = false
      if (debounceTimer) clearTimeout(debounceTimer)
      stopPolling()
      supabase.removeChannel(channel)
    }
  }, [tablesKey, filterKey, enabled])

  return { status, lastUpdated }
}
