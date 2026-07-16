import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import YeniTalepModal from '../../../components/satin-alma/YeniTalepModal'
import TalepDetayModal from '../../../components/satin-alma/TalepDetayModal'
import FaturaOlusturModal from '../../../components/satin-alma/FaturaOlusturModal'
import Pager from '../../../components/ui/Pager'
import { toNumber, materialKey, normalizeStatus, materialName, riskState, isAwaitingInvoice } from '../../../utils/satinAlma'

const STATUS = {
  bekliyor: { bg: '#FEF3C7', color: '#92400E', label: 'Bekliyor' },
  onaylandi: { bg: '#D1FAE5', color: '#065F46', label: 'Onaylandı' },
  red_edildi: { bg: '#FEE2E2', color: '#991B1B', label: 'Red Edildi' },
  satin_alindi: { bg: '#DBEAFE', color: '#1E40AF', label: 'Satın Alındı' },
  fatura_bekliyor: { bg: '#EDE9FE', color: '#5B21B6', label: 'Fatura Bekleniyor' },
  fatura_onay_bekliyor: { bg: '#EDE9FE', color: '#5B21B6', label: 'Fatura Onayında' },
  faturasi_kesildi: { bg: '#D1FAE5', color: '#065F46', label: 'Faturası Kesildi' },
  iptal: { bg: '#E5E7EB', color: '#374151', label: 'İptal Edildi' },
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'bekliyor', label: 'Bekliyor' },
  { value: 'onaylandi', label: 'Onaylandı' },
  { value: 'red_edildi', label: 'Red Edildi' },
  { value: 'satin_alindi', label: 'Satın Alındı' },
  { value: 'fatura_onay_bekliyor', label: 'Fatura Onayında' },
  { value: 'faturasi_kesildi', label: 'Faturası Kesildi' },
]

const PAGE_SIZE = 10
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 24

const TH = { height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 12px', lineHeight: `${HEADER_HEIGHT}px`, textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const TD = { height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 12px', fontSize: 12.5, color: 'var(--color-text-sub)', verticalAlign: 'middle' }

const fmtDate = (date) =>
  date ? new Date(date).toLocaleDateString('tr-TR') : '—'

function materialTitle(request) {
  return request.material_name || request.title || request.description || 'Satın alma talebi'
}

function requesterName(request) {
  return request.profiles?.full_name || request.requester_name || request.requested_by_name || request.created_by_name || '—'
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
  const text = `${request.title || ''} ${(request.purchase_request_items || []).map(item => item.name).join(' ')}`.toLocaleLowerCase('tr-TR')
  return /hizmet|işçilik|iscilik|kiralama|nakliye/.test(text) ? 'Hizmet' : 'Malzeme'
}

function StatusBadge({ status }) {
  const normalized = normalizeStatus(status)
  const badge = STATUS[normalized] || { bg: '#F3F4F6', color: '#374151', label: (normalized || '—').replace(/_/g, ' ') }
  return (
    <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap' }}>
      {badge.label}
    </span>
  )
}

