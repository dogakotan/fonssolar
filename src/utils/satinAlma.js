export const toNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export const materialKey = (value) =>
  String(value || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')

// purchase_requests_status_check (Supabase) artık 14 değere izin verir: eski 10 değer
// (talep_olusturuldu, fiyat_girildi, onay_bekliyor, onaylandi, reddedildi, satin_alindi,
// fatura_bekliyor, fatura_onay_bekliyor, faturasi_kesildi, iptal) + yeni 3 aşamalı akışın
// 4 değeri (teklif_toplama, pazarlik_onay_bekliyor, pazarlik, siparis — 03.09.2026).
// Yeni 4 değer bilinçli olarak 'bekliyor' kovasına KATILMAZ — onaylandi/satin_alindi gibi
// kendi bucket'ları var, aksi halde hangi aşamada olduğu bilgisi kaybolurdu.
export const normalizeStatus = (status) => {
  const value = String(status || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '_')
  if (!value || ['bekliyor', 'beklemede', 'talep_olusturuldu', 'talep_oluşturuldu', 'fiyat_girildi', 'onay_bekliyor'].includes(value)) return 'bekliyor'
  if (['onaylandı', 'onaylandi', 'approved'].includes(value)) return 'onaylandi'
  if (['red_edildi', 'reddedildi', 'rejected'].includes(value)) return 'red_edildi'
  if (['satın_alındı', 'satin_alindi'].includes(value)) return 'satin_alindi'
  if (['fatura_bekliyor', 'faturada', 'fatura_bekleniyor'].includes(value)) return 'fatura_bekliyor'
  if (['fatura_onay_bekliyor'].includes(value)) return 'fatura_onay_bekliyor'
  if (['fatura_kesildi', 'faturası_kesildi', 'faturasi_kesildi', 'tamamlandı', 'tamamlandi'].includes(value)) return 'faturasi_kesildi'
  if (['iptal', 'cancelled'].includes(value)) return 'iptal'
  if (['teklif_toplama'].includes(value)) return 'teklif_toplama'
  if (['pazarlik_onay_bekliyor'].includes(value)) return 'pazarlik_onay_bekliyor'
  if (['pazarlik'].includes(value)) return 'pazarlik'
  if (['siparis'].includes(value)) return 'siparis'
  return value
}

export const statusLabel = (status) => ({
  bekliyor: 'Talep Oluşturuldu',
  // StatusBadge.jsx'in PR_STATUS'üyle aynı sebep: "Onaylandı" sıradaki adımı değil geçmişi
  // anlatıyordu, kullanıcı talebin şu an kimin elinde olduğunu görmek istiyor.
  onaylandi: 'Proje Yöneticisinde',
  red_edildi: 'Red Edildi',
  // StatusBadge.jsx'teki PR_STATUS'la aynı sebep: satin_alindi'nin TEK anlamı "fatura henüz
  // kesilmedi, muhasebe kesmeli" — eskiden "Satın Alındı" gösteriyordu, geçmişi anlatıyordu.
  satin_alindi: 'Fatura Bekleniyor',
  // StatusBadge.jsx'teki PR_STATUS'la aynı sebep: fatura_onay_bekliyor pratikte hiç
  // üretilmiyor bile olsa, aynı akışın iki farklı görünen ismi olmasın diye eşitlendi.
  fatura_bekliyor: 'Fatura Bekleniyor',
  fatura_onay_bekliyor: 'Fatura Onayda',
  faturasi_kesildi: 'Fatura Kesildi',
  iptal: 'İptal Edildi',
  teklif_toplama: 'Teklif Toplama',
  pazarlik_onay_bekliyor: 'Pazarlık Onayı Bekliyor',
  pazarlik: 'Pazarlık',
  siparis: 'Sipariş',
})[normalizeStatus(status)] || String(status || 'Durum yok').replace(/_/g, ' ')

// Talep satın alındı (proje yöneticisi tedarikçi/satın alma bilgisini girdi) ama henüz
// faturası kesilmedi mi? -> "Faturası Kesilecekler" kuyruğunda görünmeli ve Fatura Oluştur
// aksiyonu gösterilmeli. "onaylandi" durumu artık YETERLİ DEĞİL — DB (trg_guard_invoice_
// requires_procurement_done) da bu durumda fatura eklemeyi reddediyor, proje yöneticisi
// önce "Proje Yöneticisinde" aşamasını tamamlayıp talebi satin_alindi'ye ilerletmeli.
export function isAwaitingInvoice(request) {
  return !request.invoice_id && normalizeStatus(request.status) === 'satin_alindi'
}

// Malzeme fiilen satın alınıp projeye ulaştı mı? (fatura süreci bundan sonra, bağımsız ilerler)
function isDelivered(status) {
  return ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi'].includes(normalizeStatus(status))
}

export function materialName(row) {
  return row.equipment || row.material_name || row.name || ''
}

// Bir talep kalemi için eşleşme anahtarı: bom_item_id (kalıcı BOM bağlantısı,
// bkz. "Malzeme eşleştirme önerisi") varsa doğrudan o BOM kaleminin id'sine
// işaret eder — kalemin serbest metin adı ne olursa olsun doğru malzemeyle
// eşleşir. Yoksa eski isim-bazlı (normalize edilmiş) anahtara düşer (geriye
// dönük uyumluluk — henüz bir BOM kalemine bağlanmamış talepler).
export function materialMatchKey(item) {
  return item.bom_item_id ? `id:${item.bom_item_id}` : materialKey(item.name)
}

function requestedTotalsByMaterial(requests) {
  const totals = new Map()
  requests.forEach(request => {
    ;(request.items || request.purchase_request_items || []).forEach(item => {
      const key = materialMatchKey(item)
      if (!key) return
      totals.set(key, (totals.get(key) || 0) + toNumber(item.quantity))
    })
  })
  return totals
}

// "Satın Alma Riski": bir talebin kalemlerinden herhangi biri planlanan (BOM) miktarını
// aşıyor mu? Talep bazında sayar — toplam her zaman requests.length'e eşittir, böylece
// "Onay Bekleyen" KPI'sıyla (aynı requests listesiyle) birebir tutarlı kalır.
export function classifyMaterials(materials, requests) {
  const requestedByMaterial = requestedTotalsByMaterial(requests)
  const plannedByMaterial = new Map()
  materials.forEach(material => {
    const qty = toNumber(material.planned_qty ?? material.quantity)
    plannedByMaterial.set(materialKey(materialName(material)), qty)
    plannedByMaterial.set(`id:${material.id}`, qty)
  })

  return requests.reduce((acc, request) => {
    const items = request.items || request.purchase_request_items || []
    const type = requestType(request)
    const isMaterial = type === 'malzeme'
    const missing = type === 'diger' || (isMaterial && items.some(item => {
      const key = materialMatchKey(item)
      return (plannedByMaterial.get(key) || 0) <= 0
    }))
    const risky = isMaterial && items.some(item => {
      const key = materialMatchKey(item)
      const planned = plannedByMaterial.get(key) || 0
      const requested = requestedByMaterial.get(key) || 0
      return planned > 0 && requested > planned
    })

    acc.total += 1
    if (missing) acc.missing += 1
    else if (risky) acc.excess += 1
    else acc.ok += 1
    return acc
  }, { total: 0, ok: 0, excess: 0, missing: 0 })
}

// Yalnızca fiilen satın alınmış/teslim edilmiş taleplerin miktarı → projeye gönderilen miktar
// (fatura süreci bundan bağımsız ilerler; henüz faturası kesilmemiş olması "gönderilmedi" anlamına gelmez)
function sentTotalsByMaterial(requests) {
  const purchased = requests.filter(r => isDelivered(r.status))
  return requestedTotalsByMaterial(purchased)
}

export function buildMaterialListRows(materials, requests) {
  const sentByMaterial = sentTotalsByMaterial(requests)
  return materials.map(material => {
    // Kanonik alan planned_qty (numeric) — eski quantity (text) yalnızca geriye
    // dönük uyumluluk için fallback, backend ikisini senkron tutuyor.
    const planned = toNumber(material.planned_qty ?? material.quantity)
    // Bu malzemeye hem doğrudan bom_item_id ile bağlı kalemlerin (id: anahtarı)
    // hem de henüz bağlanmamış ama ismi tesadüfen eşleşen kalemlerin (isim
    // anahtarı) toplamı — bir kalem materialMatchKey'e göre yalnızca BİRİNE
    // düştüğünden (asla ikisine birden) çift sayım olmaz.
    const sent = (sentByMaterial.get(`id:${material.id}`) || 0) + (sentByMaterial.get(materialKey(materialName(material))) || 0)
    return {
      id: material.id,
      material: materialName(material) || 'Malzeme',
      unit: material.unit || '',
      category: material.category || '',
      planned,
      sent,
      required: Math.max(0, planned - sent),
      addedQty: toNumber(material.added_qty),
      addedViaCount: Number(material.added_via_count || 0),
      hasHistory: !!material.has_history,
    }
  })
}

// Bir talebin kalemlerini plan (BOM) ve tüm taleplerdeki toplam istenen miktarla karşılaştırıp
// "neden riskli" sorusuna cevap veren satır satır döküm çıkarır.
export function riskBreakdownForItems(items, materialPlan, requestedTotals) {
  return (items || []).map(item => {
    const key = materialMatchKey(item)
    const planned = materialPlan.get(key) || 0
    const totalRequested = requestedTotals.get(key) || 0
    return {
      name: item.name,
      quantity: toNumber(item.quantity),
      unit: item.unit || '',
      planned,
      totalRequested,
      excess: Math.max(0, totalRequested - planned),
      risky: planned > 0 && totalRequested > planned,
    }
  })
}

// Talep listesindeki rozet için 3 durumlu risk hesabı: 'riskli' | 'listede_yok' | 'uygun'.
// Malzeme tipi bir talebin hiçbir kalemi proje malzeme listesinde (BOM) bulunamadıysa
// risk hesaplanamadığı için "Uygun" değil "Listede Yok" gösterilmeli.
export function riskState(items, materialPlan, requestedTotals, category) {
  if (category === 'diger' || category === 'diğer') return 'listede_yok'
  if (category !== 'malzeme') return 'uygun'
  const breakdown = riskBreakdownForItems(items, materialPlan, requestedTotals)
  if (breakdown.some(row => row.planned <= 0)) return 'listede_yok'
  if (breakdown.some(row => row.risky)) return 'riskli'
  return 'uygun'
}

// Levenshtein mesafesine dayalı, 0-1 arası normalize benzerlik oranı — küçük
// projeler ölçeğinde (birkaç yüz BOM kalemi/talep) client-side hesaplamak
// yeterince hızlı, ayrı bir Postgres fuzzy-match extension'ı (pg_trgm) gerekmiyor.
function levenshteinDistance(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], row[j - 1])
    }
    prev = row
  }
  return prev[b.length]
}

