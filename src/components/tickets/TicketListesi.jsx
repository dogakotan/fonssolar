import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import YeniTicketModal from './YeniTicketModal'
import TicketDetayModal from './TicketDetayModal'
import DateNavigator from '../ui/DateNavigator'

const SEVERITY_ORDER = { 'yüksek': 3, 'orta': 2, 'düşük': 1 }

const SEVERITY = {
  'düşük':  { bg: '#F3F4F6', color: '#374151', label: 'Düşük' },
  'orta':   { bg: '#FEF3C7', color: '#92400E', label: 'Orta' },
  'yüksek': { bg: '#FEE2E2', color: '#991B1B', label: 'Yüksek' },
}
const STATUS = {
  'gönderildi':   { bg: '#DBEAFE', color: '#1D4ED8', label: 'Gönderildi' },
  'açık':         { bg: '#DBEAFE', color: '#1D4ED8', label: 'Gönderildi' },
  'işlemde':      { bg: '#E5E7EB', color: '#6B7280', label: 'İşlemde' },
  'kapatıldı':    { bg: '#D1FAE5', color: '#065F46', label: 'Kapatıldı' },
  'iptal_edildi': { bg: '#F3F4F6', color: '#9CA3AF', label: 'İptal Edildi' },
}
const CATEGORY = {
  'genel':    { bg: '#F3F4F6', color: '#6B7280' },
  'elektrik': { bg: '#EFF6FF', color: '#185FA5' },
  'mekanik':  { bg: '#F5F3FF', color: '#7C3AED' },
}

const TH = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'

const STATUS_TABS = [
  { key: 'all',          label: 'Tümü' },
  { key: 'gönderildi',   label: 'Gönderildi' },
  { key: 'işlemde',      label: 'İşlemde' },
  { key: 'kapatıldı',    label: 'Kapatıldı' },
  { key: 'iptal_edildi', label: 'İptal Edildi' },
]

