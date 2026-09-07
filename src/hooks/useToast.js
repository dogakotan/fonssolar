import { useState, useCallback, useRef } from 'react'

// Küçük, paylaşımlı toast state'i — TabProjeYonetimi.jsx'teki yerel toast
// deseninin (bkz. showToast/setTimeout) tekrar kullanılabilir hâli. Bildirimden
// bir kayda gidilip hedef artık mevcut değilse (silinmiş/ölü bildirim) kullanıcıya
// sessizce hiçbir şey olmamış gibi görünmesin diye kullanılıyor.
export function useToast() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)
  const showToast = useCallback((msg, type = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ msg, type })
    timerRef.current = setTimeout(() => setToast(null), 4000)
  }, [])
  return { toast, showToast }
}
