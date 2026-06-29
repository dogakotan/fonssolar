import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useWeather } from '../hooks/useWeather'
import { useSantiyeData } from '../hooks/useSantiyeData'
import DailyReportModal from '../components/santiye/modals/DailyReportModal'
import SahaFotograflari from '../components/santiye/SahaFotograflari'
import YeniTicketModal from '../components/tickets/YeniTicketModal'
import YeniTalepModal from '../components/satin-alma/YeniTalepModal'
import TicketDetayModal from '../components/tickets/TicketDetayModal'
import TalepDetayModal from '../components/satin-alma/TalepDetayModal'
import { supabase } from '../lib/supabase'

const WEATHER_EMOJI = {
  açık: '☀️', 'az bulutlu': '🌤️', 'parçalı bulutlu': '⛅', bulutlu: '☁️',
  kapalı: '☁️', yağmurlu: '🌧️', karlı: '🌨️', fırtınalı: '⛈️',
  sisli: '🌫️', çiseleyen: '🌦️', sağanak: '🌦️',
}
const STATUS_STYLES = {
  normal: { bg: '#D1FAE5', color: '#065F46', label: 'Normal' },
  dikkat: { bg: '#FEF3C7', color: '#92400E', label: 'Dikkat' },
  kritik: { bg: '#FEE2E2', color: '#991B1B', label: 'Kritik' },
}
const PR_STATUS = {
  bekliyor:     { label: 'Bekliyor',     bg: '#DBEAFE', color: '#1D4ED8' },
  onaylandı:    { label: 'Onaylandı',    bg: '#D1FAE5', color: '#065F46' },
  reddedildi:   { label: 'Reddedildi',   bg: '#FEE2E2', color: '#991B1B' },
  satın_alındı: { label: 'Satın Alındı', bg: '#F3F4F6', color: '#6B7280' },
}
const PR_URGENCY = {
  normal:   { label: 'Normal',    bg: '#F3F4F6', color: '#6B7280' },
  acil:     { label: 'Acil',      bg: '#FEF3C7', color: '#92400E' },
  çok_acil: { label: 'Çok Acil', bg: '#FEE2E2', color: '#991B1B' },
}
const TK_STATUS = {
  gönderildi: { label: 'Gönderildi', bg: '#DBEAFE', color: '#1D4ED8' },
  açık:       { label: 'Açık',       bg: '#DBEAFE', color: '#1D4ED8' },
  işlemde:    { label: 'İşlemde',    bg: '#FEF3C7', color: '#92400E' },
  kapatıldı:  { label: 'Kapatıldı', bg: '#D1FAE5', color: '#065F46' },
}
const TK_SEVERITY = {
  düşük:  { label: 'Düşük',   bg: '#F3F4F6', color: '#6B7280' },
  orta:   { label: 'Orta',    bg: '#FEF3C7', color: '#D97706' },
  yüksek: { label: 'Yüksek',  bg: '#FEE2E2', color: '#991B1B' },
  kritik: { label: 'Kritik',  bg: '#FEE2E2', color: '#7F1D1D' },
}

function Badge({ map, value }) {
  const b = map[value] || { label: value || '—', bg: '#F3F4F6', color: '#6B7280' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: b.bg, color: b.color, whiteSpace: 'nowrap', flexShrink: 0,
    }}>{b.label}</span>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function useProject(projectId) {
  const [project, setProject] = useState(null)
  useEffect(() => {
    if (!projectId) return
    supabase.from('projects')
      .select('id, name, location, progress')
      .eq('id', projectId)
      .single()
      .then(({ data }) => setProject(data))
  }, [projectId])
  return project
}

function useRecentReports(projectId) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch5 = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const { data } = await supabase
      .from('daily_reports')
      .select('id, report_date, weather, general_status, worker_count, profiles(full_name)')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(5)
    setReports(data || [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetch5() }, [fetch5])

  return { reports, loading, refetch: fetch5 }
}

