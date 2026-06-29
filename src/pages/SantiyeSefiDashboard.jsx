import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useWeather } from '../hooks/useWeather'
import { useSantiyeData } from '../hooks/useSantiyeData'
import YeniTicketModal from '../components/tickets/YeniTicketModal'
import YeniTalepModal from '../components/satin-alma/YeniTalepModal'
import TicketDetayModal from '../components/tickets/TicketDetayModal'
import TalepDetayModal from '../components/satin-alma/TalepDetayModal'
import { supabase } from '../lib/supabase'

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

const TURKEY_CITIES = [
  'adana', 'adıyaman', 'afyonkarahisar', 'ağrı', 'amasya', 'ankara', 'antalya', 'artvin',
  'aydın', 'balıkesir', 'bilecik', 'bingöl', 'bitlis', 'bolu', 'burdur', 'bursa',
  'çanakkale', 'çankırı', 'çorum', 'denizli', 'diyarbakır', 'edirne', 'elazığ', 'erzincan',
  'erzurum', 'eskişehir', 'gaziantep', 'giresun', 'gümüşhane', 'hakkari', 'hatay', 'ısparta',
  'mersin', 'istanbul', 'izmir', 'kars', 'kastamonu', 'kayseri', 'kırklareli', 'kırşehir',
  'kocaeli', 'konya', 'kütahya', 'malatya', 'manisa', 'kahramanmaraş', 'mardin', 'muğla',
  'muş', 'nevşehir', 'niğde', 'ordu', 'rize', 'sakarya', 'samsun', 'siirt', 'sinop',
  'sivas', 'tekirdağ', 'tokat', 'trabzon', 'tunceli', 'şanlıurfa', 'uşak', 'van', 'yozgat',
  'zonguldak', 'aksaray', 'bayburt', 'karaman', 'kırıkkale', 'batman', 'şırnak', 'bartın',
  'ardahan', 'ığdır', 'yalova', 'karabük', 'kilis', 'osmaniye', 'düzce',
]

function normalizeTR(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function titleCity(value) {
  if (!value) return null
  return value.charAt(0).toLocaleUpperCase('tr-TR') + value.slice(1)
}

function projectIdLabel(projectId) {
  if (!projectId || /^[0-9a-f-]{24,}$/i.test(String(projectId))) return ''
  return String(projectId)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, c => c.toLocaleUpperCase('tr-TR'))
}

function extractWeatherCity(project) {
  if (!project) return null

  const candidates = [
    project.weather_city,
    project.city,
    project.province,
    project.il,
    project.location,
    project.name,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const firstPart = String(candidate).split(/[\/,;-]/)[0]?.trim()
    if (firstPart) {
      const exactCity = TURKEY_CITIES.find(city => normalizeTR(city) === normalizeTR(firstPart))
      if (exactCity) return titleCity(exactCity)
    }

    const normalized = normalizeTR(candidate)
    const containedCity = TURKEY_CITIES.find(city => normalized.includes(normalizeTR(city)))
    if (containedCity) return titleCity(containedCity)
  }

  return null
}

function useProject(projectId) {
  const [project, setProject] = useState(null)
  useEffect(() => {
    if (!projectId) {
      setProject(null)
      return
    }
    async function loadProject() {
      const byId = await supabase.from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle()

      if (byId.data) {
        setProject(byId.data)
        return
      }

      if (projectIdLabel(projectId)) {
        const byName = await supabase.from('projects')
          .select('*')
          .ilike('name', `%${String(projectId).replace(/[-_]+/g, ' ')}%`)
          .limit(1)
          .maybeSingle()

        if (byName.data) {
          setProject(byName.data)
          return
        }
      }

      setProject({ id: projectId, name: projectIdLabel(projectId) })
    }

    loadProject()
  }, [projectId])
  return project
}

