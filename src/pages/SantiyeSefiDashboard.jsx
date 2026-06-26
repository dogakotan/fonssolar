import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSantiyeData } from '../hooks/useSantiyeData'
import DailyReportModal    from '../components/santiye/modals/DailyReportModal'
import AcikTaleplerSection from '../components/santiye/AcikTaleplerSection'
import SahaFotograflari    from '../components/santiye/SahaFotograflari'
import YeniTicketModal     from '../components/tickets/YeniTicketModal'
import YeniTalepModal      from '../components/satin-alma/YeniTalepModal'

const SECTIONS = [
  { key: 'genel',      label: 'Genel Bakış' },
  { key: 'satin_alma', label: 'Satın Alma' },
  { key: 'ticketlar',  label: 'Ticketlar' },
  { key: 'raporlar',   label: 'Raporlar' },
]

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
      padding: '14px 18px', borderTop: `3px solid ${accent || '#185FA5'}`,
      boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</span>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <p style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{sub}</p>}
    </div>
  )
}

export default function SantiyeSefiDashboard() {
  const { user, profile, projectId } = useAuth()
  const [section, setSection]        = useState('genel')
  const [showRapor, setShowRapor]    = useState(false)
  const [showTicket, setShowTicket]  = useState(false)
  const [showTalep, setShowTalep]    = useState(false)
  const [toast, setToast]            = useState('')

  const { loading, openPurchaseRequests, openTickets, todayReport, stats, refetch } = useSantiyeData(projectId)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const today = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const CARD = {
    background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
    padding: '14px 18px', cursor: 'pointer', fontFamily: 'inherit',
    textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)', transition: 'box-shadow 0.15s',
  }

  return (
    <div style={{ minHeight: '100%' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: '#D1FAE5', color: '#065F46', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
        padding: '14px 20px', marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {projectId} &middot; Şantiye Şefi
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#1e293b' }}>{today}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowRapor(true)}
            style={{
              background: todayReport ? '#D1FAE5' : '#FEF3C7',
              color: todayReport ? '#065F46' : '#92400E',
              border: 'none', borderRadius: 8, padding: '7px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {todayReport ? '✓ Rapor Girildi' : '⏳ Günlük Rapor Gir'}
          </button>
          {profile?.full_name && (
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#185FA5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #e2e8f0', paddingBottom: 0, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, padding: '8px 16px', whiteSpace: 'nowrap', flexShrink: 0,
              color: section === s.key ? '#185FA5' : '#64748b',
              borderBottom: section === s.key ? '2px solid #185FA5' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.1s, border-color 0.1s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── GENEL BAKIŞ ── */}
      {section === 'genel' && (
        <div>
          {/* Quick Action Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>

            {/* Günlük Rapor */}
            <button
              style={{ ...CARD, borderLeft: `3px solid ${todayReport ? '#10B981' : '#F59E0B'}`, background: todayReport ? '#F0FDF4' : '#fff' }}
              onClick={() => setShowRapor(true)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Günlük Rapor</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 10, background: todayReport ? '#D1FAE5' : '#FEF3C7', color: todayReport ? '#065F46' : '#92400E' }}>
                  {todayReport ? 'Girildi' : 'Bekliyor'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: todayReport ? '#065F46' : '#92400E' }}>
                {todayReport ? 'Raporu Gör / Düzenle' : 'Rapor Gir'}
              </p>
            </button>

            {/* Satın Alma Talebi */}
            <button style={{ ...CARD, borderLeft: '3px solid #185FA5' }} onClick={() => setShowTalep(true)}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Satın Alma Talebi</span>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#185FA5' }}>+ Talep Oluştur</p>
              <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>{stats.prCount} açık talep</p>
            </button>

            {/* Ticket */}
            <button style={{ ...CARD, borderLeft: '3px solid #7C3AED' }} onClick={() => setShowTicket(true)}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Ticket</span>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#7C3AED' }}>+ Ticket Aç</p>
              <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>{stats.ticketCount} açık ticket</p>
            </button>

            {/* Hava Durumu */}
            <div style={{ ...CARD, cursor: 'default', borderLeft: '3px solid #185FA5' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 8 }}>
                Hava — Uşak
              </span>
              <WeatherWidget />
            </div>
          </div>

          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard
              label="Açık Satın Alma"
              value={stats.prCount}
              sub="Bekleyen / Onaylanan talepler"
              accent="#185FA5" icon="📋"
            />
            <StatCard
              label="Açık Ticketlar"
              value={stats.ticketCount}
              sub="Gönderildi / Açık / İşlemde"
              accent="#7C3AED" icon="🎫"
            />
          </div>

          {/* Açık Talepler */}
          <div style={{ marginBottom: 16 }}>
            <AcikTaleplerSection
              purchaseRequests={openPurchaseRequests}
              tickets={openTickets}
              onRefetch={refetch}
            />
          </div>

          {/* Saha Fotoğrafları */}
          <div style={{ marginBottom: 16 }}>
            <SahaFotograflari
              projectId={projectId}
              userId={user?.id}
            />
          </div>
        </div>
      )}

      {/* ── SATIN ALMA ── */}
      {section === 'satin_alma' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowTalep(true)} style={BTN_ACCENT}>+ Yeni Talep</button>
          </div>
          <AcikTaleplerSection
            purchaseRequests={openPurchaseRequests}
            tickets={[]}
            onRefetch={refetch}
          />
        </div>
      )}

      {/* ── TICKETlar ── */}
      {section === 'ticketlar' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowTicket(true)} style={BTN_ACCENT}>+ Yeni Ticket</button>
          </div>
          <AcikTaleplerSection
            purchaseRequests={[]}
            tickets={openTickets}
            onRefetch={refetch}
          />
        </div>
      )}

      {/* ── RAPORLAR ── */}
      {section === 'raporlar' && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9CA3AF' }}>
          <p style={{ fontSize: 32, margin: '0 0 12px' }}>📊</p>
          <p style={{ fontSize: 15, fontWeight: 600 }}>Raporlar yakında</p>
          <p style={{ fontSize: 13 }}>Tarih bazlı ilerleme raporları bu bölümde yer alacak.</p>
        </div>
      )}

      {/* ── Modaller ── */}
      {showRapor && (
        <DailyReportModal
          projectId={projectId}
          userId={user?.id}
          profileId={profile?.id}
          onClose={() => setShowRapor(false)}
          onSaved={() => { setShowRapor(false); refetch(); showToast('Günlük rapor kaydedildi ✓') }}
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
    </div>
  )
}

