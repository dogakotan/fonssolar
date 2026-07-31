import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import YeniTalepModal from '../../../components/satin-alma/YeniTalepModal'
import TalepDetayModal from '../../../components/satin-alma/TalepDetayModal'
import FaturaOlusturModal from '../../../components/satin-alma/FaturaOlusturModal'
import Pager from '../../../components/ui/Pager'
import { toNumber, materialKey, normalizeStatus, materialName, riskState, groupByProjectId, isAwaitingInvoice } from '../../../utils/satinAlma'
import { requestNo } from '../../../utils/purchaseRequestNo'

const STATUS_FILTERS = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'bekliyor', label: 'Talep Oluşturuldu' },
  { value: 'onaylandi', label: 'Proje Yöneticisinde' },
  { value: 'satin_alindi', label: 'Fatura Bekleniyor' },
  { value: 'fatura_onay_bekliyor', label: 'Fatura Onayda' },
  { value: 'faturasi_kesildi', label: 'Fatura Kesildi' },
  { value: 'red_edildi', label: 'Reddedildi' },
  { value: 'iptal', label: 'İptal' },
]

const PROJECT_MANAGER_STATUS_FILTERS = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'bekliyor', label: 'Talep Oluşturuldu' },
  { value: 'onaylandi', label: 'Proje Yöneticisinde' },
  { value: 'invoice_waiting', label: 'Fatura Bekleniyor' },
  { value: 'faturasi_kesildi', label: 'Fatura Kesildi' },
  { value: 'red_edildi', label: 'Reddedildi' },
  { value: 'iptal', label: 'İptal' },
]

const SITE_CHIEF_STATUS_FILTERS = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'created', label: 'Talep Oluşturuldu' },
  { value: 'processing', label: 'İşleme Alındı' },
  { value: 'completed', label: 'İşlem Tamamlandı' },
]

const PAGE_SIZE = 10
const ROW_HEIGHT = 64
const HEADER_HEIGHT = 24
const EMPTY_MAP = new Map()

const TH = { height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 12px', lineHeight: `${HEADER_HEIGHT}px`, textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const TD = { height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 12px', fontSize: 12.5, color: 'var(--color-text-sub)', verticalAlign: 'middle' }

const fmtDate = (date) =>
  date ? new Date(date).toLocaleDateString('tr-TR') : '—'

function materialTitle(request) {
  return request.material_name || request.title || request.description || 'Satın alma talebi'
}

function requesterName(request) {
  return request.requester_name || request.requested_by_name || request.created_by_name || '—'
}

function requestType(request) {
  if (request.category === 'malzeme') return 'Malzeme'
  if (request.category === 'hizmet') return 'Hizmet'
  if (request.category === 'diger') return 'Diğer'
  const text = `${request.title || ''} ${(request.items || []).map(item => item.name).join(' ')}`.toLocaleLowerCase('tr-TR')
  return /hizmet|işçilik|iscilik|kiralama|nakliye/.test(text) ? 'Hizmet' : 'Malzeme'
}

const RISK_STATE_META = {
  riskli: { color: 'var(--color-danger)', label: 'Riskli' },
  listede_yok: { color: 'var(--color-warning)', label: 'Listede Yok' },
  uygun: { color: 'var(--color-success)', label: 'Uygun' },
}

// İşlem durumu — tek nokta + kalın metin rozeti (UYGUNLUK kolonundaki RiskBadge
// ile aynı görsel dil). Süreç adımları zaten TalepDetayModal'da dikey stepper
// olarak duruyor; listede aynı bilgiyi 5 (site şefinde 3) adımlı yatay bir
// göstergeyle tekrarlamaya gerek yok — durum filtresindeki etiketlerle birebir
// aynı metinler kullanılır (STATUS_FILTERS/SITE_CHIEF_STATUS_FILTERS).
const PROCESS_STATUS_META = {
  bekliyor:             { color: 'var(--color-primary)', label: 'Talep Oluşturuldu' },
  onaylandi:            { color: 'var(--color-warning)', label: 'Proje Yöneticisinde' },
  satin_alindi:         { color: 'var(--color-warning)', label: 'Fatura Bekleniyor' },
  fatura_bekliyor:      { color: 'var(--color-warning)', label: 'Fatura Bekleniyor' },
  fatura_onay_bekliyor: { color: 'var(--color-primary)', label: 'Fatura Onayda' },
  faturasi_kesildi:     { color: 'var(--color-success)', label: 'Fatura Kesildi' },
  red_edildi:           { color: 'var(--color-danger)',  label: 'Reddedildi' },
  iptal:                { color: 'var(--color-muted)',   label: 'İptal' },
}

