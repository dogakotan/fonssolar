import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import YeniTicketModal from './YeniTicketModal'
import TicketDetayModal from './TicketDetayModal'
import SiteChiefTicketDetayModal from './SiteChiefTicketDetayModal'
import { SEVERITY_META as SEVERITY } from '../../utils/ticketSeverity'
import { CATEGORY_META as CATEGORY } from '../../utils/ticketStatus'
import { fetchProfileNames } from '../../utils/profileNames'
import { useUrlSyncedSelection } from '../../hooks/useUrlSyncedSelection'
import { useHighlightRow } from '../../hooks/useHighlightRow'
import { useToast } from '../../hooks/useToast'
import Toast from '../ui/Toast'

const TH = { height: 24, boxSizing: 'border-box', padding: '0 12px', lineHeight: '24px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const TD = { height: 64, boxSizing: 'border-box', padding: '0 12px', fontSize: 12.5, color: 'var(--color-text-sub)', verticalAlign: 'middle' }
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'

// İşlem durumu — Satın Alma talep listesindeki ProcessStatusBadge (tek nokta +
// kalın metin rozeti, UYGUNLUK/ACİLİYET kolonlarıyla aynı görsel dil) ile aynı
// desen — eskiden 3 adımlı yatay bir onay-süreci göstergesiydi (ApprovalStepsHorizontal).
// Etiketler utils/ticketStatus.js'teki STATUS_META (Bildirimler/TicketDetayModal'ın
// kullandığı kanonik kaynak) ve aşağıdaki Durum filtresi dropdown'uyla ("Açık")
// birebir aynı olmalı — burada ayrı bir kopya olarak "Gönderildi" tutulması
// Bildirimler'in aynı ticket'ı "Açık" göstermesiyle çelişen bir tutarsızlığa
// yol açıyordu (2026-07-31'de bulunan bug).
const TICKET_STATUS_META = {
  gönderildi:   { color: 'var(--color-primary)', label: 'Açık' },
  açık:         { color: 'var(--color-primary)', label: 'Açık' },
  işlemde:      { color: 'var(--color-warning)', label: 'İşlemde' },
  kapatıldı:    { color: 'var(--color-success)', label: 'Kapatıldı' },
  iptal_edildi: { color: 'var(--color-danger)',  label: 'İptal Edildi' },
}

function TicketStatusBadge({ status }) {
  const meta = TICKET_STATUS_META[status] || { color: 'var(--color-muted)', label: status || '—' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: meta.color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
      {meta.label}
    </span>
  )
}

function actionOwnerText(ticket) {
  const name = ticket.updater?.full_name
  if (!name) return null
  if (ticket.status === 'işlemde') return `${name} tarafından işleme alındı`
  if (ticket.status === 'kapatıldı') return `${name} tarafından kapatıldı`
  if (ticket.status === 'iptal_edildi') return `${name} tarafından iptal edildi`
  return null
}

async function withProfileNames(tickets = []) {
  const ids = tickets.flatMap(ticket => [ticket.created_by, ticket.updated_by])
  const byId = await fetchProfileNames(ids)
  return tickets.map(ticket => ({
    ...ticket,
    creator: byId.get(ticket.created_by) || null,
    updater: byId.get(ticket.updated_by) || null,
  }))
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

export default function TicketListesi({ onNewTicket, refreshKey, projectId: propProjectId, filterStatus, filterSeverity, filterDate: filterDateProp, openTicketId, onOpenedTicket, onSelectedTicketChange }) {
  const { user, isAdmin, role, projectId: authProjectId } = useAuth()
  const [tickets, setTickets]               = useState([])
  const [loading, setLoading]               = useState(true)
  const [statusTab, setStatusTab]           = useState('all')
  const [dateFilter, setDateFilter]         = useState('')
  const [showNew, setShowNew]               = useState(false)
  const [selected, setSelected]             = useState(null)
  // Açık ticket detay modalının id'sini adres çubuğuna yansıtır.
  useUrlSyncedSelection(selected?.id ?? null, onSelectedTicketChange)
  const [quickAction, setQuickAction]       = useState(null)
  const { toast, showToast } = useToast()
  const isProjectManager = role === 'proje_yoneticisi'
  const canManage = isAdmin || isProjectManager
  // Satın Alma sekmesindeki Talepler/Onay Bekleyenler ayrımıyla aynı desen — yönetici
  // rolleri işleme almayı beklediği ticket'ları ayrı bir sekmede görsün.
  const [viewTab, setViewTab] = useState('all') // 'all' | 'onay'

  useEffect(() => {
    if (filterDateProp) setDateFilter(filterDateProp)
  }, [filterDateProp])

  // Dışarıdan (örn. Bildirimler/zil, Günlük Rapor'daki "Ticket açıldı" rozeti)
  // belirli bir ticket'a gidince artık modal açmıyoruz — yerel filtreler (durum
  // sekmesi/tarih/onay sekmesi) hedefi gizliyorsa sıfırlanır, bulununca
  // useHighlightRow satırı vurgular (kullanıcı isteği, 04.09.2026). Bu sayfada
  // (fatura/satın alma listelerinin aksine) ayrı bir realtime aboneliği yok —
  // kullanıcı sayfa zaten açıkken bildirim geldiyse `tickets` o ticket'tan ÖNCE
  // çekilmiş olabilir. Filtreler zaten varsayılandaysa vazgeçmeden ÖNCE bir kez
  // `fetchTickets()` ile tazeleyip tekrar deniyoruz (04.09.2026'da bulunan bug —
  // öncesinde ilk denemede bulunamayınca sessizce vazgeçiyordu).
  const retriedTicketRef = useRef(null)
  useEffect(() => {
    if (!openTicketId) { retriedTicketRef.current = null; return }
    if (tickets.some(t => t.id === openTicketId)) return
    if (loading) return
    if (statusTab !== 'all' || viewTab !== 'all' || dateFilter) {
      setStatusTab('all'); setViewTab('all'); setDateFilter('')
      return
    }
    if (retriedTicketRef.current !== openTicketId) {
      retriedTicketRef.current = openTicketId
      fetchTickets()
      return
    }
    showToast('Bu bildirim artık mevcut olmayan (veya erişemediğiniz) bir ticket\'a işaret ediyor.', 'error')
    onOpenedTicket?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTicketId, tickets, loading, statusTab, viewTab, dateFilter, onOpenedTicket])

  const { highlightedId, rowRef } = useHighlightRow(openTicketId, tickets, t => t.id, onOpenedTicket)

  // Listeyi belirleyen tüm değerler açıkça dependency'de; fetchTickets'in render-başına
  // değişen referansını eklemek gereksiz istek döngüsü yaratır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTickets() }, [statusTab, dateFilter, refreshKey, propProjectId, filterStatus, filterSeverity, isAdmin, role, authProjectId, user?.id, viewTab])

  async function fetchTickets() {
    setLoading(true)
    const dateColumn = statusTab === 'sonuclandi' ? 'resolved_at' : 'created_at'
    let q = supabase
      .from('tickets')
      .select('*')
      .order(dateColumn, { ascending: false, nullsFirst: false })

    // Status filtresi — "Onay Bekleyenler" sekmesi işleme alınmayı bekleyen
    // (gönderildi/açık) ticket'lara sabit filtrelenir, dropdown'daki durum
    // filtresiyle çakışmasın diye onu ezer.
    if (viewTab === 'onay') {
      q = q.in('status', ['gönderildi', 'açık'])
    } else if (filterStatus && filterStatus !== 'all') {
      q = q.eq('status', filterStatus)
    } else if (['acik', 'islemde', 'sonuclandi'].includes(statusTab)) {
      q = q.eq('workflow_stage', statusTab)
    }

    if (filterSeverity && filterSeverity !== 'all') q = q.eq('severity', filterSeverity)

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
      // project_id=X, project_id IS NULL satırlarını (kendi açtığı "Genel" ticket'lar)
      // asla eşleştirmez — bu yüzden ikisi de or() ile birlikte aranmalı.
      if (authProjectId) q = q.or(`project_id.eq.${authProjectId},project_id.is.null`)
    } else if (role === 'proje_yoneticisi') {
      // Çoklu projeye erişebiliyor, ProjeDetay'ın o an açık olan projesine göre süzülür
      // (admin dalıyla aynı desen) — sabit authProjectId değil propProjectId kullanılır.
      if (propProjectId) q = q.eq('project_id', propProjectId)
    } else {
      if (user?.id) q = q.eq('created_by', user.id)
    }

    const { data, error } = await q
    if (error) console.error('TicketListesi fetch error:', error)

    const result = await withProfileNames(data || [])

    setTickets(result)
    setLoading(false)
  }

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>

      {/* Satın Alma sekmesindeki Talepler/Onay Bekleyenler ayrımıyla aynı desen */}
      {canManage && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--color-border-md)', padding: '0 14px' }}>
          {[{ key: 'all', label: 'Tüm Ticketlar' }, { key: 'onay', label: 'Onay Bekleyenler' }].map(t => (
            <button key={t.key} onClick={() => setViewTab(t.key)} style={{
              background: 'none', border: 'none', padding: '10px 18px',
              fontSize: 13, fontWeight: viewTab === t.key ? 600 : 400,
              color: viewTab === t.key ? 'var(--color-primary)' : 'var(--color-muted)',
              cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: viewTab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -2,
            }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Satın alma tablosuyla aynı başlık + durum filtresi */}
      <div className="tl-tabs-bar" style={{ padding: '9px 14px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          {viewTab === 'onay' ? 'Onay Bekleyenler' : 'Tüm Ticketlar'}
        </h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 7 }}>
          {tickets.length} ticket
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>

          {viewTab !== 'onay' && (
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
          )}

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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
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
                      ref={rowRef(t.id)}
                      className={highlightedId === t.id ? 'row-highlight-flash' : undefined}
                      onClick={() => setSelected(t)}
                      style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ ...TD, minWidth: 220 }}>
                        <div style={{ display: 'grid', gap: 5 }}>
                          <strong style={{ color: 'var(--color-text)', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description || t.title}>
                            {t.description || t.title}
                          </strong>
                          <span style={{ color: 'var(--color-primary)', fontSize: 11, fontWeight: 800 }}>TKT-{String(t.id || '').replaceAll('-', '').slice(-3).toUpperCase() || String(idx + 1).padStart(3, '0')}</span>
                        </div>
                      </td>
                      <td style={{ ...TD, minWidth: 140 }}>
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
                      <td style={{ ...TD, minWidth: 150 }}>
                        <TicketStatusBadge status={t.status} />
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
                <div key={t.id} ref={rowRef(t.id)} className={`tl-card${highlightedId === t.id ? ' row-highlight-flash' : ''}`} onClick={() => setSelected(t)}>
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
                      <TicketStatusBadge status={t.status} />
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
        role === 'santiye_sefi' ? (
          <SiteChiefTicketDetayModal
            ticket={selected}
            onClose={() => setSelected(null)}
            onUpdated={() => { setSelected(null); fetchTickets(); onNewTicket?.() }}
          />
        ) : (
          <TicketDetayModal
            ticket={selected}
            onClose={() => setSelected(null)}
            onUpdated={() => { setSelected(null); fetchTickets(); onNewTicket?.() }}
          />
        )
      )}
      {quickAction && (
        <QuickActionModal
          ticket={quickAction.ticket}
          action={quickAction.type}
          onClose={() => setQuickAction(null)}
          onDone={() => { setQuickAction(null); fetchTickets(); onNewTicket?.() }}
        />
      )}
      <Toast toast={toast} />
    </div>
  )
}