function WeatherWidget() {
  const [wx, setWx] = useState(null)

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=38.6823&longitude=29.4082&current=temperature_2m,weathercode,windspeed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Europe/Istanbul&forecast_days=1')
      .then(r => r.json())
      .then(data => {
        const wc   = data?.current?.weathercode
        const temp = data?.current?.temperature_2m
        const wind = data?.current?.windspeed_10m
        const max  = data?.daily?.temperature_2m_max?.[0]
        const min  = data?.daily?.temperature_2m_min?.[0]
        const EMOJI = { 0:'☀️',1:'🌤️',2:'⛅',3:'☁️',51:'🌦️',53:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',71:'🌨️',75:'❄️',80:'🌦️',95:'⛈️' }
        const emoji = EMOJI[wc] || (wc <= 3 ? '🌤️' : wc <= 67 ? '🌧️' : '❄️')
        setWx({ emoji, temp: Math.round(temp), wind: Math.round(wind), max: Math.round(max), min: Math.round(min) })
      })
      .catch(() => {})
  }, [])

  if (!wx) return <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Yükleniyor…</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>{wx.emoji}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{wx.temp}°C</span>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9CA3AF' }}>
        ↑{wx.max}° ↓{wx.min}° · 💨 {wx.wind} km/h
      </p>
    </div>
  )
}

const BTN_ACCENT = {
  background: '#003B8E', color: '#fff', border: 'none', borderRadius: 8,
  padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