function InvoiceStatusBadge({ status }) {
  const normalized = normalizeStatus(status)
  const info = {
    onaylandi: { bg: '#FEF3C7', color: '#92400E', label: 'Tedarikçi Bekleniyor' },
    satin_alindi: { bg: '#FEF3C7', color: '#92400E', label: 'Fatura Bekliyor' },
    fatura_bekliyor: { bg: '#EDE9FE', color: '#5B21B6', label: 'Fatura Sürecinde' },
    fatura_onay_bekliyor: { bg: '#EDE9FE', color: '#5B21B6', label: 'Fatura Onayında' },
    faturasi_kesildi: { bg: '#D1FAE5', color: '#065F46', label: 'Faturası Kesildi' },
    red_edildi: { bg: '#FEE2E2', color: '#991B1B', label: 'Red Edildi' },
  }[normalized] || { bg: '#F3F4F6', color: '#64748B', label: 'Fatura Yok' }

  return (
    <span style={{ background: info.bg, color: info.color, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap' }}>
      {info.label}
    </span>
  )
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

export default function ProjeTabTalepListesi({ projectId, filterDate, onChanged, onlyPending = false, procurement, refreshKey, siteChiefView = false }) {
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

  const canCreate = role !== 'muhasebe'
  const canInvoice = isAdmin || isMuhasebe
  // Onay/red yalnızca admin'e ait — "Onay Bekleyenler" sekmesi de aynı şekilde isAdmin'e
  // kilitli (ProjeTabSatinAlma.jsx), buradaki satır-içi butonlar önceden rol farkı
  // gözetmeden herkese görünüyordu (bkz. CLAUDE.md bilinen açık noktalar).
  const canApprove = isAdmin

  // refreshKey: üst bileşendeki Realtime aboneliği purchase_requests'te değişiklik
  // gördüğünde bump edilir — bu liste kendi ham sorgusunu koştuğu için (RPC'den bağımsız)
  // Realtime'a doğrudan bağlı değil, refreshKey değişimiyle dolaylı olarak tazelenir.
  useEffect(() => { if (projectId) fetchData() }, [projectId, filterDate, onlyPending, refreshKey])
  useEffect(() => { setPage(0) }, [statusFilter, onlyPending, projectId, refreshKey])

  // Üst bileşen (ProjeTabSatinAlma) procurement_items'i zaten tek bir RPC ile getirdiyse
  // burada aynı tabloyu ikinci kez sorgulamak yerine o veriden malzeme planını hesaplıyoruz.
  useEffect(() => {
    if (!procurement) return
    const plan = new Map()
    procurement.forEach(material => {
      const key = materialKey(materialName(material))
      if (!key) return
      plan.set(key, toNumber(material.quantity))
    })
    setMaterialPlan(plan)
  }, [procurement])

  async function fetchData() {
    setLoading(true)
    setErrorMessage('')
    let query = supabase
      .from('purchase_requests')
      .select('*, purchase_request_items(*)')
      .eq('project_id', projectId)
      .lte('created_at', (filterDate || new Date().toISOString().split('T')[0]) + 'T23:59:59')
      .order('created_at', { ascending: false })

    if (onlyPending) query = query.in('status', ['bekliyor', 'beklemede', 'talep_olusturuldu', 'talep_oluşturuldu'])

    const [requestsResult, materialResult] = await Promise.all([
      query,
      procurement ? Promise.resolve(null) : supabase.from('procurement_items').select('*').eq('project_id', projectId),
    ])

    if (requestsResult.error) {
      console.error('purchase_requests load error:', requestsResult.error)
      setErrorMessage('Satın alma talepleri yüklenemedi.')
      setRequests([])
    } else {
      const rows = requestsResult.data || []
      const requestedByIds = [...new Set(rows.map(row => row.requested_by).filter(Boolean))]

      if (requestedByIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', requestedByIds)

        if (profileError) {
          console.error('profiles load error:', profileError)
          setRequests(rows)
        } else {
          const profileById = new Map((profiles || []).map(profile => [profile.id, profile]))
          setRequests(rows.map(row => ({ ...row, profiles: profileById.get(row.requested_by) || null })))
        }
      } else {
        setRequests(rows)
      }

      // Malzeme Tedarik kartıyla tutarlı olması için yalnızca onay bekleyen taleplerin
      // miktarları toplanır — onaylanmış/reddedilmiş/tamamlanmış talepler risk hesabına girmez.
      const totals = new Map()
      rows.filter(row => normalizeStatus(row.status) === 'bekliyor').forEach(row => {
        ;(row.purchase_request_items || []).forEach(item => {
          const key = materialKey(item.name)
          if (!key) return
          totals.set(key, (totals.get(key) || 0) + toNumber(item.quantity))
        })
      })
      setRequestedTotals(totals)
    }

    if (!procurement) {
      const plan = new Map()
      ;(materialResult.data || []).forEach(material => {
        const key = materialKey(materialName(material))
        if (!key) return
        plan.set(key, toNumber(material.planned_quantity ?? material.quantity))
      })
      setMaterialPlan(plan)
    }
    setLoading(false)
  }

  async function updateStatus(event, id, status) {
    event.stopPropagation()
    setActionLoading(id)
    setErrorMessage('')
    const { error } = await supabase
      .from('purchase_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('project_id', projectId)

    if (error) {
      console.error('purchase_requests status update error:', error)
      setErrorMessage('Durum güncellenemedi.')
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
    if (onlyPending) return true
    if (statusFilter === 'all') return true
    return normalizeStatus(request.status) === statusFilter
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const emptyText = onlyPending
    ? 'Onay bekleyen satın alma talebi yok.'
    : 'Bu projeye ait satın alma talebi bulunmuyor.'

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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                {['TALEP NO', 'TALEP / MALZEME', 'TİP', 'OLUŞTURAN KİŞİ', 'RİSK DURUMU', 'DURUM', 'TARİH', 'İŞLEM / FATURA'].map(header => (
                  <th key={header} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(request => {
                const isPending = normalizeStatus(request.status) === 'bekliyor'
                const risk = riskState(request.purchase_request_items || [], materialPlan, requestedTotals, requestType(request).toLocaleLowerCase('tr-TR'))
                return (
                  <tr
                    key={request.id}
                    onClick={() => setSelected(request)}
                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                    onMouseEnter={event => { event.currentTarget.style.background = 'var(--color-bg)' }}
                    onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ ...TD, color: 'var(--color-primary)', fontWeight: 700 }}>{requestNo(request)}</td>
                    <td style={{ ...TD, fontWeight: 700, color: 'var(--color-text)', minWidth: 180 }}>{materialTitle(request)}</td>
                    <td style={TD}>
                      <span style={{ background: requestType(request) === 'Malzeme' ? '#EAF2FF' : '#E9FBEF', color: requestType(request) === 'Malzeme' ? 'var(--color-primary)' : 'var(--color-success)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                        {requestType(request)}
                      </span>
                    </td>
                    <td style={TD}>{requesterName(request)}</td>
                    <td style={TD}><RiskBadge state={risk} /></td>
                    <td style={TD}><StatusBadge status={request.status} /></td>
                    <td style={TD}>{fmtDate(request.request_date || request.created_at)}</td>
                    <td style={{ ...TD, minWidth: 150, whiteSpace: 'nowrap' }}>
                      {isPending && canApprove ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                          <button onClick={event => updateStatus(event, request.id, 'onaylandi')} disabled={actionLoading === request.id} style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {actionLoading === request.id ? '…' : 'Onayla'}
                          </button>
                          <button onClick={event => updateStatus(event, request.id, 'reddedildi')} disabled={actionLoading === request.id} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {actionLoading === request.id ? '…' : 'Reddet'}
                          </button>
                        </div>
                      ) : isPending ? (
                        <span style={{ fontSize: 12, color: 'var(--color-muted-light)' }}>—</span>
                      ) : canInvoice && isAwaitingInvoice(request) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                          <InvoiceStatusBadge status={request.status} />
                          <button onClick={event => { event.stopPropagation(); setFaturaRequest(request) }} style={{ background: '#EDE9FE', color: '#5B21B6', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Fatura Oluştur
                          </button>
                        </div>
                      ) : (
                        <InvoiceStatusBadge status={request.status} />
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
          materialPlan={materialPlan}
          requestedTotals={requestedTotals}
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
