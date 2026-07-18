import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import YeniTalepModal from '../../../components/satin-alma/YeniTalepModal'
import TalepDetayModal from '../../../components/satin-alma/TalepDetayModal'
import FaturaOlusturModal from '../../../components/satin-alma/FaturaOlusturModal'
import Pager from '../../../components/ui/Pager'
import { toNumber, materialKey, normalizeStatus, materialName, riskState, groupByProjectId, isAwaitingInvoice } from '../../../utils/satinAlma'

const STATUS_FILTERS = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'bekliyor', label: 'Onay Bekleyen' },
  { value: 'onaylandi', label: 'Proje Yöneticisinde' },
  { value: 'fatura_sureci', label: 'Fatura Süreci' },
  { value: 'faturasi_kesildi', label: 'Tamamlandı' },
  { value: 'red_edildi', label: 'Reddedildi' },
  { value: 'iptal', label: 'İptal' },
]

const INVOICE_FLOW_STATUSES = new Set(['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor'])

const PAGE_SIZE = 10
const ROW_HEIGHT = 44
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

function requestNo(request) {
  if (request.request_no || request.code) return request.request_no || request.code
  const year = request.created_at ? new Date(request.created_at).getFullYear() : new Date().getFullYear()
  const suffix = String(request.id || '').replace(/-/g, '').slice(-3).toUpperCase() || '001'
  return `SAT-${year}-${suffix}`
}

function requestType(request) {
  if (request.category === 'malzeme') return 'Malzeme'
  if (request.category === 'hizmet') return 'Hizmet'
  const text = `${request.title || ''} ${(request.items || []).map(item => item.name).join(' ')}`.toLocaleLowerCase('tr-TR')
  return /hizmet|işçilik|iscilik|kiralama|nakliye/.test(text) ? 'Hizmet' : 'Malzeme'
}

