import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Tüm dashboard/rapor ekranlarının ortak veri çekme deseni:
// - İlk yüklemede `loading`, sonraki yenilemelerde `refreshing` true olur —
//   `data` hiçbir zaman null'a düşürülmez, ekran boşalmaz.
// - Hata durumunda son başarılı `data` korunur, `error` Türkçe mesaj taşır.
// - Sekme arka plandan öne geldiğinde (visibilitychange) otomatik tazelenir.
export function useDashboardData(rpcName, params, { enabled = true } = {}) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState('')
  const paramsKey  = JSON.stringify(params ?? {})
  const paramsRef  = useRef(params)
  paramsRef.current = params
  const hasLoadedOnce = useRef(false)

  const fetchData = useCallback(async () => {
    if (!enabled) return
    if (hasLoadedOnce.current) setRefreshing(true)
    else setLoading(true)

    const { data: result, error: rpcError } = await supabase.rpc(rpcName, paramsRef.current)

    if (rpcError) {
      console.error(`${rpcName} error:`, rpcError)
      setError('Veri yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.')
    } else {
      setData(result)
      setError('')
      hasLoadedOnce.current = true
    }
    setLoading(false)
    setRefreshing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcName, enabled, paramsKey])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') fetchData()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchData])

  return { data, loading, refreshing, error, refetch: fetchData }
}
