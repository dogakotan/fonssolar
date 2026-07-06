import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import YeniTalepModal from '../../../components/satin-alma/YeniTalepModal'
import TalepDetayModal from '../../../components/satin-alma/TalepDetayModal'
import { toNumber, materialKey, normalizeStatus, materialName, riskState, groupByProjectId } from '../../../utils/satinAlma'

const STATUS = {
  bekliyor: { bg: '#FEF3C7', color: '#92400E', label: 'Bekliyor' },
  onaylandi: { bg: '#D1FAE5', color: '#065F46', label: 'Onaylandı' },
  red_edildi: { bg: '#FEE2E2', color: '#991B1B', label: 'Red Edildi' },
  faturada: { bg: '#EDE9FE', color: '#5B21B6', label: 'Fatura Bekleniyor' },
  faturasi_kesildi: { bg: '#D1FAE5', color: '#065F46', label: 'Faturası Kesildi' },
  tamamlandi: { bg: '#E5E7EB', color: '#374151', label: 'Tamamlandı' },
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'bekliyor', label: 'Bekliyor' },
  { value: 'onaylandi', label: 'Onaylandı' },
  { value: 'red_edildi', label: 'Red Edildi' },
  { value: 'faturada', label: 'Fatura Bekleniyor' },
  { value: 'faturasi_kesildi', label: 'Faturası Kesildi' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
]

const VISIBLE_ROWS = 7
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 24
const TABLE_MAX_HEIGHT = HEADER_HEIGHT + VISIBLE_ROWS * ROW_HEIGHT
const EMPTY_MAP = new Map()

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
    onaylandi: { bg: '#FEF3C7', color: '#92400E', label: 'Fatura Bekliyor' },
    faturada: { bg: '#EDE9FE', color: '#5B21B6', label: 'Fatura Sürecinde' },
    faturasi_kesildi: { bg: '#D1FAE5', color: '#065F46', label: 'Faturası Kesildi' },
    tamamlandi: { bg: '#E5E7EB', color: '#374151', label: 'Fatura Tamam' },
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

export default function TabSatinAlmaTalepListesi({ onChanged, onlyPending = false, procurement, projectId }) {
  const { role } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(onlyPending ? 'bekliyor' : 'all')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const canCreate = role !== 'muhasebe'

  useEffect(() => { fetchData() }, [onlyPending, projectId])

  async function fetchData() {
    setLoading(true)
    setErrorMessage('')
    let query = supabase
      .from('purchase_requests')
      .select('*, purchase_request_items(*), projects(name)')
      .order('created_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)
    if (onlyPending) query = query.in('status', ['bekliyor', 'beklemede', 'talep_olusturuldu', 'talep_oluşturuldu'])

    const { data, error } = await query

    if (error) {
      console.error('purchase_requests load error:', error)
      setErrorMessage('Satın alma talepleri yüklenemedi.')
      setRequests([])
      setLoading(false)
      return
    }

    const rows = data || []
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
    setLoading(false)
  }

  // Malzeme Tedarik kartıyla tutarlı olması için per-proje planlanan miktar (BOM) ve
  // onay bekleyen taleplerin per-proje toplamı — asla projeler arası düzleştirilmez,
  // çünkü aynı isimli malzemenin farklı projelerde alakasız planlanan miktarları olabilir.
  const materialPlanByProject = new Map()
  groupByProjectId(procurement || []).forEach((group, projectId) => {
    const plan = new Map()
    group.rows.forEach(material => {
      const key = materialKey(materialName(material))
      if (!key) return
      plan.set(key, toNumber(material.quantity))
    })
    materialPlanByProject.set(projectId, plan)
  })

  const requestedTotalsByProject = new Map()
  groupByProjectId(requests.filter(row => normalizeStatus(row.status) === 'bekliyor')).forEach((group, projectId) => {
    const totals = new Map()
    group.rows.forEach(row => {
      ;(row.purchase_request_items || []).forEach(item => {
        const key = materialKey(item.name)
        if (!key) return
        totals.set(key, (totals.get(key) || 0) + toNumber(item.quantity))
      })
    })
    requestedTotalsByProject.set(projectId, totals)
  })

  async function updateStatus(event, id, status) {
    event.stopPropagation()
    setActionLoading(id)
    setErrorMessage('')
    const { error } = await supabase
      .from('purchase_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

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
    if (onlyPending) return true
    if (statusFilter === 'all') return true
    return normalizeStatus(request.status) === statusFilter
  })

  const emptyText = onlyPending
    ? 'Onay bekleyen satın alma talebi yok.'
    : 'Hiç satın alma talebi bulunmuyor.'

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
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: TABLE_MAX_HEIGHT }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
            <thead>
              <tr>
                {['TALEP NO', 'PROJE', 'TALEP / MALZEME', 'TİP', 'OLUŞTURAN KİŞİ', 'RİSK DURUMU', 'DURUM', 'TARİH', 'İŞLEM / FATURA'].map(header => (
                  <th key={header} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(request => {
                const isPending = normalizeStatus(request.status) === 'bekliyor'
                const materialPlan = materialPlanByProject.get(request.project_id) || EMPTY_MAP
                const requestedTotals = requestedTotalsByProject.get(request.project_id) || EMPTY_MAP
                const risk = riskState(request.purchase_request_items || [], materialPlan, requestedTotals, requestType(request).toLocaleLowerCase('tr-TR'))
                return (
                  <tr
                    key={request.id}
                    onClick={() => setSelected(request)}
                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                    onMouseEnter={event => { event.currentTarget.style.background = 'var(--color-bg)' }}
                    onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ ...TD, color: 'var(--color-primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>{requestNo(request)}</td>
                    <td style={{ ...TD, color: 'var(--color-text-sub)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={request.projects?.name || ''}>{request.projects?.name || '—'}</td>
                    <td style={{ ...TD, fontWeight: 700, color: 'var(--color-text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={materialTitle(request)}>{materialTitle(request)}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      <span style={{ background: requestType(request) === 'Malzeme' ? '#EAF2FF' : '#E9FBEF', color: requestType(request) === 'Malzeme' ? 'var(--color-primary)' : 'var(--color-success)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                        {requestType(request)}
                      </span>
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{requesterName(request)}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><RiskBadge state={risk} /></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}><StatusBadge status={request.status} /></td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(request.request_date || request.created_at)}</td>
                    <td style={{ ...TD, minWidth: 128, whiteSpace: 'nowrap' }}>
                      {isPending ? (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap' }}>
                          <button onClick={event => updateStatus(event, request.id, 'onaylandi')} disabled={actionLoading === request.id} style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {actionLoading === request.id ? '…' : 'Onayla'}
                          </button>
                          <button onClick={event => updateStatus(event, request.id, 'reddedildi')} disabled={actionLoading === request.id} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {actionLoading === request.id ? '…' : 'Reddet'}
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
          materialPlan={materialPlanByProject.get(selected.project_id) || EMPTY_MAP}
          requestedTotals={requestedTotalsByProject.get(selected.project_id) || EMPTY_MAP}
          onClose={() => { setSelected(null); fetchData(); onChanged?.() }}
        />
      )}
    </div>
  )
}
