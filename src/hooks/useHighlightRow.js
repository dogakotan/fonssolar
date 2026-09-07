import { useEffect, useRef, useState } from 'react'

// Bildirimden (zil/Bildirimler sayfası) bir kayda tıklanınca artık modal açmıyoruz —
// kullanıcı isteğiyle (04.09.2026) yalnızca ilgili satır listede scroll edilip birkaç
// saniyeliğine vurgulanıyor, detayını görmek isteyen satıra kendisi tıklıyor. `rows`
// hedef id'yi içerdiği anda (henüz yüklenmediyse bekler, filtre/sayfa değişip göründüğünde
// tetiklenir) satırı bir kez "tüketir" — aynı id ikinci kez state'e düşene kadar tekrar
// tetiklenmez.
export function useHighlightRow(targetId, rows, getId, onConsumed) {
  const [highlightedId, setHighlightedId] = useState(null)
  const rowRefs = useRef(new Map())
  const consumedRef = useRef(null)

  // `rows` (filtered/paged/sorted) tüm listeler tarafından her render'da YENİDEN
  // hesaplanan bir dizi — referansı hep değişir. Bunu doğrudan effect dependency
  // yapmak (`[targetId, rows]`) her ilgisiz re-render'da (ör. realtime yenileme,
  // sayfa/kategori state değişimi) effect'i cleanup+yeniden çalıştırıyor, bu da
  // az sonra planlanan fade/consume timer'larını daha ateşlenmeden iptal edip
  // `consumedRef` guard'ı yüzünden yeniden kurmuyordu — sonuçta vurgu hiç
  // sönmüyor, `onConsumed` hiç tetiklenmiyordu (04.09.2026'da bulunan bug).
  // Bunun yerine yalnızca hedefin listede bulunup bulunmadığını gösteren
  // stabil bir boolean'a (`found`) bağımlı olunuyor — bu değer gerçekten
  // değişmediği sürece re-render'lar effect'i tekrar tetiklemiyor.
  const found = !!targetId && rows.some(row => getId(row) === targetId)

  // Hedefi bulup vurguyu BAŞLATAN effect — `targetId` prop'una bağımlı (üst
  // bileşen bunu ne zaman null'a çekerse effect burada da haberdar olsun diye).
  // `onConsumed` burada SENKRON çağrılıyor (eskiden 300ms'lik ayrı bir timer'dı) —
  // o timer `targetId`'yi temizleyip BU effect'in kendi cleanup'ını (dolayısıyla
  // henüz ateşlenmemiş "sönme" timer'ını da, ikisi aynı effect'teydi) tetikliyordu,
  // vurgu hiç sönmeden kalıcı yapışıp kalıyordu (04.09.2026'da bulunan bug — bkz.
  // ayrıca index.jsx'teki `pathSegments` memoization notu, aynı araştırmada
  // bulunan ikinci bir kök neden). Sönme artık tamamen ayrı, yalnızca
  // `highlightedId`'ye bağımlı bir effect'te (aşağıda) — `targetId` değişse de
  // etkilenmiyor.
  useEffect(() => {
    if (!targetId) { consumedRef.current = null; return }
    if (!found) return
    if (consumedRef.current === targetId) return
    consumedRef.current = targetId
    setHighlightedId(targetId)
    requestAnimationFrame(() => {
      rowRefs.current.get(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    onConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, found])

  useEffect(() => {
    if (!highlightedId) return
    const fadeTimer = setTimeout(() => setHighlightedId(null), 2600)
    return () => clearTimeout(fadeTimer)
  }, [highlightedId])

  function rowRef(id) {
    return el => { if (el) rowRefs.current.set(id, el); else rowRefs.current.delete(id) }
  }

  return { highlightedId, rowRef }
}
