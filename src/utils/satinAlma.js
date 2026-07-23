export const toNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export const materialKey = (value) =>
  String(value || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')

// purchase_requests_status_check (Supabase) yalnızca şu değerlere izin verir:
// talep_olusturuldu, fiyat_girildi, onay_bekliyor, onaylandi, reddedildi, satin_alindi,
// fatura_bekliyor, fatura_onay_bekliyor, faturasi_kesildi, iptal.
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
})[normalizeStatus(status)] || String(status || 'Durum yok').replace(/_/g, ' ')

// Talep satın alındı (proje yöneticisi tedarikçi/satın alma bilgisini girdi) ama henüz
// faturası kesilmedi mi? -> "Faturası Kesilecekler" kuyruğunda görünmeli ve Fatura Oluştur
// aksiyonu gösterilmeli. "onaylandi" durumu artık YETERLİ DEĞİL — DB (trg_guard_invoice_
// requires_procurement_done) da bu durumda fatura eklemeyi reddediyor, proje yöneticisi
// önce "Proje Yöneticisinde" aşamasını tamamlayıp talebi satin_alindi'ye ilerletmeli.
export function isAwaitingInvoice(request) {
  return !request.invoice_id && normalizeStatus(request.status) === 'satin_alindi'
}

// TalepDetayModal.jsx'in dikey "Onay Süreci" stepper'ıyla birebir aynı 5 adım/karar mantığı —
// bildirimler sayfasındaki yatay özet burada tekilleştirildi (tarih/tedarikçi detayı olmadan,
// yalnızca adım durumu — kompakt bildirim satırına sığması için).
export function buildApprovalSteps(status) {
  const s = normalizeStatus(status)
  const isRejected = s === 'red_edildi'
  const approvalDone = ['onaylandi', 'satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi'].includes(s)
  const procurementActive = s === 'onaylandi'
  const procurementDone = ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi'].includes(s)
  // satin_alindi, proje yöneticisinin işi tamamladığı ve sıranın hemen muhasebeye
  // geçtiği durumdur; bu yüzden süreç çizgisinde bekleyen adım "Fatura Bekleniyor"dur.
  const invoiceActive = ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor'].includes(s)
  const invoiceDone = s === 'faturasi_kesildi'

  return [
    { key: 'talep', label: 'Talep Oluşturuldu', done: true },
    { key: 'onay', label: isRejected ? 'Onay Reddedildi' : 'Yönetici Onayı', done: approvalDone, active: s === 'bekliyor', rejected: isRejected },
    { key: 'proje_yoneticisi', label: 'Proje Yöneticisinde', done: procurementDone, active: procurementActive },
    { key: 'fatura_bekliyor', label: 'Fatura Bekleniyor', done: invoiceDone, active: invoiceActive },
    { key: 'fatura_kesildi', label: 'Fatura Kesildi', done: invoiceDone },
  ]
}

// Malzeme fiilen satın alınıp projeye ulaştı mı? (fatura süreci bundan sonra, bağımsız ilerler)
function isDelivered(status) {
  return ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi'].includes(normalizeStatus(status))
}

export function materialName(row) {
  return row.equipment || row.material_name || row.name || ''
}

function requestedTotalsByMaterial(requests) {
  const totals = new Map()
  requests.forEach(request => {
    ;(request.items || request.purchase_request_items || []).forEach(item => {
      const key = materialKey(item.name)
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
  const plannedByMaterial = new Map(
    materials.map(material => [materialKey(materialName(material)), toNumber(material.planned_qty ?? material.quantity)])
  )

  return requests.reduce((acc, request) => {
    const items = request.items || request.purchase_request_items || []
    const type = requestType(request)
    const isMaterial = type === 'malzeme'
    const missing = type === 'diger' || (isMaterial && items.some(item => {
      const key = materialKey(item.name)
      return (plannedByMaterial.get(key) || 0) <= 0
    }))
    const risky = isMaterial && items.some(item => {
      const key = materialKey(item.name)
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
    const key = materialKey(materialName(material))
    const sent = sentByMaterial.get(key) || 0
    return {
      id: material.id,
      material: materialName(material) || 'Malzeme',
      unit: material.unit || '',
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
    const key = materialKey(item.name)
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
