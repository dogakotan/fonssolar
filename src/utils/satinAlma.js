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
  bekliyor: 'Bekliyor',
  onaylandi: 'Onaylandı',
  red_edildi: 'Red Edildi',
  satin_alindi: 'Satın Alındı',
  fatura_bekliyor: 'Fatura Bekleniyor',
  fatura_onay_bekliyor: 'Fatura Onayında',
  faturasi_kesildi: 'Faturası Kesildi',
  iptal: 'İptal Edildi',
})[normalizeStatus(status)] || String(status || 'Durum yok').replace(/_/g, ' ')

// Talep onaylandı/satın alındı ama henüz faturası kesilmedi mi? -> "Faturası Kesilecekler"
// kuyruğunda görünmeli ve Fatura Oluştur aksiyonu gösterilmeli.
export function isAwaitingInvoice(request) {
  return !request.invoice_id && ['onaylandi', 'satin_alindi'].includes(normalizeStatus(request.status))
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
    ;(request.items || []).forEach(item => {
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
    materials.map(material => [materialKey(materialName(material)), toNumber(material.quantity)])
  )

  return requests.reduce((acc, request) => {
    const risky = (request.items || []).some(item => {
      const key = materialKey(item.name)
      const planned = plannedByMaterial.get(key) || 0
      const requested = requestedByMaterial.get(key) || 0
      return planned > 0 && requested > planned
    })

    acc.total += 1
    if (risky) acc.excess += 1
    else acc.ok += 1
    return acc
  }, { total: 0, ok: 0, excess: 0 })
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
    const planned = toNumber(material.quantity)
    const key = materialKey(materialName(material))
    const sent = sentByMaterial.get(key) || 0
    return {
      id: material.id,
      material: materialName(material) || 'Malzeme',
      unit: material.unit || '',
      planned,
      sent,
      required: Math.max(0, planned - sent),
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
  const breakdown = riskBreakdownForItems(items, materialPlan, requestedTotals)
  if (breakdown.some(row => row.risky)) return 'riskli'
  if (category === 'malzeme' && breakdown.length > 0 && breakdown.every(row => row.planned <= 0)) return 'listede_yok'
  return 'uygun'
}

export function requestType(request) {
  if (request.category === 'malzeme' || request.category === 'hizmet') return request.category
  // Eski kayıtlarda kategori girilmemiş olabilir; başlık/kalem adlarından tahmin ediyoruz.
  const text = `${request.title || ''} ${(request.items || []).map(i => i.name).join(' ')}`.toLocaleLowerCase('tr-TR')
  return /hizmet|işçilik|iscilik|kiralama|nakliye/.test(text) ? 'hizmet' : 'malzeme'
}

export function classifyRequestTypes(requests) {
  return requests.reduce((acc, request) => {
    acc[requestType(request)] += 1
    return acc
  }, { malzeme: 0, hizmet: 0 })
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

// Her proje için classifyMaterials'i ayrı çağırıp {total, ok, excess} toplamlarını döner.
// Asla projeler arası düzleştirilmiş (flatten) bir malzeme haritası kullanmaz.
export function aggregateMaterialsAcrossProjects(materialsByProject, requestsByProject) {
  const totals = { total: 0, ok: 0, excess: 0 }
  requestsByProject.forEach((group, projectId) => {
    const materials = materialsByProject.get(projectId)?.rows || []
    const result = classifyMaterials(materials, group.rows)
    totals.total += result.total
    totals.ok += result.ok
    totals.excess += result.excess
  })
  return totals
}

