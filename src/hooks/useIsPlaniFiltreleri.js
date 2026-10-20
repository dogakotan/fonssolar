import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DEFAULT_FILTERS, hasFilterParams, isFiltered, normalizeFilters, parseFilterParams, writeFilterParams,
} from '../lib/isPlan'

// İş Planı ortak filtreleri (Genel, Detaylı, Aylık).
// - Ekrandaki değer bileşen durumundan gelir ve her tuşta anında güncellenir. Adres çubuğu React Router'da
//   geçiş (transition) ile güncellendiği için girişleri doğrudan adresten okumak arama kutusunda harf
//   kaybettirir, onay kutusu da bir an eski haline döner.
// - Her değişiklik adres çubuğuna `replace` ile yazılır (?q=&grup=&durum=&kategori=&sorumlu=&buay=1; geçmişe
//   girdi eklemez, `view` gibi diğer parametreler korunur) ve projeye özel localStorage'a saklanır.
// - Açılışta önce adresteki filtre (paylaşılan link, yenileme), yoksa saklanan son filtre kullanılır.
// - Adres dışarıdan filtreli bir değere değişirse (geri/ileri) ekran ona uyar. Filtre parametresi olmayan bir
//   adres filtreyi silmez; filtre yalnızca kullanıcı değiştirince ya da "Filtreleri temizle" ile temizlenir.
function storageKey(projectId) {
  return `is-plani-filtre-${projectId || 'genel'}`
}

function readStored(projectId) {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId))
    return raw ? normalizeFilters(JSON.parse(raw)) : null
  } catch { return null }
}

function writeStored(projectId, filters) {
  try {
    if (isFiltered(filters)) window.localStorage.setItem(storageKey(projectId), JSON.stringify(filters))
    else window.localStorage.removeItem(storageKey(projectId))
  } catch { /* yok say */ }
}

function initialFilters(searchParams, projectId) {
  if (hasFilterParams(searchParams)) return parseFilterParams(searchParams)
  return readStored(projectId) || { ...DEFAULT_FILTERS }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function useIsPlaniFiltreleri(projectId) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setLocal] = useState(() => initialFilters(searchParams, projectId))

  // Proje değişince (aynı bileşen örneği yeni projeyi gösterirse) o projenin filtresi.
  const projectRef = useRef(projectId)
  useEffect(() => {
    if (projectRef.current === projectId) return
    projectRef.current = projectId
    setLocal(initialFilters(searchParams, projectId))
  }, [projectId, searchParams])

  // Bu bileşenin adrese yazdığı değerler. Adres geç (geçiş içinde) güncellendiği için hızlı yazarken eski bir
  // yazımız ekrandaki yeni değerden sonra gelebilir; kendi yazdığımız bir değer ekranı geri almaz.
  const ownWrites = useRef(new Set())

  // Ekran → adres + localStorage.
  useEffect(() => {
    writeStored(projectId, filters)
    const key = JSON.stringify(normalizeFilters(filters))
    ownWrites.current.add(key)
    if (ownWrites.current.size > 50) ownWrites.current = new Set([key])
    setSearchParams(prev => {
      const next = writeFilterParams(prev, filters)
      return next.toString() === prev.toString() ? prev : next
    }, { replace: true })
  }, [filters, projectId, setSearchParams])

  // Adres → ekran: yalnızca adreste filtre varsa, ekrandakinden farklıysa ve bizim yazdığımız bir değer değilse
  // (geri/ileri, elle yazılmış ya da paylaşılan link).
  useEffect(() => {
    if (!hasFilterParams(searchParams)) return
    const fromUrl = parseFilterParams(searchParams)
    const key = JSON.stringify(fromUrl)
    if (ownWrites.current.has(key)) return
    setLocal(prev => (same(prev, fromUrl) ? prev : fromUrl))
  }, [searchParams])

  const setFilters = useCallback(patch => {
    setLocal(prev => normalizeFilters({ ...prev, ...patch }))
  }, [])

  const resetFilters = useCallback(() => setLocal({ ...DEFAULT_FILTERS }), [])

  return { filters, setFilters, resetFilters, filtered: isFiltered(filters) }
}