export default function SantiyeSefiDashboard({ onTabChange }) {
  const { user, profile, projectId } = useAuth()
  const [talepTab, setTalepTab]   = useState('satin_alma')
  const [prLimit, setPrLimit]     = useState(5)
  const [tkLimit, setTkLimit]     = useState(5)
  const [showModal, setShowModal] = useState(false)
  const [showTicket, setShowTicket] = useState(false)
  const [showTalep, setShowTalep]   = useState(false)
  const [detayTicket, setDetayTicket] = useState(null)
  const [detayTalep, setDetayTalep]   = useState(null)
  const [toast, setToast] = useState('')

  const project     = useProject(projectId)
  const weatherCity = project?.location?.split('/')?.[0]?.trim() || null
  const weather     = useWeather(weatherCity)
  const { loading, openPurchaseRequests, openTickets, todayReport, stats, refetch } = useSantiyeData(projectId)
  const { reports: recentReports, loading: recentLoading, refetch: refetchReports } = useRecentReports(projectId)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const progressPct = project?.progress || 0

  const CARD_BASE = {
    background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14,
    padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
  }

  return (
    <div style={{ minHeight: '100%' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: '#D1FAE5', color: '#065F46', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,.12)',
        }}>
          {toast}
        </div>
      )}

      {/* Proje başlığı */}
      <div style={{ ...CARD_BASE, marginBottom: 16, padding: '14px 20px' }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
          {project?.name || projectId || 'Proje'}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>Genel Bakış</p>
      </div>

      {/* KPI Cards — auto-fill grid, wraps naturally on mobile */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 12, marginBottom: 16,
      }}>
        {/* Günlük Rapor */}
        <button
          onClick={() => setShowModal(true)}
          style={{
            ...CARD_BASE, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            borderLeft: `4px solid ${todayReport ? '#10B981' : '#F59E0B'}`,
            background: todayReport ? '#F0FDF4' : '#FFFBEB',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Günlük Rapor
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0,
              background: todayReport ? '#D1FAE5' : '#FEF3C7',
              color: todayReport ? '#065F46' : '#92400E',
            }}>
              {todayReport ? 'Girildi' : 'Bekliyor'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: todayReport ? '#065F46' : '#92400E' }}>
            {todayReport ? '✓ Görüntüle' : '+ Rapor Gir'}
          </p>
        </button>

        {/* Satın Alma */}
        <button
          onClick={() => {
            setTalepTab('satin_alma')
            document.getElementById('taleplerim')?.scrollIntoView({ behavior: 'smooth' })
          }}
          style={{ ...CARD_BASE, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderLeft: '4px solid #185FA5' }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Açık Satın Alma
            </span>
          </div>
          <p style={{ margin: '0 0 2px', fontSize: 26, fontWeight: 800, color: '#185FA5', lineHeight: 1 }}>{stats.prCount}</p>
          <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>bekleyen talep</p>
        </button>

        {/* Ticketlar */}
        <button
          onClick={() => {
            setTalepTab('ticket')
            document.getElementById('taleplerim')?.scrollIntoView({ behavior: 'smooth' })
          }}
          style={{ ...CARD_BASE, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderLeft: '4px solid #7C3AED' }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Açık Ticketlar
            </span>
          </div>
          <p style={{ margin: '0 0 2px', fontSize: 26, fontWeight: 800, color: '#7C3AED', lineHeight: 1 }}>{stats.ticketCount}</p>
          <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>açık ticket</p>
        </button>

        {/* Proje İlerlemesi */}
        <div style={{ ...CARD_BASE, borderLeft: '4px solid #003B8E' }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Proje İlerlemesi
            </span>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800, color: '#003B8E', lineHeight: 1 }}>
            {progressPct}%
          </p>
          <div style={{ height: 5, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, progressPct)}%`, background: '#003B8E', borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
        </div>

        {/* Hava Durumu */}
        <div style={{ ...CARD_BASE, borderLeft: '4px solid #0EA5E9' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 8 }}>
            Hava{weatherCity ? ` — ${weatherCity}` : ''}
          </span>
          {!weatherCity ? (
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Konum tanımsız</p>
          ) : weather.loading || !weather.current ? (
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Yükleniyor…</p>
          ) : weather.error ? (
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Alınamadı</p>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 24, lineHeight: 1 }}>{weather.current.emoji}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{weather.current.temp}°C</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9CA3AF' }}>
                {weather.current.label} · 💨 {weather.current.wind} km/h
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Taleplerim */}
      <div id="taleplerim" style={{
        ...CARD_BASE, padding: 0, marginBottom: 16, overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Taleplerim</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowTalep(true)} style={BTN_SM_PRIMARY}>+ Satın Alma</button>
            <button onClick={() => setShowTicket(true)} style={{ ...BTN_SM_PRIMARY, background: '#7C3AED' }}>+ Ticket</button>
          </div>
        </div>

        {/* Sekme seçici */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #f1f5f9', padding: '0 18px' }}>
          {[
            { key: 'satin_alma', label: `Satın Alma (${openPurchaseRequests.length})` },
            { key: 'ticket',     label: `Ticketlar (${openTickets.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setTalepTab(tab.key); setPrLimit(5); setTkLimit(5) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: 600, padding: '10px 16px', whiteSpace: 'nowrap',
                color: talepTab === tab.key ? '#185FA5' : '#94a3b8',
                borderBottom: talepTab === tab.key ? '2px solid #185FA5' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.1s, border-color 0.1s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {/* Satın Alma listesi */}
          {talepTab === 'satin_alma' && (
            openPurchaseRequests.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '16px 0', margin: 0 }}>
                Açık satın alma talebi yok.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {openPurchaseRequests.slice(0, prLimit).map(pr => (
                  <button key={pr.id} onClick={() => setDetayTalep(pr)}
                    style={ITEM_BTN}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>🛒</span>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827', flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pr.title}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Badge map={PR_URGENCY} value={pr.urgency} />
                      <Badge map={PR_STATUS} value={pr.status} />
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDate(pr.created_at)}</span>
                    </div>
                  </button>
                ))}
                {openPurchaseRequests.length > prLimit && (
                  <button onClick={() => setPrLimit(l => l + 5)} style={LOAD_MORE_BTN}>
                    Daha Fazla Yükle ({openPurchaseRequests.length - prLimit} kaldı)
                  </button>
                )}
              </div>
            )
          )}

          {/* Ticket listesi */}
          {talepTab === 'ticket' && (
            openTickets.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '16px 0', margin: 0 }}>
                Açık ticket yok.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {openTickets.slice(0, tkLimit).map(tk => (
                  <button key={tk.id} onClick={() => setDetayTicket(tk)}
                    style={ITEM_BTN}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>🎫</span>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827', flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tk.title}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Badge map={TK_SEVERITY} value={tk.severity} />
                      <Badge map={TK_STATUS} value={tk.status} />
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDate(tk.created_at)}</span>
                    </div>
                  </button>
                ))}
                {openTickets.length > tkLimit && (
                  <button onClick={() => setTkLimit(l => l + 5)} style={LOAD_MORE_BTN}>
                    Daha Fazla Yükle ({openTickets.length - tkLimit} kaldı)
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Son Günlük Raporlar */}
      <div style={{ ...CARD_BASE, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Son Günlük Raporlar</h3>
          <button onClick={() => onTabChange?.('rapor-listesi')} style={BTN_LINK}>Tümünü Gör →</button>
        </div>

        {recentLoading ? (
          <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '16px 0', margin: 0 }}>Yükleniyor…</p>
        ) : recentReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#9CA3AF' }}>
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>Henüz rapor girilmemiş.</p>
            <button onClick={() => setShowModal(true)} style={BTN_ACCENT}>İlk Raporu Gir</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentReports.map(r => {
              const ss = STATUS_STYLES[r.general_status] || { bg: '#F3F4F6', color: '#6B7280', label: r.general_status || '—' }
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '10px 14px', background: '#F9FAFB', borderRadius: 10, border: '1px solid #F3F4F6',
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{WEATHER_EMOJI[r.weather] || '🌡️'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', flex: 1, minWidth: 80 }}>
                    {new Date(r.report_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: ss.bg, color: ss.color, flexShrink: 0 }}>
                    {ss.label}
                  </span>
                  {r.worker_count > 0 && (
                    <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{r.worker_count} kişi</span>
                  )}
                  <button onClick={() => onTabChange?.('rapor-listesi')} style={{ ...BTN_SMALL, marginLeft: 'auto' }}>
                    Görüntüle
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Saha Fotoğrafları */}
      <div style={{ marginBottom: 16 }}>
        <SahaFotograflari projectId={projectId} userId={user?.id} />
      </div>

      {/* Modaller */}
      {showModal && (
        <DailyReportModal
          projectId={projectId}
          userId={user?.id}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            refetch()
            refetchReports()
            showToast('Günlük rapor kaydedildi ✓')
          }}
        />
      )}
      {showTicket && (
        <YeniTicketModal
          onClose={() => setShowTicket(false)}
          onSaved={() => { setShowTicket(false); refetch(); showToast('Ticket oluşturuldu ✓') }}
        />
      )}
      {showTalep && (
        <YeniTalepModal
          defaultProjectId={projectId}
          onClose={() => setShowTalep(false)}
          onSaved={() => { setShowTalep(false); refetch(); showToast('Satın alma talebi oluşturuldu ✓') }}
        />
      )}
      {detayTicket && (
        <TicketDetayModal
          ticket={detayTicket}
          onClose={() => { setDetayTicket(null); refetch() }}
          onUpdated={() => { setDetayTicket(null); refetch() }}
        />
      )}
      {detayTalep && (
        <TalepDetayModal
          talepId={detayTalep.id}
          onClose={() => { setDetayTalep(null); refetch() }}
        />
      )}
    </div>
  )
}

const BTN_ACCENT = {
  background: '#003B8E', color: '#fff', border: 'none', borderRadius: 8,
  padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const BTN_SM_PRIMARY = {
  background: '#003B8E', color: '#fff', border: 'none', borderRadius: 6,
  padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const BTN_LINK = {
  background: 'none', color: '#003B8E', border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0,
}
const BTN_SMALL = {
  background: '#EBF5FF', color: '#003B8E', border: '1px solid #BFDBFE',
  borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const ITEM_BTN = {
  background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 10,
  padding: '10px 14px', width: '100%', cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s',
}
const LOAD_MORE_BTN = {
  background: 'none', border: '1px dashed #D1D5DB', borderRadius: 8,
  padding: '8px', fontSize: 12, color: '#6B7280', cursor: 'pointer',
  fontFamily: 'inherit', width: '100%',
}
