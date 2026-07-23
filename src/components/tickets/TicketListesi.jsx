import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import YeniTicketModal from './YeniTicketModal'
import TicketDetayModal from './TicketDetayModal'
import DateNavigator from '../ui/DateNavigator'
import ApprovalStepsHorizontal from '../ui/ApprovalStepsHorizontal'
import { SEVERITY_META as SEVERITY, SEVERITY_ORDER, SEVERITY_OPTIONS } from '../../utils/ticketSeverity'
import { CATEGORY_META as CATEGORY } from '../../utils/ticketStatus'

const TH = { height: 24, boxSizing: 'border-box', padding: '0 12px', lineHeight: '24px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const TD = { height: 64, boxSizing: 'border-box', padding: '0 12px', fontSize: 12.5, color: 'var(--color-text-sub)', verticalAlign: 'middle' }
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'

function buildTicketSteps(status) {
  const isCancelled = status === 'iptal_edildi'
  const isProcessing = status === 'işlemde'
  const isClosed = status === 'kapatıldı'
  return [
    { key: 'gonderildi', label: 'Gönderildi', done: true },
    { key: 'islemde', label: isCancelled ? 'İptal Edildi' : 'İşlemde', done: !isCancelled && (isProcessing || isClosed), active: isProcessing, rejected: isCancelled },
    { key: 'kapatildi', label: 'Kapatıldı', done: isClosed },
  ]
}

function actionOwnerText(ticket) {
  const name = ticket.updater?.full_name
  if (!name) return null
  if (ticket.status === 'işlemde') return `${name} tarafından işleme alındı`
  if (ticket.status === 'kapatıldı') return `${name} tarafından kapatıldı`
  if (ticket.status === 'iptal_edildi') return `${name} tarafından iptal edildi`
  return null
}

async function withUpdaterProfiles(tickets = []) {
  const updaterIds = [...new Set(tickets.map(ticket => ticket.updated_by).filter(Boolean))]
  if (updaterIds.length === 0) return tickets

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', updaterIds)
  const profileById = new Map((profiles || []).map(profile => [profile.id, profile]))
  return tickets.map(ticket => ({ ...ticket, updater: profileById.get(ticket.updated_by) || null }))
}

/* ── Hızlı aksiyon modalı (satır butonu) ── */
function QuickActionModal({ ticket, action, onClose, onDone }) {
  const { user, role } = useAuth()
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  const QUESTIONS = {
    process: 'Ticket işleme alınacak. Onaylıyor musunuz?',
    close:   'İşlemi kapatmak istiyor musunuz?',
    cancel:  'İşlemi iptal etmek istiyor musunuz?',
    delete:  'Bu ticket tamamen silinecek. Onaylıyor musunuz?',
  }
  const MESSAGES = {
    process: '"Ticketınız işleme alındı." bildirimi ticket sahibine gönderilecek.',
    close:   '"Ticketınız kapatıldı." bildirimi ticket sahibine gönderilecek.',
    cancel:  '"Ticketınız iptal edildi." bildirimi ticket sahibine gönderilecek.',
    delete:  'Ticket yönetici ve proje yöneticisi ekranlarından da tamamen kaldırılacak.',
  }

  async function handleSave() {
    setSaving(true)
    setActionError('')
    if (action === 'delete') {
      const { error } = await supabase.rpc('delete_own_open_ticket', { p_ticket_id: ticket.id })
      if (error) {
        setActionError(error.message || 'Ticket silinemedi. Lütfen tekrar deneyin.')
        setSaving(false)
        return
      }
      setSaving(false)
      onDone()
      return
    }

    const statusMap = { process: 'işlemde', close: 'kapatıldı', cancel: 'iptal_edildi' }
    const newStatus = statusMap[action]

    const { error } = role === 'proje_yoneticisi'
      ? await supabase.rpc('project_manager_update_ticket_status', {
          p_ticket_id: ticket.id,
          p_new_status: newStatus,
        })
      : await supabase.from('tickets').update({
          status:     newStatus,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }).eq('id', ticket.id)

    if (error) {
      setActionError(error.message || 'İşlem kaydedilemedi. Lütfen tekrar deneyin.')
      setSaving(false)
      return
    }

    setSaving(false)
    onDone()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380,
          boxShadow: '0 20px 60px rgba(0,0,0,0.22)', padding: '28px 32px', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: '#111827' }}>
          {QUESTIONS[action]}
        </h3>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 24px', lineHeight: 1.5 }}>
          {MESSAGES[action]}
        </p>
        {actionError && (
          <p style={{ fontSize: 12, color: '#DC2626', margin: '0 0 14px', lineHeight: 1.45 }}>
            {actionError}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, background: action === 'cancel' ? '#DC2626' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? '…' : 'Onayla'}
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TicketListesi({ onNewTicket, refreshKey, projectId: propProjectId, filterStatus, filterSeverity, filterDate: filterDateProp, openTicketId, onOpenedTicket }) {
  const { user, isAdmin, role, projectId: authProjectId } = useAuth()
  const [tickets, setTickets]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [statusTab, setStatusTab]           = useState('all')
  const [sortMode, setSortMode]             = useState('date_desc')    // date_desc | date_asc | sev_desc | sev_asc
  const [severityFilter, setSeverityFilter] = useState('all')          // sub-filter when severity sort active
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [dateFilter, setDateFilter]         = useState(null)
  const [showCal, setShowCal]               = useState(false)
  const [calPos, setCalPos]                 = useState({ top: 0, right: 0 })
  const calRef    = useRef(null)
  const calBtnRef = useRef(null)
  const [showNew, setShowNew]               = useState(false)
  const [selected, setSelected]             = useState(null)
  const [quickAction, setQuickAction]       = useState(null)
  const isProjectManager = role === 'proje_yoneticisi'

  useEffect(() => {
    if (filterDateProp) setDateFilter(filterDateProp)
  }, [filterDateProp])

  // Dışarıdan (örn. Günlük Rapor'daki "Ticket açıldı" rozeti) belirli bir
  // ticket'a doğrudan gitme — mevcut filtrelerden bağımsız, tek satırı çekip açar.
  useEffect(() => {
    if (!openTicketId) return
    let alive = true
    supabase
      .from('tickets')
      .select('*, creator:profiles!tickets_created_by_fkey(full_name)')
      .eq('id', openTicketId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!alive) return
        if (data) {
          const [enriched] = await withUpdaterProfiles([data])
          if (alive) setSelected(enriched)
        }
        onOpenedTicket?.()
      })
    return () => { alive = false }
  }, [openTicketId, onOpenedTicket])

  // Listeyi belirleyen tüm değerler açıkça dependency'de; fetchTickets'in render-başına
  // değişen referansını eklemek gereksiz istek döngüsü yaratır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTickets() }, [statusTab, sortMode, severityFilter, categoryFilter, dateFilter, refreshKey, propProjectId, filterStatus, filterSeverity, isAdmin, role, authProjectId, user?.id])

  useEffect(() => {
    function handler(e) {
      if (calRef.current && !calRef.current.contains(e.target) && !calBtnRef.current?.contains(e.target))
        setShowCal(false)
    }
    if (showCal) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCal])

  function openCal() {
    if (calBtnRef.current) {
      const r = calBtnRef.current.getBoundingClientRect()
      setCalPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setShowCal(v => !v)
  }

  async function fetchTickets() {
    setLoading(true)
    const ascending = sortMode === 'date_asc'
    const dateColumn = statusTab === 'sonuclandi' ? 'resolved_at' : 'created_at'
    let q = supabase
      .from('tickets')
      .select('*, creator:profiles!tickets_created_by_fkey(full_name)')
      .order(dateColumn, { ascending, nullsFirst: false })

    // Status filtresi
    if (filterStatus && filterStatus !== 'all') {
      q = q.eq('status', filterStatus)
    } else if (['acik', 'islemde', 'sonuclandi'].includes(statusTab)) {
      q = q.eq('workflow_stage', statusTab)
    }

    // Severity sub-filtre (severity sort aktifken seçilebilir)
    if (filterSeverity && filterSeverity !== 'all') q = q.eq('severity', filterSeverity)
    else if (severityFilter !== 'all') q = q.eq('severity', severityFilter)

    // Category filtresi
    if (categoryFilter !== 'all') q = q.eq('category', categoryFilter)

    // Tarih filtresi
    if (dateFilter) {
      const d = new Date(dateFilter); d.setHours(0,0,0,0)
      const dEnd = new Date(dateFilter); dEnd.setHours(23,59,59,999)
      q = q.gte(dateColumn, d.toISOString()).lte(dateColumn, dEnd.toISOString())
    }

    // Rol tabanlı erişim
    if (isAdmin) {
      if (propProjectId) q = q.eq('project_id', propProjectId)
    } else if (role === 'elektrik_sefi') {
      q = q.in('category', ['elektrik', 'genel'])
    } else if (role === 'mekanik_sef') {
      q = q.in('category', ['mekanik', 'genel'])
    } else if (role === 'santiye_sefi') {
      if (authProjectId) q = q.eq('project_id', authProjectId)
    } else if (role === 'proje_yoneticisi') {
      // Çoklu projeye erişebiliyor, ProjeDetay'ın o an açık olan projesine göre süzülür
      // (admin dalıyla aynı desen) — sabit authProjectId değil propProjectId kullanılır.
      if (propProjectId) q = q.eq('project_id', propProjectId)
    } else {
      if (user?.id) q = q.eq('created_by', user.id)
    }

    const { data, error } = await q
    if (error) console.error('TicketListesi fetch error:', error)

    let result = await withUpdaterProfiles(data || [])
    // Severity sort: client-side
    if (sortMode === 'sev_desc') result = result.sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0))
    if (sortMode === 'sev_asc')  result = result.sort((a, b) => (SEVERITY_ORDER[a.severity] || 0) - (SEVERITY_ORDER[b.severity] || 0))

    setTickets(result)
    setLoading(false)
  }

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>

      {/* Satın alma tablosuyla aynı başlık + durum filtresi */}
      <div className="tl-tabs-bar" style={{ padding: '9px 14px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Tüm Ticketlar</h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 7 }}>
          {tickets.length} ticket
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>

          <select
            value={statusTab}
            onChange={event => setStatusTab(event.target.value)}
            style={{ border: '1px solid var(--color-border-md)', borderRadius: 7, padding: '5px 28px 5px 10px', fontSize: 12, color: 'var(--color-text-sub)', background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
          >
            <option value="all">Tüm Durumlar</option>
            <option value="acik">Açık</option>
            <option value="islemde">İşlemde</option>
            <option value="sonuclandi">Sonuçlandı</option>
          </select>

          {/* Severity sub-butonlar — sadece severity sort aktifse */}
          {false && (sortMode === 'sev_desc' || sortMode === 'sev_asc') && (
            <div className="tl-toolbar-sev" style={{ display: 'flex', gap: 4 }}>
              {[{ key: 'all', label: 'Tümü' }, ...SEVERITY_OPTIONS.map(o => ({ key: o.value, label: o.label }))].map(s => (
                <button
                  key={s.key}
                  onClick={() => setSeverityFilter(s.key)}
                  style={{
                    border: `1px solid ${severityFilter === s.key ? '#185FA5' : '#E5E7EB'}`,
                    borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: severityFilter === s.key ? 600 : 400,
                    fontFamily: 'inherit', cursor: 'pointer',
                    background: severityFilter === s.key ? '#EFF6FF' : '#fff',
                    color: severityFilter === s.key ? '#185FA5' : '#6B7280',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Tarih Seç — sadece ikon */}
          <div style={{ position: 'relative', display: 'none', alignItems: 'center' }}>
            <label style={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34,
              border: `1px solid ${dateFilter ? '#185FA5' : '#E5E7EB'}`,
              borderRadius: 8,
              background: dateFilter ? '#EFF6FF' : '#fff',
              color: dateFilter ? '#185FA5' : '#6B7280',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', top: 0, left: 0 }}
              />
            </label>
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                style={{ position: 'absolute', right: -8, top: -8, background: '#185FA5', border: 'none', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 11, lineHeight: 1, padding: 0 }}
              >×</button>
            )}
          </div>

          {/* Filtrele butonu */}
          <div style={{ position: 'relative', display: 'none' }}>
            {showFilterMenu && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowFilterMenu(false)} />
            )}
            <button
              onClick={() => setShowFilterMenu(v => !v)}
              style={{
                border: `1px solid ${sortMode !== 'date_desc' || categoryFilter !== 'all' ? '#185FA5' : '#E5E7EB'}`,
                borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500,
                fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                background: sortMode !== 'date_desc' || categoryFilter !== 'all' ? '#EFF6FF' : '#fff',
                color: sortMode !== 'date_desc' || categoryFilter !== 'all' ? '#185FA5' : '#374151',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              Filtrele
              {(sortMode !== 'date_desc' || categoryFilter !== 'all') && (
                <span style={{ background: '#185FA5', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                  {(sortMode !== 'date_desc' ? 1 : 0) + (categoryFilter !== 'all' ? 1 : 0)}
                </span>
              )}
            </button>

            {showFilterMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '16px 18px', minWidth: 240,
              }}>
                {/* Sıralama */}
                <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Sıralama</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {[
                    { key: 'date_desc', label: 'Yeniden Eskiye' },
                    { key: 'date_asc',  label: 'Eskiden Yeniye' },
                    { key: 'sev_desc',  label: 'Aciliyet: Yüksek → Düşük' },
                    { key: 'sev_asc',   label: 'Aciliyet: Düşük → Yüksek' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setSortMode(opt.key); if (!opt.key.startsWith('sev')) setSeverityFilter('all') }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, border: 'none',
                        padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 13, fontWeight: sortMode === opt.key ? 600 : 400,
                        color: sortMode === opt.key ? '#185FA5' : '#374151',
                        background: sortMode === opt.key ? '#EFF6FF' : 'transparent',
                        textAlign: 'left', width: '100%',
                      }}
                    >
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${sortMode === opt.key ? '#185FA5' : '#D1D5DB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {sortMode === opt.key && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#185FA5', display: 'block' }} />}
                      </span>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Cins filtresi */}
                <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px', borderTop: '1px solid #F3F4F6', paddingTop: 12 }}>Cins</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[{ key: 'all', label: 'Tümü' }, { key: 'genel', label: 'Genel' }, { key: 'elektrik', label: 'Elektrik' }, { key: 'mekanik', label: 'Mekanik' }].map(c => (
                    <button
                      key={c.key}
                      onClick={() => setCategoryFilter(c.key)}
                      style={{
                        border: `1px solid ${categoryFilter === c.key ? '#185FA5' : '#E5E7EB'}`,
                        borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: categoryFilter === c.key ? 600 : 400,
                        fontFamily: 'inherit', cursor: 'pointer',
                        background: categoryFilter === c.key ? '#EFF6FF' : '#fff',
                        color: categoryFilter === c.key ? '#185FA5' : '#6B7280',
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Sıfırla */}
                {(sortMode !== 'date_desc' || categoryFilter !== 'all') && (
                  <button
                    onClick={() => { setSortMode('date_desc'); setCategoryFilter('all'); setSeverityFilter('all'); setShowFilterMenu(false) }}
                    style={{ marginTop: 14, width: '100%', padding: '7px', border: '1px solid #E5E7EB', borderRadius: 7, background: '#F9FAFB', color: '#6B7280', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Filtreleri Sıfırla
                  </button>
                )}
              </div>
            )}
          </div>

          {!isAdmin && (
            <button
              onClick={() => setShowNew(true)}
              style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + Yeni Ticket
            </button>
          )}
        </div>
      </div>

      {/* Tablo */}
      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Yükleniyor…</div>
      )}

      {!loading && tickets.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
          Bu kriterde ticket bulunamadı.
        </div>
      )}

      {!loading && tickets.length > 0 && (
        <>
          {/* Desktop tablo */}
          <div className="desk-only" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr>
                  {['TICKET', 'OLUŞTURAN', 'CİNS', 'ACİLİYET', 'İŞLEM DURUMU', 'İŞLEM'].map(h => (
                    <th key={h} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t, idx) => {
                  const sv = SEVERITY[t.severity] || SEVERITY['orta']
                  const ca = CATEGORY[t.category] || CATEGORY['genel']

                  const isActive   = t.status === 'gönderildi' || t.status === 'açık' || t.status === 'işlemde'
                  const canManage  = isAdmin || isProjectManager
                  const canProcess = canManage && (t.status === 'gönderildi' || t.status === 'açık')
                  const canClose   = canManage && t.status === 'işlemde'
                  const canCancel  = canManage
                    ? isActive
                    : false
                  const canDelete  = !canManage && t.created_by === user?.id && (t.status === 'gönderildi' || t.status === 'açık')
                  const ownerText = actionOwnerText(t)

                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t)}
                      style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ ...TD, minWidth: 280 }}>
                        <div style={{ display: 'grid', gap: 5 }}>
                          <strong style={{ color: 'var(--color-text)', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description || t.title}>
                            {t.description || t.title}
                          </strong>
                          <span style={{ color: 'var(--color-primary)', fontSize: 11, fontWeight: 800 }}>TKT-{String(t.id || '').replaceAll('-', '').slice(-3).toUpperCase() || String(idx + 1).padStart(3, '0')}</span>
                        </div>
                      </td>
                      <td style={{ ...TD, minWidth: 160 }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <strong style={{ color: 'var(--color-text-sub)', fontSize: 12.5 }}>{t.creator?.full_name || '—'}</strong>
                          <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>{fmtDate(t.created_at)}</span>
                        </div>
                      </td>
                      <td style={TD}>
                        <span style={{ color: ca.color, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {t.category?.charAt(0).toUpperCase() + t.category?.slice(1)}
                        </span>
                      </td>
                      <td style={TD}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: sv.color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: sv.color }} />
                          {sv.label}
                        </span>
                      </td>
                      <td style={{ ...TD, minWidth: 330 }}>
                        <ApprovalStepsHorizontal steps={buildTicketSteps(t.status)} />
                      </td>
                      <td style={{ ...TD, minWidth: 150 }} onClick={e => e.stopPropagation()}>
                        {(canProcess || canClose || canCancel || canDelete) ? (
                          <div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                              {canProcess && (
                              <button
                                onClick={() => setQuickAction({ ticket: t, type: 'process' })}
                                style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500, color: '#185FA5', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                              >
                                İşleme Al
                              </button>
                              )}
                              {canClose && (
                              <button
                                onClick={() => setQuickAction({ ticket: t, type: 'close' })}
                                style={{ background: '#F9FAFB', border: '1px solid #D1D5DB', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                              >
                                Kapat
                              </button>
                              )}
                              {canCancel && (
                              <button
                                onClick={() => setQuickAction({ ticket: t, type: 'cancel' })}
                                style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500, color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                              >
                                İptal
                              </button>
                              )}
                              {canDelete && (
                              <button
                                onClick={() => setQuickAction({ ticket: t, type: 'delete' })}
                                style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500, color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                              >
                                Ticketı Sil
                              </button>
                              )}
                            </div>
                            {ownerText && <span style={{ display: 'block', marginTop: 5, fontSize: 10, color: '#6B7280', whiteSpace: 'nowrap' }}>{ownerText}</span>}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: ownerText ? '#6B7280' : '#D1D5DB', whiteSpace: 'nowrap' }}>{ownerText || '—'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobil kart listesi */}
          <div className="mob-only">
            {tickets.map((t, idx) => {
              const sv = SEVERITY[t.severity] || SEVERITY['orta']
              const ca = CATEGORY[t.category] || CATEGORY['genel']
              return (
                <div key={t.id} className="tl-card" onClick={() => setSelected(t)}>
                  <div className="tl-card-head">
                    <span className="tl-card-title">{t.description || t.title}</span>
                    <span className="tl-card-num">#{idx + 1}</span>
                  </div>
                  {t.creator?.full_name && (
                    <div className="tl-card-sub">{t.creator.full_name}</div>
                  )}
                  {actionOwnerText(t) && (
                    <div className="tl-card-sub">{actionOwnerText(t)}</div>
                  )}
                  <div className="tl-card-foot">
                    <span style={{ background: ca.bg, color: ca.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                      {t.category?.charAt(0).toUpperCase() + t.category?.slice(1)}
                    </span>
                    <span style={{ background: sv.bg, color: sv.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                      {sv.label}
                    </span>
                    <div style={{ flex: '1 1 100%', width: '100%' }}>
                      <ApprovalStepsHorizontal steps={buildTicketSteps(t.status)} />
                    </div>
                    <span className="tl-card-date">
                      Oluşturulma: {fmtDate(t.created_at)}
                    </span>
                    {statusTab === 'sonuclandi' && (
                      <span className="tl-card-date">
                        {t.status === 'iptal_edildi' ? 'İptal: ' : 'Kapanış: '}
                        {fmtDate(t.status === 'iptal_edildi' ? t.cancelled_at : t.closed_at)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showNew && (
        <YeniTicketModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); fetchTickets(); onNewTicket?.() }}
        />
      )}
      {selected && (
        <TicketDetayModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { setSelected(null); fetchTickets(); onNewTicket?.() }}
        />
      )}
      {quickAction && (
        <QuickActionModal
          ticket={quickAction.ticket}
          action={quickAction.type}
          onClose={() => setQuickAction(null)}
          onDone={() => { setQuickAction(null); fetchTickets(); onNewTicket?.() }}
        />
      )}
    </div>
  )
}