/* ── Hızlı aksiyon modalı (satır butonu) ── */
function QuickActionModal({ ticket, action, onClose, onDone }) {
  const { user, isAdmin } = useAuth()
  const [saving, setSaving] = useState(false)

  const QUESTIONS = {
    process: 'Ticket işleme alınacak. Onaylıyor musunuz?',
    close:   'İşlemi kapatmak istiyor musunuz?',
    cancel:  'İşlemi iptal etmek istiyor musunuz?',
  }
  const MESSAGES = {
    process: '"Ticketınız işleme alındı." bildirimi ticket sahibine gönderilecek.',
    close:   '"Ticketınız kapatıldı." bildirimi ticket sahibine gönderilecek.',
    cancel:  '"Ticketınız iptal edildi." bildirimi ticket sahibine gönderilecek.',
  }
  const DEFAULTS = {
    process: 'Ticketınız işleme alındı.',
    close:   'Ticketınız kapatıldı.',
    cancel:  'Ticketınız iptal edildi.',
  }

  async function handleSave() {
    setSaving(true)
    const statusMap = { process: 'işlemde', close: 'kapatıldı', cancel: 'iptal_edildi' }
    const newStatus = statusMap[action]

    await supabase.from('tickets').update({
      status:     newStatus,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
      ...(newStatus === 'kapatıldı' ? { resolved_at: new Date().toISOString() } : {}),
    }).eq('id', ticket.id)

    await supabase.from('ticket_comments').insert({
      ticket_id:       ticket.id,
      user_id:         user.id,
      content:         DEFAULTS[action],
      is_notification: true,
      sent_by_admin:   isAdmin,
    })

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

export default function TicketListesi({ onNewTicket, refreshKey, projectId: propProjectId, filterStatus, filterSeverity, filterDate: filterDateProp }) {
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

  useEffect(() => {
    if (filterDateProp) setDateFilter(filterDateProp)
  }, [filterDateProp])

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
    let q = supabase
      .from('tickets')
      .select('*, creator:profiles!tickets_created_by_fkey(full_name)')
      .order('created_at', { ascending })

    // Status filtresi
    if (filterStatus && filterStatus !== 'all') {
      q = q.eq('status', filterStatus)
    } else if (statusTab !== 'all') {
      if (statusTab === 'gönderildi') q = q.in('status', ['gönderildi', 'açık'])
      else q = q.eq('status', statusTab)
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
      q = q.gte('created_at', d.toISOString()).lte('created_at', dEnd.toISOString())
    }

    // Rol tabanlı erişim
    if (isAdmin) {
      if (propProjectId) q = q.eq('project_id', propProjectId)
    } else if (role === 'elektrik_sefi') {
      q = q.in('category', ['elektrik', 'genel'])
    } else if (role === 'mekanik_sef') {
      q = q.in('category', ['mekanik', 'genel'])
    } else {
      if (user?.id) q = q.eq('created_by', user.id)
    }

    const { data, error } = await q
    if (error) console.error('TicketListesi fetch error:', error)

    let result = data || []
    // Severity sort: client-side
    if (sortMode === 'sev_desc') result = result.sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0))
    if (sortMode === 'sev_asc')  result = result.sort((a, b) => (SEVERITY_ORDER[a.severity] || 0) - (SEVERITY_ORDER[b.severity] || 0))

    setTickets(result)
    setLoading(false)
  }

  const tabBtn = (active) => ({
    background: 'none', border: 'none', padding: '9px 18px',
    fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#185FA5' : '#6B7280', cursor: 'pointer',
    fontFamily: 'inherit',
    borderBottom: active ? '2px solid #185FA5' : '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s',
  })

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12 }}>

      {/* Status tabs + toolbar */}
      <div className="tl-tabs-bar">
        {STATUS_TABS.map(t => (
          <button key={t.key} style={tabBtn(statusTab === t.key)} onClick={() => setStatusTab(t.key)}>
            {t.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>

          {/* Severity sub-butonlar — sadece severity sort aktifse */}
          {(sortMode === 'sev_desc' || sortMode === 'sev_asc') && (
            <div className="tl-toolbar-sev" style={{ display: 'flex', gap: 4 }}>
              {[{ key: 'all', label: 'Tümü' }, { key: 'düşük', label: 'Düşük' }, { key: 'orta', label: 'Orta' }, { key: 'yüksek', label: 'Yüksek' }].map(s => (
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
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
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
          <div style={{ position: 'relative' }}>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  {['#', 'AÇIKLAMA', 'CİNS', 'ACİLİYET', 'DURUM', 'LOKASYON', 'TARİH', 'İŞLEM'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t, idx) => {
                  const sv = SEVERITY[t.severity] || SEVERITY['orta']
                  const st = STATUS[t.status]     || STATUS['gönderildi']
                  const ca = CATEGORY[t.category] || CATEGORY['genel']

                  const isActive   = t.status === 'gönderildi' || t.status === 'açık' || t.status === 'işlemde'
                  const canProcess = isAdmin && (t.status === 'gönderildi' || t.status === 'açık')
                  const canClose   = isAdmin && isActive
                  const canCancel  = isAdmin
                    ? isActive
                    : (t.created_by === user?.id && isActive)

                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t)}
                      style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer', background: t.status === 'işlemde' ? '#F3F4F6' : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
                      onMouseLeave={e => e.currentTarget.style.background = t.status === 'işlemde' ? '#F3F4F6' : 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>#{idx + 1}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#111827' }}>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
                          {t.description || t.title}
                        </span>
                        <span style={{ fontSize: 11, color: '#9CA3AF', display: 'block', marginTop: 2 }}>
                          {t.creator?.full_name || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: ca.bg, color: ca.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {t.category?.charAt(0).toUpperCase() + t.category?.slice(1)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: sv.bg, color: sv.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {sv.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {t.location || <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>{fmtDate(t.created_at)}</td>

                      <td style={{ padding: '10px 16px' }} onClick={e => e.stopPropagation()}>
                        {(canProcess || canClose || canCancel) ? (
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
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
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
              const st = STATUS[t.status]     || STATUS['gönderildi']
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
                  <div className="tl-card-foot">
                    <span style={{ background: ca.bg, color: ca.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                      {t.category?.charAt(0).toUpperCase() + t.category?.slice(1)}
                    </span>
                    <span style={{ background: sv.bg, color: sv.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                      {sv.label}
                    </span>
                    <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                      {st.label}
                    </span>
                    <span className="tl-card-date">{fmtDate(t.created_at)}</span>
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