const SITE_CHIEF_PROCESS_STATUS_META = {
  bekliyor:             { color: 'var(--color-primary)', label: 'Talep Oluşturuldu' },
  onaylandi:            { color: 'var(--color-warning)', label: 'İşleme Alındı' },
  satin_alindi:         { color: 'var(--color-success)', label: 'İşlem Tamamlandı' },
  fatura_bekliyor:      { color: 'var(--color-success)', label: 'İşlem Tamamlandı' },
  fatura_onay_bekliyor: { color: 'var(--color-success)', label: 'İşlem Tamamlandı' },
  faturasi_kesildi:     { color: 'var(--color-success)', label: 'İşlem Tamamlandı' },
  red_edildi:           { color: 'var(--color-danger)',  label: 'İşlem İptal Edildi' },
  iptal:                { color: 'var(--color-danger)',  label: 'İşlem İptal Edildi' },
}

function ProcessStatusBadge({ status, isSiteChief }) {
  const normalized = normalizeStatus(status)
  const meta = (isSiteChief ? SITE_CHIEF_PROCESS_STATUS_META : PROCESS_STATUS_META)[normalized] || { color: 'var(--color-muted)', label: normalized }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: meta.color, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
      {meta.label}
    </span>
  )
}

function RiskBadge({ state }) {
  const meta = RISK_STATE_META[state] || RISK_STATE_META.uygun
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: meta.color, fontSize: 12, fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} />
      {meta.label}
    </span>
  )
}