export default function SantiyeSefiDashboard({ onTabChange, onNewReport, onEditReport }) {
  const { projectId } = useAuth()
  const [talepTab, setTalepTab]   = useState('all')
  const [requestLimit, setRequestLimit] = useState(5)
  const [reportLimit, setReportLimit] = useState(5)
  const [showTicket, setShowTicket] = useState(false)
  const [showTalep, setShowTalep]   = useState(false)
  const [detayTicket, setDetayTicket] = useState(null)
  const [detayTalep, setDetayTalep]   = useState(null)
  const [toast, setToast] = useState('')

  const project     = useProject(projectId)
  const weatherCity = extractWeatherCity(project)
  const weather     = useWeather(weatherCity)
  const { openPurchaseRequests, openTickets, todayReport, recentReports, stats, refetch } = useSantiyeData(projectId)

  useEffect(() => {
    setReportLimit(5)
  }, [projectId])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const CARD_BASE = {
    background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14,
    padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
  }

  const requestItems = [
    ...openPurchaseRequests.map(item => ({ ...item, _type: 'purchase' })),
    ...openTickets.map(item => ({ ...item, _type: 'ticket' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const visibleRequests = requestItems.filter(item => {
    if (talepTab === 'satin_alma') return item._type === 'purchase'
    if (talepTab === 'ticket') return item._type === 'ticket'
    return true
  })

  function goRequests(tab = 'all') {
    setTalepTab(tab)
    setRequestLimit(5)
    document.getElementById('taleplerim')?.scrollIntoView({ behavior: 'smooth' })
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

      {/* KPI Cards — auto-fill grid, wraps naturally on mobile */}
      <div className="santiye-kpi-grid" style={{
        display: 'grid',
        gap: 12, marginBottom: 16,
      }}>
        {/* Günlük Rapor */}
        <button
          onClick={() => todayReport ? onEditReport?.(todayReport.id) : onNewReport?.()}
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
            {todayReport ? 'Görüntüle' : '+ Rapor Gir'}
          </p>
        </button>

        {/* Satın Alma Aç */}
        <button
          onClick={() => setShowTalep(true)}
          style={{ ...CARD_BASE, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderLeft: '4px solid #185FA5' }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Satın Alma
            </span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 800, color: '#185FA5', lineHeight: 1.15 }}>+ Talep Aç</p>
        </button>

        {/* Ticket Aç */}
        <button
          onClick={() => setShowTicket(true)}
          style={{ ...CARD_BASE, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderLeft: '4px solid #7C3AED' }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Ticket
            </span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 800, color: '#7C3AED', lineHeight: 1.15 }}>+ Ticket Aç</p>
        </button>

        {/* Açık Talepler */}
        <button
          onClick={() => goRequests('all')}
          style={{ ...CARD_BASE, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderLeft: '4px solid #003B8E' }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Açık Talepler
            </span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
              <strong style={{ color: '#185FA5', fontSize: 20 }}>{stats.prCount}</strong> satın alma
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
              <strong style={{ color: '#7C3AED', fontSize: 20 }}>{stats.ticketCount}</strong> ticket
            </p>
          </div>
        </button>

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
            { key: 'all', label: `Tümü (${requestItems.length})` },
            { key: 'satin_alma', label: `Satın Alma (${openPurchaseRequests.length})` },
            { key: 'ticket',     label: `Ticketlar (${openTickets.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setTalepTab(tab.key); setRequestLimit(5) }}
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
          {visibleRequests.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '16px 0', margin: 0 }}>
              Açık talep bulunmuyor.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleRequests.slice(0, requestLimit).map(item => {
                const isPurchase = item._type === 'purchase'
                return (
                  <button
                    key={`${item._type}-${item.id}`}
                    onClick={() => isPurchase ? setDetayTalep(item) : setDetayTicket(item)}
                    style={ITEM_BTN}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{isPurchase ? '🛒' : '🎫'}</span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title || item.description || 'Başlıksız talep'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                        {isPurchase ? 'Satın Alma' : 'Ticket'} · {fmtDate(item.created_at)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {isPurchase ? (
                        <>
                          <Badge map={PR_URGENCY} value={item.urgency} />
                          <Badge map={PR_STATUS} value={item.status} />
                        </>
                      ) : (
                        <>
                          <Badge map={TK_SEVERITY} value={item.severity} />
                          <Badge map={TK_STATUS} value={item.status} />
                        </>
                      )}
                    </div>
                  </button>
                )
              })}
              {visibleRequests.length > requestLimit && (
                <button onClick={() => setRequestLimit(l => l + 5)} style={LOAD_MORE_BTN}>
                  Daha Fazla Yükle ({visibleRequests.length - requestLimit} kaldı)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Son Raporlar */}
      <div style={{
        ...CARD_BASE, padding: 0, marginBottom: 16, overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'block' }}>Son Raporlar</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>En son girilen günlük saha raporları</span>
          </div>
          <button onClick={() => onTabChange?.('rapor-listesi')} style={BTN_SM_GHOST}>Tümünü Gör</button>
        </div>

        <div style={{ padding: 16 }}>
          {recentReports.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '16px 0', margin: 0 }}>
              Henüz günlük rapor girilmedi.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentReports.slice(0, reportLimit).map(report => (
                <button
                  key={report.id}
                  onClick={() => onEditReport?.(report.id)}
                  style={ITEM_BTN}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      {report.report_date ? new Date(report.report_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tarihsiz rapor'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                      {report.weather || 'Hava yok'} · {report.worker_count || 0} personel
                    </p>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: '#EEF2FF', color: '#3730A3', whiteSpace: 'nowrap',
                  }}>
                    {report.general_status || 'Durum yok'}
                  </span>
                </button>
              ))}
              {recentReports.length > reportLimit && (
                <button onClick={() => setReportLimit(l => l + 5)} style={LOAD_MORE_BTN}>
                  Daha Fazla Yükle ({recentReports.length - reportLimit} kaldı)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modaller */}
      {showTicket && (
        <YeniTicketModal
          defaultProject={project ? { ...project, location: project.location || weatherCity } : undefined}
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
          request={detayTalep}
          onClose={() => { setDetayTalep(null); refetch() }}
        />
      )}
    </div>
  )
}

const BTN_SM_PRIMARY = {
  background: '#003B8E', color: '#fff', border: 'none', borderRadius: 6,
  padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const BTN_SM_GHOST = {
  background: '#fff', color: '#003B8E', border: '1px solid #BFDBFE', borderRadius: 6,
  padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  whiteSpace: 'nowrap',
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
