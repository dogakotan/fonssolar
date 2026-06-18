import { useState, useEffect, useRef } from 'react'
import ProgBar from '../../../components/ui/ProgBar'
import ExportButton from '../../../components/ui/ExportButton'
import WeatherWidget from '../../../components/ui/WeatherWidget'
import DateNavigator from '../../../components/ui/DateNavigator'
import { getProjects, getDashboardKpis } from '../../../api'
import { supabase } from '../../../lib/supabase'
import { dateFilter } from '../../../utils/exportUtils'

const STATUS_MAP = {
  active:    { badge: 'green', label: 'Aktif' },
  completed: { badge: 'blue',  label: 'Tamamlandı' },
  on_hold:   { badge: 'amber', label: 'Beklemede' },
  cancelled: { badge: 'red',   label: 'İptal' },
}

export default function TabGenel({ onSelectProject, selectedDate, setSelectedDate }) {
  const [kpis, setKpis]           = useState({ activeProjects: '—', openTasks: '—', pendingPurchases: '—' })
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [konum, setKonum]         = useState(null)
  const [showCal, setShowCal]     = useState(false)
  const [calPos, setCalPos]       = useState({ top: 0, right: 0 })
  const calRef = useRef(null)
  const calBtnRef = useRef(null)

  useEffect(() => {
    function handler(e) { if (calRef.current && !calRef.current.contains(e.target) && !calBtnRef.current?.contains(e.target)) setShowCal(false) }
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
  const [openTickets, setOpenTickets]     = useState(null)
  const [criticalTickets, setCriticalTickets] = useState(null)

  useEffect(() => {
    async function load() {
      const [kpiData, { data: projData, error }, tOpen, tCrit] = await Promise.all([
        getDashboardKpis(),
        getProjects(),
        supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'açık'),
        supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('severity', 'kritik').neq('status', 'kapatıldı'),
      ])
      if (!error) setProjects(projData || [])
      setKpis(kpiData)
      if (!tOpen.error)  setOpenTickets(tOpen.count  ?? 0)
      if (!tCrit.error)  setCriticalTickets(tCrit.count ?? 0)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setKonum({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setKonum('İstanbul')
      )
    } else {
      setKonum('İstanbul')
    }
  }, [])

  // Tarih filtresi: seçili tarihten önce oluşturulan projeler
  const displayProjects = selectedDate
    ? projects.filter(p => p.created_at && new Date(p.created_at) <= new Date(selectedDate))
    : projects

  const totalMwp = displayProjects.reduce((sum, p) => sum + (p.capacity_kwp || 0), 0) / 1000

  const ticketVal = loading || openTickets === null ? '…' : openTickets
  const ticketClass = criticalTickets ? 'red-text' : ''
  const ticketNote  = criticalTickets ? `${criticalTickets} kritik` : 'Açık bildirim'

  const stats = [
    { label: 'Toplam Proje',     value: loading ? '…' : kpis.activeProjects,          note: 'Kayıtlı proje sayısı' },
    { label: 'Toplam Kapasite',  value: loading ? '…' : `${totalMwp.toFixed(2)} MWp`, note: 'Kurulu güç (kWp)' },
    { label: 'Açık Görev',       value: loading ? '…' : kpis.openTasks,               note: 'Aktif + gecikmiş', valueClass: 'amber-text' },
    { label: 'Bekleyen Sipariş', value: loading ? '…' : kpis.pendingPurchases,        note: 'Onay bekliyor',    valueClass: 'red-text' },
    { label: 'Açık Ticket',      value: ticketVal,                                     note: ticketNote,          valueClass: ticketClass },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div className="stats-grid" style={{ flex: 1, marginBottom: 0, gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {stats.map(s => (
            <div className="stat-card" key={s.label}>
              <p className="stat-label">{s.label}</p>
              <p className={`stat-value ${s.valueClass || ''}`}>{s.value}</p>
              <p className="stat-note">{s.note}</p>
            </div>
          ))}
        </div>

        {konum && (
          <div className="stat-card" style={{ flexShrink: 0, width: 290, padding: '1rem 1.25rem', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="stat-label" style={{ margin: 0 }}>Hava Durumu</p>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {typeof konum === 'string' ? konum : 'Mevcut Konum'}
              </span>
            </div>
            <WeatherWidget location={konum} size="full" />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Projeler</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>

            {/* Tarih Seç — ExportButton yanında */}
            {setSelectedDate && (
              <div style={{ position: 'relative' }}>
                <button
                  ref={calBtnRef}
                  onClick={openCal}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px',
                    background: selectedDate ? '#185FA5' : '#fff',
                    color: selectedDate ? '#fff' : 'var(--color-text)',
                    border: selectedDate ? 'none' : '1px solid var(--color-border)',
                    borderRadius: 8, fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: selectedDate ? '0 2px 8px rgba(24,95,165,0.18)' : 'none',
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  {selectedDate ? selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tarih Seç'}
                </button>
                {showCal && (
                  <div ref={calRef} style={{ position: 'fixed', top: calPos.top, right: calPos.right, zIndex: 9999 }}>
                    <DateNavigator
                      selectedDate={selectedDate}
                      onChange={d => { setSelectedDate(d); setShowCal(false) }}
                    />
                  </div>
                )}
              </div>
            )}

            <ExportButton
              title="Proje Listesi"
              disabled={loading || displayProjects.length === 0}
              getData={(periyot) => {
                const filtered = selectedDate ? displayProjects : dateFilter(displayProjects, 'created_at', periyot)
                return {
                  columns: ['Proje Adı', 'Konum', 'Kapasite (kWp)', 'Kapasite (kWe)', 'Durum'],
                  rows: filtered.map(p => [
                    p.name,
                    p.location || '—',
                    p.capacity_kwp || 0,
                    p.capacity_kwe || 0,
                    { active: 'Aktif', completed: 'Tamamlandı', on_hold: 'Beklemede', cancelled: 'İptal' }[p.status] || '—',
                  ]),
                }
              }}
            />
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Proje Adı</th><th>Konum</th><th>kWp</th><th>kWe</th><th>Durum</th><th>İlerleme</th></tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-muted)' }}>Yükleniyor…</td></tr>
            )}
            {!loading && displayProjects.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-muted)' }}>
                {selectedDate ? `${selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} tarihinde kayıtlı proje yok.` : 'Proje bulunamadı.'}
              </td></tr>
            )}
            {displayProjects.map(p => {
              const s = STATUS_MAP[p.status] || { badge: 'blue', label: 'Aktif' }
              return (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onSelectProject?.(p.id, p.name)}>
                  <td className="fw">{p.name}</td>
                  <td>{p.location || '—'}</td>
                  <td>{p.capacity_kwp?.toLocaleString('tr-TR') || '—'}</td>
                  <td>{p.capacity_kwe?.toLocaleString('tr-TR') || '—'}</td>
                  <td><span className={`badge ${s.badge}`}>● {s.label}</span></td>
                  <td><ProgBar pct={p.progress || 0} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