// projectId yoksa (menü modu): tüm projelerin talepleri, PROJE kolonu, malzeme planı proje
// bazlı gruplanır (groupByProjectId). projectId doluysa (proje modu): yalnız o proje
// (filterDate'e kadar), siteChiefView ile kendi taleplerine süzme, malzeme planı tek Map state.
export default function TabSatinAlmaTalepListesi({
  onChanged,
  onlyPending = false,
  fixedStatus = null,
  listTitle,
  procurement,
  projectId,
  filterDate,
  refreshKey,
  siteChiefView = false,
  openRequestId,
  onOpenedRequest,
}) {
  const { user, role, isAdmin, isMuhasebe } = useAuth()
  const [requests, setRequests] = useState([])
  const [materialPlan, setMaterialPlan] = useState(new Map())
  const [requestedTotals, setRequestedTotals] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(onlyPending ? 'bekliyor' : 'all')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)
  const [faturaRequest, setFaturaRequest] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  // Reddet/İptal Et için satır-içi gerekçe alanı — { id, note } iken o satırda
  // buton grubu yerine gerekçe input'u + onay/vazgeç gösterilir (OnayReddetActions.jsx
  // "compact" moduyla aynı desen). Gerekçe boşken gönderim disabled kalır.
  const [rejectDraft, setRejectDraft] = useState(null)
  // "Tamamlandı" tıklanınca satır içinde açılan opsiyonel tedarikçi seçici —
  // { id, supplierId } iken o satırda buton grubu yerine bu gösterilir
  // (rejectDraft'la aynı desen). Boş bırakılıp doğrudan onaylanabilir.
  const [completeDraft, setCompleteDraft] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [page, setPage] = useState(0)

  const canCreate = role === 'santiye_sefi' || role === 'proje_yoneticisi'
  const canInvoice = isMuhasebe
  const canApprove = isAdmin
  const canCompleteProcurement = role === 'proje_yoneticisi'

  // fetchData kapsam değerleri değiştiğinde çalışır; render-başına oluşan
  // fonksiyonun kendisini dependency yapmak tekrar çağrı döngüsüne neden olur.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [projectId, filterDate, onlyPending, refreshKey])
  useEffect(() => { setPage(0) }, [statusFilter, fixedStatus, onlyPending, projectId, refreshKey])

  // Tedarikçi listesi yalnızca "Tamamlandı" akışında (proje yöneticisi) gerekiyor.
  useEffect(() => {
    if (!canCompleteProcurement) return
    supabase.from('suppliers').select('id, name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [canCompleteProcurement])

  // Dışarıdan (Bildirimler sayfasından) belirli bir talebe doğrudan gitme —
  // mevcut filtrelerden bağımsız, tek talebi id ile çekip açar (TicketListesi'nin
  // openTicketId deseniyle aynı).
  useEffect(() => {
    if (!openRequestId) return
    let alive = true
    supabase.rpc('get_purchase_request_detail', { p_id: openRequestId }).then(({ data }) => {
      if (!alive) return
      if (data?.authorized && data?.request) setSelected(data.request)
      onOpenedRequest?.()
    })
    return () => { alive = false }
  }, [openRequestId, onOpenedRequest])

  // Üst bileşen (ProjeTabSatinAlma) procurement_items'i zaten tek bir RPC ile getirdiyse
  // burada aynı tabloyu ikinci kez sorgulamak yerine o veriden malzeme planını hesaplıyoruz.
  // Yalnızca proje modunda anlamlı — menü modunda plan proje bazlı gruplanarak render'da hesaplanır.
  useEffect(() => {
    if (!projectId) return
    if (!procurement) return
    const plan = new Map()
    procurement.forEach(material => {
      const key = materialKey(materialName(material))
      if (!key) return
      plan.set(key, toNumber(material.planned_qty ?? material.planned_quantity ?? material.quantity))
    })
    setMaterialPlan(plan)
  }, [projectId, procurement])

  async function fetchData() {
    setLoading(true)
    setErrorMessage('')

    const [requestsResult, materialResult] = await Promise.all([
      supabase.rpc('get_purchase_requests_list', {
        p_project_id: projectId || null,
        p_filter_date: filterDate || null,
        p_only_pending: onlyPending,
      }),
      projectId && !procurement ? supabase.from('procurement_items').select('*').eq('project_id', projectId) : Promise.resolve(null),
    ])

    if (requestsResult.error || !requestsResult.data?.authorized) {
      console.error('purchase_requests load error:', requestsResult.error)
      setErrorMessage('Satın alma talepleri yüklenemedi.')
      setRequests([])
      setLoading(false)
      return
    }

    const rows = requestsResult.data.requests || []
    setRequests(rows)

    if (projectId) {
      const totals = new Map()
      rows.filter(row => normalizeStatus(row.status) === 'bekliyor').forEach(row => {
        ;(row.items || []).forEach(item => {
          const key = materialKey(item.name)
          if (!key) return
          totals.set(key, (totals.get(key) || 0) + toNumber(item.quantity))
        })
      })
      setRequestedTotals(totals)

      if (!procurement) {
        const plan = new Map()
        ;(materialResult?.data || []).forEach(material => {
          const key = materialKey(materialName(material))
          if (!key) return
          plan.set(key, toNumber(material.planned_quantity ?? material.quantity))
        })
        setMaterialPlan(plan)
      }
    }

    setLoading(false)
  }

  // Menü modunda (projectId yok) malzeme planı/talep toplamları proje bazlı gruplanır —
  // her satır kendi project_id'siyle ilgili map'i render sırasında bulur.
  const materialPlanByProject = new Map()
  const requestedTotalsByProject = new Map()
  if (!projectId) {
    groupByProjectId(procurement || []).forEach((group, groupProjectId) => {
      const plan = new Map()
      group.rows.forEach(material => {
        const key = materialKey(materialName(material))
        if (!key) return
        plan.set(key, toNumber(material.planned_qty ?? material.planned_quantity ?? material.quantity))
      })
      materialPlanByProject.set(groupProjectId, plan)
    })

    groupByProjectId(requests.filter(row => normalizeStatus(row.status) === 'bekliyor')).forEach((group, groupProjectId) => {
      const totals = new Map()
      group.rows.forEach(row => {
        ;(row.items || []).forEach(item => {
          const key = materialKey(item.name)
          if (!key) return
          totals.set(key, (totals.get(key) || 0) + toNumber(item.quantity))
        })
      })
      requestedTotalsByProject.set(groupProjectId, totals)
    })
  }

  async function updateStatus(event, id, status, note) {
    event.stopPropagation()
    setActionLoading(id)
    setErrorMessage('')
    const payload = { status, updated_at: new Date().toISOString() }
    if (note) {
      const current = requests.find(r => r.id === id)
      payload.notes = [current?.notes, note].filter(Boolean).join('\n')
    }
    let query = supabase
      .from('purchase_requests')
      .update(payload)
      .eq('id', id)
    if (projectId) query = query.eq('project_id', projectId)
    const { error } = await query

    if (error) {
      console.error('purchase_requests status update error:', error)
      setErrorMessage('Durum güncellenemedi.')
    } else {
      setRejectDraft(null)
      await fetchData()
      onChanged?.()
    }
    setActionLoading(null)
  }

  async function completeProjectManagerRequest(event, request, supplierId) {
    event.stopPropagation()
    setActionLoading(request.id)
    setErrorMessage('')

    const { error } = await supabase.rpc('complete_project_manager_purchase_request', {
      p_request_id: request.id,
      p_supplier_id: supplierId || null,
    })

    if (error) {
      console.error('project manager purchase completion error:', error)
      setErrorMessage(error.message || 'Talep tamamlanamadı.')
    } else {
      setCompleteDraft(null)
      await fetchData()
      onChanged?.()
    }
    setActionLoading(null)
  }

  async function deleteOwnPendingRequest(event, request) {
    event.stopPropagation()
    if (!window.confirm('Bu satın alma talebi silinecek. Onaylıyor musunuz?')) return
    setActionLoading(request.id)
    setErrorMessage('')
    const { error } = await supabase
      .from('purchase_requests')
      .delete()
      .eq('id', request.id)
      .eq('requested_by', user.id)

    if (error) {
      console.error('purchase request delete error:', error)
      setErrorMessage('Talep silinemedi. Yalnızca henüz onaylanmamış kendi talebinizi silebilirsiniz.')
    } else {
      await fetchData()
      onChanged?.()
    }
    setActionLoading(null)
  }

  const filtered = requests.filter(request => {
    // Şantiye şefi görünümünde sadece kendi oluşturduğu talepler listelenir — proje
    // içindeki diğer kişilerin (yönetici vb.) talepleri gösterilmez.
    if (siteChiefView && request.requested_by !== user?.id) return false
    const normalized = normalizeStatus(request.status)
    if (fixedStatus) return normalized === fixedStatus
    if (onlyPending) return true
    if (statusFilter === 'all') return true
    if (siteChiefView) {
      if (statusFilter === 'created') return normalized === 'bekliyor'
      if (statusFilter === 'processing') return normalized === 'onaylandi'
      if (statusFilter === 'completed') return ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi'].includes(normalized)
      return true
    }
    if (role === 'proje_yoneticisi' && statusFilter === 'invoice_waiting') {
      return ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor'].includes(normalized)
    }
    return normalized === statusFilter
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const emptyText = fixedStatus === 'onaylandi'
    ? 'Proje yöneticisinde bekleyen satın alma talebi yok.'
    : onlyPending
      ? 'Onay bekleyen satın alma talebi yok.'
      : isMuhasebe
        ? 'Faturalanacak satın alma talebi yok.'
        : projectId ? 'Bu projeye ait satın alma talebi bulunmuyor.' : 'Hiç satın alma talebi bulunmuyor.'

  const showActions = canApprove || canCompleteProcurement || canInvoice || siteChiefView
  const headers = projectId
    ? ['TALEP', 'OLUŞTURAN', 'UYGUNLUK', 'KATEGORİ', 'İŞLEM DURUMU', ...(showActions ? ['İŞLEM'] : [])]
    : ['TALEP', 'PROJE', 'OLUŞTURAN', 'UYGUNLUK', 'KATEGORİ', 'İŞLEM DURUMU', ...(showActions ? ['İŞLEM'] : [])]

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          {listTitle || (onlyPending ? 'Onay Bekleyenler' : 'Tüm Satın Alma Talepleri')}
        </h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 7 }}>
          {filtered.length} talep
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Muhasebe'nin verisi zaten satin_alindi/fatura_bekliyor ile sınırlı (ikisi de
              aynı "Fatura Bekleniyor" etiketini taşıyor) — durum filtresi burada anlamsız,
              çoğu seçenek hep boş dönerdi. Bunun yerine kapsamı açıklayan sabit bir etiket
              gösteriliyor. */}
          {!onlyPending && !fixedStatus && isMuhasebe && (
            <span style={{ fontSize: 11.5, color: 'var(--color-muted)', fontStyle: 'italic' }}>
              Yalnızca faturalanacak talepler listelenir
            </span>
          )}
          {!onlyPending && !fixedStatus && !isMuhasebe && (
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              style={{ border: '1px solid var(--color-border-md)', borderRadius: 7, padding: '5px 28px 5px 10px', fontSize: 12, color: 'var(--color-text-sub)', background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
            >
              {(siteChiefView
                ? SITE_CHIEF_STATUS_FILTERS
                : role === 'proje_yoneticisi'
                  ? PROJECT_MANAGER_STATUS_FILTERS
                  : STATUS_FILTERS
              ).map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
          {canCreate && !onlyPending && (
            <button
              onClick={() => setShowNew(true)}
              style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + Yeni Satın Alma Talebi
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div style={{ padding: '10px 20px', background: '#FEF2F2', color: '#991B1B', fontSize: 13, borderBottom: '1px solid #FECACA' }}>
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>Yükleniyor…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>{emptyText}</div>
      ) : (
        <>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: projectId ? 560 : 660 }}>
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(request => {
                const normalizedStatus = normalizeStatus(request.status)
                const isPending = normalizedStatus === 'bekliyor'
                const isWaitingForProjectManager = normalizedStatus === 'onaylandi'
                const rowMaterialPlan = projectId ? materialPlan : (materialPlanByProject.get(request.project_id) || EMPTY_MAP)
                const rowRequestedTotals = projectId ? requestedTotals : (requestedTotalsByProject.get(request.project_id) || EMPTY_MAP)
                const risk = riskState(request.items || [], rowMaterialPlan, rowRequestedTotals, request.category || requestType(request).toLocaleLowerCase('tr-TR'))
                return (
                  <tr
                    key={request.id}
                    onClick={() => setSelected(request)}
                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                    onMouseEnter={event => { event.currentTarget.style.background = 'var(--color-bg)' }}
                    onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ ...TD, minWidth: projectId ? 240 : 220 }}>
                      <div style={{ display: 'grid', gap: 5 }}>
                        <strong style={{ color: 'var(--color-text)', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={materialTitle(request)}>{materialTitle(request)}</strong>
                        <span style={{ color: 'var(--color-primary)', fontSize: 11, fontWeight: 800 }}>{requestNo(request)}</span>
                      </div>
                    </td>
                    {!projectId && (
                      <td style={{ ...TD, color: 'var(--color-text-sub)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={request.project_name || ''}>{request.project_name || '—'}</td>
                    )}
                    <td style={{ ...TD, minWidth: 130 }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <strong style={{ color: 'var(--color-text-sub)', fontSize: 12.5 }}>{requesterName(request)}</strong>
                        <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{fmtDate(request.request_date || request.created_at)}</span>
                      </div>
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><RiskBadge state={risk} /></td>
                    <td style={TD}>
                      <span style={{ color: requestType(request) === 'Malzeme' ? 'var(--color-primary)' : requestType(request) === 'Diğer' ? 'var(--color-warning)' : 'var(--color-success)', fontSize: 12, fontWeight: 800 }}>
                        {requestType(request)}
                      </span>
                    </td>
                    <td style={{ ...TD, minWidth: 150, whiteSpace: 'nowrap' }}>
                      <ProcessStatusBadge status={request.status} isSiteChief={siteChiefView} />
                    </td>
                    {showActions && (
                    <td style={{ ...TD, minWidth: projectId ? 180 : 128, whiteSpace: 'nowrap' }}>
                      {siteChiefView && isPending && request.requested_by === user?.id ? (
                        <button
                          onClick={event => deleteOwnPendingRequest(event, request)}
                          disabled={actionLoading === request.id}
                          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          {actionLoading === request.id ? '…' : 'Talebi Sil'}
                        </button>
                      ) : isPending && canApprove ? (
                        rejectDraft?.id === request.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }} onClick={event => event.stopPropagation()}>
                            <input
                              type="text" autoFocus placeholder="Red gerekçesi (zorunlu)"
                              value={rejectDraft.note}
                              onChange={event => setRejectDraft(d => ({ ...d, note: event.target.value }))}
                              style={{ border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontFamily: 'inherit', outline: 'none', width: 140 }}
                            />
                            <button
                              onClick={event => updateStatus(event, request.id, 'reddedildi', rejectDraft.note.trim())}
                              disabled={actionLoading === request.id || !rejectDraft.note.trim()}
                              style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontWeight: 700, cursor: rejectDraft.note.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: rejectDraft.note.trim() ? 1 : 0.6 }}
                            >
                              {actionLoading === request.id ? '…' : 'Reddi Onayla'}
                            </button>
                            <button
                              onClick={event => { event.stopPropagation(); setRejectDraft(null) }}
                              style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              Vazgeç
                            </button>
                          </div>
                        ) : (
                        <div style={{ display: 'flex', gap: projectId ? 6 : 5, flexWrap: 'nowrap' }}>
                          <button onClick={event => updateStatus(event, request.id, 'onaylandi')} disabled={actionLoading === request.id} style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: projectId ? '5px 10px' : '5px 8px', fontSize: projectId ? 12 : 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {actionLoading === request.id ? '…' : 'Onayla'}
                          </button>
                          <button onClick={event => { event.stopPropagation(); setRejectDraft({ id: request.id, note: '' }) }} disabled={actionLoading === request.id} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: projectId ? '5px 10px' : '5px 8px', fontSize: projectId ? 12 : 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Reddet
                          </button>
                        </div>
                        )
                      ) : canCompleteProcurement && isWaitingForProjectManager ? (
                        completeDraft?.id === request.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }} onClick={event => event.stopPropagation()}>
                            <select
                              autoFocus
                              value={completeDraft.supplierId}
                              onChange={event => setCompleteDraft(d => ({ ...d, supplierId: event.target.value }))}
                              style={{ border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontFamily: 'inherit', outline: 'none', width: 140 }}
                            >
                              <option value="">Tedarikçisiz devam et</option>
                              {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                            </select>
                            <button
                              onClick={event => completeProjectManagerRequest(event, request, completeDraft.supplierId)}
                              disabled={actionLoading === request.id}
                              style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              {actionLoading === request.id ? '…' : 'Onayla'}
                            </button>
                            <button
                              onClick={event => { event.stopPropagation(); setCompleteDraft(null) }}
                              style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              Vazgeç
                            </button>
                          </div>
                        ) : rejectDraft?.id === request.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }} onClick={event => event.stopPropagation()}>
                            <input
                              type="text" autoFocus placeholder="İptal gerekçesi (zorunlu)"
                              value={rejectDraft.note}
                              onChange={event => setRejectDraft(d => ({ ...d, note: event.target.value }))}
                              style={{ border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontFamily: 'inherit', outline: 'none', width: 140 }}
                            />
                            <button
                              onClick={event => updateStatus(event, request.id, 'iptal', rejectDraft.note.trim())}
                              disabled={actionLoading === request.id || !rejectDraft.note.trim()}
                              style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontWeight: 700, cursor: rejectDraft.note.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: rejectDraft.note.trim() ? 1 : 0.6 }}
                            >
                              {actionLoading === request.id ? '…' : 'İptali Onayla'}
                            </button>
                            <button
                              onClick={event => { event.stopPropagation(); setRejectDraft(null) }}
                              style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              Vazgeç
                            </button>
                          </div>
                        ) : (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                          <button onClick={event => { event.stopPropagation(); setCompleteDraft({ id: request.id, supplierId: '' }) }} disabled={actionLoading === request.id} style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: projectId ? '5px 10px' : '5px 8px', fontSize: projectId ? 12 : 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {actionLoading === request.id ? '…' : 'Tamamlandı'}
                          </button>
                          <button onClick={event => { event.stopPropagation(); setRejectDraft({ id: request.id, note: '' }) }} disabled={actionLoading === request.id} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: projectId ? '5px 10px' : '5px 8px', fontSize: projectId ? 12 : 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            İptal Et
                          </button>
                        </div>
                        )
                      ) : canInvoice && isAwaitingInvoice(request) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                          <button onClick={event => { event.stopPropagation(); setFaturaRequest(request) }} style={{ background: '#EDE9FE', color: '#5B21B6', border: 'none', borderRadius: 6, padding: projectId ? '5px 10px' : '5px 8px', fontSize: projectId ? 12 : 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Fatura Oluştur
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-muted-light)' }}>—</span>
                      )}
                    </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '4px 14px 12px' }}>
          <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
        </div>
        </>
      )}

      {showNew && (
        <YeniTalepModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); fetchData(); onChanged?.() }}
          defaultProjectId={projectId}
        />
      )}
      {selected && (
        <TalepDetayModal
          request={selected}
          siteChiefView={siteChiefView}
          materialPlan={projectId ? materialPlan : (materialPlanByProject.get(selected.project_id) || EMPTY_MAP)}
          requestedTotals={projectId ? requestedTotals : (requestedTotalsByProject.get(selected.project_id) || EMPTY_MAP)}
          onClose={() => { setSelected(null); fetchData(); onChanged?.() }}
        />
      )}
      {faturaRequest && (
        <FaturaOlusturModal
          request={faturaRequest}
          onClose={() => setFaturaRequest(null)}
          onSaved={() => { fetchData(); onChanged?.() }}
        />
      )}
    </div>
  )
}
