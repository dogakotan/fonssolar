import { useEffect, useRef } from 'react'

// Bir liste ekranındaki açık detay modalının id'sini (satın alma talebi/ticket/
// fatura/tedarikçi) adres çubuğuna yansıtan callback'i tetikler — yalnızca id
// GERÇEKTEN değiştiğinde. "Son raporlanan id" karşılaştırması (basit bir
// "ilk render mi" sayacı değil) kullanılıyor çünkü React StrictMode (dev'de)
// effect'leri iki kez çalıştırır — sayaç tabanlı bir "yalnızca ilk çalışmayı
// atla" deseni bu ikinci çağrıyı "gerçek" sanıp selected henüz null iken
// (deep-link fetch'i tamamlanmadan) parent'a erken bir "seçili yok" sinyali
// gönderip URL'deki parametreyi fetch bitmeden silerdi. Değer bazlı karşılaştırma
// StrictMode'un aynı değerle gelen tekrar çağrısını doğal olarak filtreler.
// İlk raporlama null olacaksa (mount anında henüz hiçbir şey seçilmemiş/deep-link
// çözülmemiş) sessizce yutulur — yalnızca önceden dolu bir id'den null'a geçen
// GERÇEK bir kapanış rapor edilir.
export function useUrlSyncedSelection(id, onChange) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lastReportedRef = useRef(undefined)
  useEffect(() => {
    if (id === lastReportedRef.current) return
    if (lastReportedRef.current === undefined && id === null) {
      lastReportedRef.current = null
      return
    }
    lastReportedRef.current = id
    onChangeRef.current?.(id)
  }, [id])
}