function wholeStringSimilarity(a, b) {
  const x = materialKey(a)
  const y = materialKey(b)
  if (!x || !y) return 0
  const maxLen = Math.max(x.length, y.length)
  if (!maxLen) return 1
  return 1 - levenshteinDistance(x, y) / maxLen
}

function tokenize(text) {
  return materialKey(text).split(' ').filter(Boolean)
}

// Gerçek BOM verisinde talep kalemi adı genelde kısa/kolokyal ("TTR kablo"),
// BOM'daki kanonik ad ise uzun/teknik ("3x2,5mm2 TTR Kablo Kamera Panosu ve
// Kamera Direği arası") — saf tüm-string Levenshtein'i uzunluk farkı yüzünden
// bu çifti neredeyse hiç eşiğin üstüne çıkaramıyordu (gerçek proje verisiyle
// doğrulandı, bkz. CLAUDE.md). Kısa olan tarafın her kelimesini uzun taraftaki
// EN İYİ eşleşen kelimeyle karşılaştırıp ortalamasını alıyoruz — uzun tarafın
// fazladan kelimeleri (kamera/panosu/arası gibi) skoru seyreltmiyor.
function tokenSetSimilarity(a, b) {
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  if (!tokensA.length || !tokensB.length) return 0
  const [shortTokens, longTokens] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA]
  const total = shortTokens.reduce((sum, t) => {
    const best = longTokens.reduce((max, u) => {
      const score = 1 - levenshteinDistance(t, u) / Math.max(t.length, u.length)
      return score > max ? score : max
    }, 0)
    return sum + best
  }, 0)
  return total / shortTokens.length
}

