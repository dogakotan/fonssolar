import { useCallback, useState } from 'react'

const STORAGE_KEY = 'is-plani-detay-kolonu'

// İş Planı görünümlerindeki "Detay" kolonunun açık/kapalı durumu. Kolona
// dokununca açılır, tekrar dokununca kapanır; tercih tarayıcıda saklanır.
export function useDetailColumn() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const toggle = useCallback(event => {
    event?.stopPropagation?.()
    setOpen(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* depolama kapalı */ }
      return next
    })
  }, [])
  return [open, toggle]
}