const RISK_STATE_META = {
  riskli: { color: 'var(--color-danger)', label: 'Riskli' },
  listede_yok: { color: 'var(--color-warning)', label: 'Listede Yok' },
  uygun: { color: 'var(--color-success)', label: 'Uygun' },
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
export default function TabSatinAlmaTalepListesi({ onChanged, onlyPending = false, procurement, projectId, filterDate, refreshKey, siteChiefView = false }) {
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
  const [page, setPage] = useState(0)

  const canCreate = !isAdmin && role !== 'muhasebe'
  const canInvoice = isMuhasebe
  const canApprove = isAdmin

  useEffect(() => { fetchData() }, [projectId, filterDate, onlyPending, refreshKey])
  useEffect(() => { setPage(0) }, [statusFilter, onlyPending, projectId, refreshKey])

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

  async function updateStatus(event, id, status) {
    event.stopPropagation()
    setActionLoading(id)
    setErrorMessage('')
    let query = supabase
      .from('purchase_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (projectId) query = query.eq('project_id', projectId)
    const { error } = await query

    if (error) {
      console.error('purchase_requests status update error:', error)
      setErrorMessage('Durum güncellenemedi.')
    } else {
      await fetchData()
      onChanged?.()
    }
    setActionLoading(null)
  }

  function FlowBadge({ request }) {
    const normalized = normalizeStatus(request.status)
    const info = {
      onaylandi: { bg: '#DBEAFE', color: '#1E40AF', label: 'Proje yöneticisinde' },
      satin_alindi: { bg: '#FEF3C7', color: '#92400E', label: 'Fatura bekleniyor' },
      fatura_bekliyor: { bg: '#FEF3C7', color: '#92400E', label: 'Fatura bekleniyor' },
      fatura_onay_bekliyor: { bg: '#EDE9FE', color: '#5B21B6', label: 'Fatura onayında' },
      faturasi_kesildi: { bg: '#D1FAE5', color: '#065F46', label: 'Tamamlandı' },
      red_edildi: { bg: '#FEE2E2', color: '#991B1B', label: 'Reddedildi' },
      iptal: { bg: '#E5E7EB', color: '#374151', label: 'İptal' },
    }[normalized] || { bg: '#F3F4F6', color: '#64748B', label: 'Bekliyor' }

    return <span style={{ background: info.bg, color: info.color, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{info.label}</span>
  }

  const filtered = requests.filter(request => {
    // Şantiye şefi görünümünde sadece kendi oluşturduğu talepler listelenir — proje
    // içindeki diğer kişilerin (yönetici vb.) talepleri gösterilmez.
    if (siteChiefView && request.requested_by !== user?.id) return false
    if (onlyPending) return true
    if (statusFilter === 'all') return true
    const normalized = normalizeStatus(request.status)
    if (statusFilter === 'fatura_sureci') return INVOICE_FLOW_STATUSES.has(normalized)
    return normalized === statusFilter
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const emptyText = onlyPending
    ? 'Onay bekleyen satın alma talebi yok.'
    : projectId ? 'Bu projeye ait satın alma talebi bulunmuyor.' : 'Hiç satın alma talebi bulunmuyor.'

  const headers = projectId
    ? ['TALEP', 'OLUŞTURAN', 'UYGUNLUK', 'KATEGORİ', 'İŞLEM']
    : ['TALEP', 'PROJE', 'OLUŞTURAN', 'UYGUNLUK', 'KATEGORİ', 'İŞLEM']

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          {onlyPending ? 'Onay Bekleyenler' : 'Tüm Satın Alma Talepleri'}
        </h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 7 }}>
          {filtered.length} talep
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!onlyPending && (
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              style={{ border: '1px solid var(--color-border-md)', borderRadius: 7, padding: '5px 28px 5px 10px', fontSize: 12, color: 'var(--color-text-sub)', background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
            >
              {STATUS_FILTERS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
          {canCreate && !onlyPending && (
            <button
              onClick={() => setShowNew(true)}
              style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + Yeni Talep
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: projectId ? 760 : 860 }}>
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(request => {
                const isPending = normalizeStatus(request.status) === 'bekliyor'
                const rowMaterialPlan = projectId ? materialPlan : (materialPlanByProject.get(request.project_id) || EMPTY_MAP)
                const rowRequestedTotals = projectId ? requestedTotals : (requestedTotalsByProject.get(request.project_id) || EMPTY_MAP)
                const risk = riskState(request.items || [], rowMaterialPlan, rowRequestedTotals, requestType(request).toLocaleLowerCase('tr-TR'))
                return (
                  <tr
                    key={request.id}
                    onClick={() => setSelected(request)}
                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                    onMouseEnter={event => { event.currentTarget.style.background = 'var(--color-bg)' }}
                    onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ ...TD, minWidth: projectId ? 280 : 260 }}>
                      <div style={{ display: 'grid', gap: 5 }}>
                        <strong style={{ color: 'var(--color-text)', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={materialTitle(request)}>{materialTitle(request)}</strong>
                        <span style={{ color: 'var(--color-primary)', fontSize: 11, fontWeight: 800 }}>{requestNo(request)}</span>
                      </div>
                    </td>
                    {!projectId && (
                      <td style={{ ...TD, color: 'var(--color-text-sub)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={request.project_name || ''}>{request.project_name || '—'}</td>
                    )}
                    <td style={{ ...TD, minWidth: 150 }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <strong style={{ color: 'var(--color-text-sub)', fontSize: 12.5 }}>{requesterName(request)}</strong>
                        <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{fmtDate(request.request_date || request.created_at)}</span>
                      </div>
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><RiskBadge state={risk} /></td>
                    <td style={TD}>
                      <span style={{ color: requestType(request) === 'Malzeme' ? 'var(--color-primary)' : 'var(--color-success)', fontSize: 12, fontWeight: 800 }}>
                        {requestType(request)}
                      </span>
                    </td>
                    <td style={{ ...TD, minWidth: projectId ? 180 : 128, whiteSpace: 'nowrap' }}>
                      {isPending && canApprove ? (
                        <div style={{ display: 'flex', gap: projectId ? 6 : 5, flexWrap: 'nowrap' }}>
                          <button onClick={event => updateStatus(event, request.id, 'onaylandi')} disabled={actionLoading === request.id} style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: projectId ? '5px 10px' : '5px 8px', fontSize: projectId ? 12 : 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {actionLoading === request.id ? '…' : 'Onayla'}
                          </button>
                          <button onClick={event => updateStatus(event, request.id, 'reddedildi')} disabled={actionLoading === request.id} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: projectId ? '5px 10px' : '5px 8px', fontSize: projectId ? 12 : 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {actionLoading === request.id ? '…' : 'Reddet'}
                          </button>
                        </div>
                      ) : isPending ? (
                        <FlowBadge request={request} />
                      ) : canInvoice && isAwaitingInvoice(request) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                          <button onClick={event => { event.stopPropagation(); setFaturaRequest(request) }} style={{ background: '#EDE9FE', color: '#5B21B6', border: 'none', borderRadius: 6, padding: projectId ? '5px 10px' : '5px 8px', fontSize: projectId ? 12 : 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Fatura Oluştur
                          </button>
                        </div>
                      ) : (
                        <FlowBadge request={request} />
                      )}
                    </td>
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