export function nameSimilarity(a, b) {
  return Math.max(wholeStringSimilarity(a, b), tokenSetSimilarity(a, b))
}

// Malzeme Listesi'nde bir BOM kalemine henüz bağlanmamış (bom_item_id=null)
// "malzeme" tipi, iptal/reddedilmemiş talep kalemleri için en olası BOM eşleşmesini
// önerir — kullanıcı onaylarsa link_purchase_request_item_to_bom ile kalıcı
// bağlanır. Yalnızca isim benzerliği eşiği (varsayılan %55) geçen ve aynı projeye
// ait en iyi tek aday döndürülür; eşik altı hiçbir öneri üretilmez (rastgele
// eşleşmeleri önlemek için — bu bir otomatik eşleştirme değil, öneri).
export function suggestBomMatches(requests, materials, threshold = 0.55) {
  const suggestions = []
  requests.forEach(request => {
    if (['reddedildi', 'red_edildi', 'iptal'].includes(normalizeStatus(request.status))) return
    if (requestType(request) !== 'malzeme') return
    ;(request.items || request.purchase_request_items || []).forEach(item => {
      if (item.bom_item_id) return
      if (!item.name) return
      let best = null
      materials.forEach(material => {
        const score = nameSimilarity(item.name, materialName(material))
        if (score >= threshold && (!best || score > best.score)) {
          best = { candidateId: material.id, candidateName: materialName(material), candidateUnit: material.unit || '', score }
        }
      })
      if (best) {
        suggestions.push({
          itemId: item.id,
          requestId: request.id,
          requestNo: request.request_no,
          requestTitle: request.title,
          typedName: item.name,
          quantity: toNumber(item.quantity),
          unit: item.unit || '',
          ...best,
        })
      }
    })
  })
  return suggestions.sort((a, b) => b.score - a.score)
}

export function requestType(request) {
  if (['malzeme', 'hizmet', 'diger'].includes(request.category)) return request.category
  // Eski kayıtlarda kategori girilmemiş olabilir; başlık/kalem adlarından tahmin ediyoruz.
  const text = `${request.title || ''} ${(request.items || []).map(i => i.name).join(' ')}`.toLocaleLowerCase('tr-TR')
  return /hizmet|işçilik|iscilik|kiralama|nakliye/.test(text) ? 'hizmet' : 'malzeme'
}

export function classifyRequestTypes(requests) {
  return requests.reduce((acc, request) => {
    const type = requestType(request)
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, { malzeme: 0, hizmet: 0, diger: 0 })
}

// Talepleri/malzemeleri project_id'ye göre gruplar. Farklı projelerin BOM'ları
// birbirine karışmasın diye tüm çapraz-proje hesaplar bu gruplama üzerinden yapılır.
export function groupByProjectId(rows) {
  const groups = new Map()
  ;(rows || []).forEach(row => {
    const projectId = row.project_id || '—'
    if (!groups.has(projectId)) {
      groups.set(projectId, { projectName: row.project_name || null, rows: [] })
    }
    groups.get(projectId).rows.push(row)
  })
  return groups
}
