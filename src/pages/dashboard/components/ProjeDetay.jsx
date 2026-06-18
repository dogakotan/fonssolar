import { useState, useEffect, useRef } from 'react'
import { getProjects, getWorkPackages, getGunlukIlerleme, getPersonelMakineRaporu } from '../../../api'
import ProgBar from '../../../components/ui/ProgBar'
import WeatherWidget from '../../../components/ui/WeatherWidget'
import ExportButton from '../../../components/ui/ExportButton'
import DateNavigator from '../../../components/ui/DateNavigator'
import { exportGunlukRaporPdf, exportGunlukRaporExcel } from '../../../utils/exportUtils'

// ── Periyot yardımcıları ──────────────────────────────────────────────────────
const PERIODS = [
  { key: 'haftalik', label: 'Haftalık' },
  { key: 'aylik',    label: 'Aylık'   },
  { key: 'yillik',   label: 'Yıllık'  },
]

function getPeriodRange(period, offset) {
  if (!period) return null
  const now = new Date()
  let start, end, label

  if (period === 'haftalik') {
    const dow = now.getDay()
    const toMon = dow === 0 ? -6 : 1 - dow
    start = new Date(now); start.setDate(now.getDate() + toMon + offset * 7); start.setHours(0,0,0,0)
    end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999)
    const s = start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
    const e = end.toLocaleDateString('tr-TR',   { day: 'numeric', month: 'short', year: 'numeric' })
    label = `${s} – ${e}`
  } else if (period === 'aylik') {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    start = new Date(d); start.setHours(0,0,0,0)
    end   = new Date(d.getFullYear(), d.getMonth() + 1, 0); end.setHours(23,59,59,999)
    label = d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  } else {
    const y = now.getFullYear() + offset
    start = new Date(y, 0, 1,  0,  0,  0,  0)
    end   = new Date(y, 11, 31, 23, 59, 59, 999)
    label = `${y}`
  }

  return { start, end, label }
}

// ── Sabitler ──────────────────────────────────────────────────────────────────
const STATUS_MAP = {
  completed: { badge: 'blue',  label: 'Tamamlandı',  color: '#22c55e' },
  done:      { badge: 'blue',  label: 'Tamamlandı',  color: '#22c55e' },
  active:    { badge: 'green', label: 'Devam Ediyor', color: 'var(--color-primary)' },
  pending:   { badge: 'amber', label: 'Beklemede',    color: '#f59e0b' },
  late:      { badge: 'red',   label: 'Gecikmiş',     color: '#ef4444' },
}

const KATEGORI_RENK = {
  'santiye':  '#0d9488',
  'mekanik':  '#16a34a',
  'dc':       '#7c3aed',
  'ac':       '#ea580c',
  'og':       '#2563eb',
  'enh':      '#ca8a04',
  'diger':    'var(--color-primary)',
}

function kategoriAnahtari(w) {
  if (w.category) {
    const c = w.category.toLowerCase()
    if (c.includes('şantiye') || c.includes('santiye') || c.includes('mobilizasyon')) return 'santiye'
    if (c.includes('mekanik')) return 'mekanik'
    if (c.includes('dc'))      return 'dc'
    if (c.includes('ac'))      return 'ac'
    if (c.includes('og') || c.includes('enerji nakil')) return 'og'
    if (c.includes('enh'))     return 'enh'
    return c
  }
  const n = (w.name || w.title || '').toLowerCase()
  if (n.includes('arazi') || n.includes('ulaşım') || n.includes('işletme bina') || n.includes('depo'))    return 'santiye'
  if (n.includes('kolon') || n.includes('kiriş') || n.includes('aşık') || n.includes('panel montaj'))    return 'mekanik'
  if (n.includes('dc') || n.includes('kablo reglaj') || n.includes('konnektör') || n.includes('izolasyon')) return 'dc'
  if (n.includes('ac') || n.includes('inverter') || n.includes('ges pano'))                               return 'ac'
  if (n.includes('xlpe') || n.includes('og ') || n.includes('köşk') || n.includes('trafo') || n.includes('scada')) return 'og'
  if (n.includes('enh') || n.includes('enerji nakil'))                                                    return 'enh'
  return 'diger'
}

const KATEGORI_ETIKET = {
  santiye: 'Şantiye Mobilizasyon',
  mekanik: 'Mekanik Bölüm',
  dc:      'Elektriksel — DC',
  ac:      'Elektriksel — AC',
  og:      'Elektriksel — OG',
  enh:     'ENH',
  diger:   'Diğer',
}

// ── Halka (Donut) Grafik ──────────────────────────────────────────────────────
function DonutChart({ pct = 0 }) {
  const [tip, setTip] = useState(false)
  const r = 33, circ = 2 * Math.PI * r
  const p = Math.min(100, Math.max(0, pct))
  const filled = (p / 100) * circ

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <svg width="86" height="86" viewBox="0 0 100 100" style={{ display: 'block' }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#fee2e2" strokeWidth="14" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke="#22c55e" strokeWidth="14"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>%{p}</span>
      </div>
      {tip && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: '#1f2937', color: '#fff', borderRadius: 7, padding: '6px 12px',
          fontSize: 12, whiteSpace: 'nowrap', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,.2)',
        }}>
          <div style={{ color: '#4ade80', marginBottom: 2 }}>Tamamlanan: %{p}</div>
          <div style={{ color: '#f87171' }}>Kalan: %{100 - p}</div>
        </div>
      )}
    </div>
  )
}

// ── Günlük İş Kartı (kompakt, load-more) ────────────────────────────────────
const GUNKART_LIMIT = 4

function GunKart({ baslik, items, accentColor }) {
  const [acildi, setAcildi] = useState(false)
  const gorunen = acildi ? items : items.slice(0, GUNKART_LIMIT)

  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-header">
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>{baslik}</h3>
        <span style={{ fontSize: 11, background: `${accentColor}18`, color: accentColor, borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p style={{ padding: '0.875rem 1.25rem', color: 'var(--color-muted)', fontSize: 12 }}>Kayıtlı iş yok.</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: '0.125rem 0' }}>
            {gorunen.map((w, i) => (
              <li key={w.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.4rem 1rem',
                borderBottom: i < gorunen.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}>
                <span style={{
                  minWidth: 18, height: 18, borderRadius: '50%', background: accentColor,
                  color: '#fff', fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{i + 1}</span>
                <span style={{ color: 'var(--color-text)', fontSize: 12, lineHeight: 1.35 }}>
                  {w.name || w.title || '—'}
                </span>
              </li>
            ))}
          </ul>
          {items.length > GUNKART_LIMIT && (
            <button
              onClick={() => setAcildi(a => !a)}
              style={{
                width: '100%', padding: '0.4rem', border: 'none', borderTop: '1px solid var(--color-border)',
                background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--color-muted)',
                fontFamily: 'inherit', fontWeight: 500,
              }}
            >
              {acildi ? '▲ Daha Az Göster' : `▼ ${items.length - GUNKART_LIMIT} İş Daha Göster`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Günlük Rapor Özet Kartı ───────────────────────────────────────────────────
function GunlukRaporKarti({ ilerlemeData = [], personelRaporu = null }) {
  if (!ilerlemeData.length && !personelRaporu) return null

  const rapor = ilerlemeData[0] || {}

  const tarih = rapor.report_date
    ? new Date(rapor.report_date + 'T00:00:00').toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : personelRaporu?.report_date
      ? new Date(personelRaporu.report_date + 'T00:00:00').toLocaleDateString('tr-TR', {
          day: '2-digit', month: 'long', year: 'numeric',
        })
      : '—'

  const gun = rapor.report_day || ''

  const HAVA_ICON = {
    'Yağmurlu': '🌧', 'Güneşli': '☀️', 'Parçalı Bulutlu': '⛅',
    'Bulutlu': '☁️', 'Karlı': '❄️', 'Rüzgarlı': '💨', 'Sisli': '🌫️',
  }
  const havaIkon = HAVA_ICON[rapor.weather] || '🌤'

  const p = personelRaporu

  const DEPTS = [
    { label: 'İDARİ',     renk: '#374151',
      muhendis: p?.idari_muhendis ?? null, usta: p?.idari_usta ?? null, isci: p?.idari_isci ?? null },
    { label: 'MEKANİK',   renk: '#16a34a',
      muhendis: p?.mekanik_muhendis ?? null, usta: p?.mekanik_usta ?? null, isci: p?.mekanik_isci ?? null },
    { label: 'ELEKTRİK',  renk: '#7c3aed',
      muhendis: p?.elektrik_muhendis ?? null, usta: p?.elektrik_usta ?? null, isci: p?.elektrik_isci ?? null },
    { label: 'YEVMİYECİ', renk: '#0891b2',
      muhendis: p?.yevmiyeci_muhendis ?? null, usta: p?.yevmiyeci_usta ?? null, isci: p?.yevmiyeci_isci ?? null },
  ]

  const toplam = (d) => d.muhendis != null
    ? (d.muhendis || 0) + (d.usta || 0) + (d.isci || 0)
    : null
  const genelToplam = p
    ? DEPTS.reduce((s, d) => s + (toplam(d) || 0), 0)
    : null

  const MAKINALAR = [
    { label: 'Vinç',        val: p?.vinc },
    { label: 'JCB',         val: p?.jcb },
    { label: 'Ekskavatör',  val: p?.ekskavatör },
    { label: 'Loader',      val: p?.loader },
    { label: 'Gayk Delici', val: p?.gayk_delici },
    { label: 'ROK Delim',   val: p?.rok_delim },
    { label: 'Kamyon',      val: p?.kamyon },
    { label: 'Traktör',     val: p?.traktor },
  ]

  const fmt = (v) => v != null ? v : '—'
  const cellStyle = { textAlign: 'center', fontSize: 13 }

  const bugunIsler = ilerlemeData
    .filter(r => r.description?.trim())
    .map(r => r.description)

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      {/* Header */}
      <div className="card-header">
        <h3>Günlük Saha Raporu</h3>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {tarih}{gun ? ` — ${gun}` : ''}
        </span>
      </div>

      {/* Personel Durumu */}
      <div style={{ padding: '0.75rem 1.25rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
          Personel Durumu
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 540 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Vardiya</th>
                {DEPTS.map(d => (
                  <th key={d.label} style={{ color: d.renk, textAlign: 'center' }}>{d.label}</th>
                ))}
                <th style={{ textAlign: 'center' }}>TOPLAM</th>
              </tr>
            </thead>
            <tbody>
              {/* Mühendis satırı */}
              <tr>
                <td style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>Mühendis</td>
                {DEPTS.map(d => (
                  <td key={d.label} style={cellStyle}>{fmt(d.muhendis)}</td>
                ))}
                <td style={{ ...cellStyle, fontWeight: 700 }}>
                  {p ? DEPTS.reduce((s, d) => s + (d.muhendis || 0), 0) : '—'}
                </td>
              </tr>
              {/* Usta satırı */}
              <tr>
                <td style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>Usta</td>
                {DEPTS.map(d => (
                  <td key={d.label} style={cellStyle}>{fmt(d.usta)}</td>
                ))}
                <td style={{ ...cellStyle, fontWeight: 700 }}>
                  {p ? DEPTS.reduce((s, d) => s + (d.usta || 0), 0) : '—'}
                </td>
              </tr>
              {/* İşçi satırı */}
              <tr>
                <td style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>İşçi</td>
                {DEPTS.map(d => (
                  <td key={d.label} style={cellStyle}>{fmt(d.isci)}</td>
                ))}
                <td style={{ ...cellStyle, fontWeight: 700 }}>
                  {p ? DEPTS.reduce((s, d) => s + (d.isci || 0), 0) : '—'}
                </td>
              </tr>
              {/* Toplam satırı */}
              <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                <td style={{ fontSize: 11, fontWeight: 700 }}>TOPLAM</td>
                {DEPTS.map(d => (
                  <td key={d.label} style={{ ...cellStyle, fontWeight: 700, color: d.renk }}>
                    {fmt(toplam(d))}
                  </td>
                ))}
                <td style={{ ...cellStyle, fontWeight: 800, fontSize: 14 }}>
                  {genelToplam ?? '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* İş Makinası Durumu */}
      <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
          İş Makinası Durumu
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {MAKINALAR.map(m => {
            const aktif = m.val != null && m.val > 0
            return (
              <div key={m.label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '0.5rem 0.875rem', borderRadius: 8, minWidth: 72,
                border: `1px solid ${aktif ? '#16a34a40' : 'var(--color-border)'}`,
                background: aktif ? '#f0fdf4' : 'var(--color-surface)',
              }}>
                <span style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 2, textAlign: 'center' }}>{m.label}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: aktif ? '#16a34a' : 'var(--color-muted)' }}>
                  {fmt(m.val)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

// ── Genel İlerleme Durumu Tablosu (PDF formatı) ──────────────────────────────
// items: { id, name, quantity, unit, dailyProgress, totalProgress, progress }
function GenelIlerlemeTablo({ mekanikItems = [], elektrikItems = [] }) {
  const sections = [
    { label: 'MEKANİK',  items: mekanikItems,  renk: '#16a34a' },
    { label: 'ELEKTRİK', items: elektrikItems, renk: '#7c3aed' },
  ].filter(s => s.items.length > 0)

  if (!sections.length) return null

  const fmt = (v) => v != null ? Number(v).toLocaleString('tr-TR') : '—'

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <div className="card-header"><h3>Genel İlerleme Durumu</h3></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ width: 60 }}></th>
              <th>İş Kalemleri</th>
              <th style={{ textAlign: 'right', width: 72 }}>Miktar</th>
              <th style={{ width: 58 }}>Birim</th>
              <th style={{ textAlign: 'right', width: 90 }}>Günlük İlerleme</th>
              <th style={{ textAlign: 'right', width: 90 }}>Toplam İlerleme</th>
              <th style={{ width: 150 }}>İlerleme %</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(({ label, items, renk }) =>
              items.map((item, i) => {
                const pct = item.progress || 0
                return (
                  <tr key={item.id ?? `${label}-${i}`}>
                    {i === 0 && (
                      <td
                        rowSpan={items.length}
                        style={{
                          fontWeight: 700, fontSize: 10, color: renk,
                          background: `${renk}0d`, borderRight: `2px solid ${renk}30`,
                          textAlign: 'center', verticalAlign: 'middle',
                          writingMode: 'vertical-rl', textOrientation: 'mixed',
                          transform: 'rotate(180deg)', padding: '0.375rem 0.25rem',
                          letterSpacing: '0.12em', textTransform: 'uppercase',
                        }}
                      >
                        {label}
                      </td>
                    )}
                    <td style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-text)' }}>{item.name}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-muted)' }}>{fmt(item.quantity)}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{item.unit || '—'}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-muted)' }}>{fmt(item.dailyProgress)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--color-muted)' }}>{fmt(item.totalProgress)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: renk, borderRadius: 4, transition: 'width 0.4s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: renk, width: 34, textAlign: 'right', flexShrink: 0 }}>
                          %{pct}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Bilgi Kartı ───────────────────────────────────────────────────────────────
function InfoItem({ label, value }) {
  return (
    <div style={{ padding: '0.75rem 1rem', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.25rem' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>{value}</p>
    </div>
  )
}

// ── Periyot Trend Grafiği (SVG bar) ─────────────────────────────────────────
function PeriodTrendChart({ rows, period, periodRange }) {
  if (!rows.length) return null

  // Her günün daily_progress toplamını al
  const byDate = {}
  rows.forEach(r => {
    if (!r.report_date || r.daily_progress == null) return
    byDate[r.report_date] = (byDate[r.report_date] || 0) + Number(r.daily_progress)
  })

  const entries = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) return null

  const maxVal = Math.max(...entries.map(([, v]) => v), 1)
  const W = 480, H = 80, barW = Math.max(8, Math.min(32, Math.floor(W / entries.length) - 3))

  const periodLabel = { gunluk: 'Günlük', haftalik: 'Haftalık', aylik: 'Aylık', yillik: 'Yıllık' }

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <div className="card-header">
        <h3>{periodLabel[period] || ''} İlerleme Trendi</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{periodRange.label}</span>
      </div>
      <div style={{ padding: '0.5rem 1.25rem 1rem', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H + 24}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
          {entries.map(([date, val], i) => {
            const barH = Math.max(2, Math.round((val / maxVal) * H))
            const x = i * (barW + 3)
            const y = H - barH
            const d = new Date(date + 'T00:00:00')
            const dayLabel = period === 'yillik'
              ? d.toLocaleDateString('tr-TR', { month: 'short' })
              : period === 'aylik'
                ? d.getDate()
                : d.toLocaleDateString('tr-TR', { weekday: 'short' })
            return (
              <g key={date}>
                <rect x={x} y={y} width={barW} height={barH} rx={3} fill="#185FA5" opacity={0.8} />
                <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={8} fill="#9CA3AF">{dayLabel}</text>
                <title>{date}: {val}</title>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Genel Dashboard ──────────────────────────────────────────────────────────
function GenelDashboard({ project, workPackages, allIlerleme = [], personelRaporu = null, period = 'gunluk', periodRange }) {
  const [filterStatus, setFilterStatus] = useState('hepsi')
  const [gorunenSayi, setGorunenSayi]   = useState(5)

  const { start: periodStart, end: periodEnd } = periodRange || {}

  // İlerleme satırlarını periyota göre filtrele
  const ilerlemeData = allIlerleme.filter(r => {
    if (!r.report_date) return false
    const d = new Date(r.report_date + 'T00:00:00')
    if (!period) {
      // En son tarih
      const latestDate = allIlerleme[0]?.report_date
      return r.report_date === latestDate
    }
    return periodStart && periodEnd ? d >= periodStart && d <= periodEnd : true
  })

  // İş paketlerini periyota göre filtrele (günlük = tümü, diğerleri = due_date periyotta olanlar)
  const periodWPs = !period ? workPackages : workPackages.filter(w => {
    if (!w.due_date) return true
    const d = new Date(w.due_date)
    return periodStart && periodEnd ? d >= periodStart && d <= periodEnd : true
  })

  const total     = workPackages.length
  const completed = periodWPs.filter(w => w.status === 'completed' || w.status === 'done').length
  const late      = periodWPs.filter(w => w.status === 'late').length
  const avgPct    = total ? Math.round(workPackages.reduce((s, w) => s + (w.progress || 0), 0) / total) : 0

  // Periyot günlük ilerleme toplamı
  const periodProgressSum = allIlerleme
    .filter(r => {
      if (!r.report_date || r.daily_progress == null) return false
      const d = new Date(r.report_date + 'T00:00:00')
      return periodStart && periodEnd ? d >= periodStart && d <= periodEnd : false
    })
    .reduce((s, r) => s + Number(r.daily_progress || 0), 0)

  const city = project?.location ? project.location.split('/')[0].trim() : null

  // Trend grafiği için periyot ilerleme satırları
  const trendRows = !period ? [] : allIlerleme.filter(r => {
    if (!r.report_date || r.daily_progress == null) return false
    const d = new Date(r.report_date + 'T00:00:00')
    return periodStart && periodEnd ? d >= periodStart && d <= periodEnd : false
  })

  // gunluk_ilerleme_örnek varsa oradan al, yoksa work_packages'tan türet
  const normalize = (r) => ({
    id:             r.id || r.work_item,
    name:           r.work_item || r.name || r.title || '—',
    quantity:       r.quantity      ?? null,
    unit:           r.unit          ?? r.birim ?? null,
    dailyProgress:  r.daily_progress ?? null,
    totalProgress:  r.total_progress ?? null,
    progress:       r.progress_percent ?? r.progress ?? 0,
  })

  const mekanikItems = ilerlemeData.length > 0
    ? ilerlemeData.filter(r => r.category?.toUpperCase() === 'MEKANİK').map(normalize)
    : workPackages.filter(w => ['mekanik', 'santiye'].includes(kategoriAnahtari(w))).map(normalize)

  const elektrikItems = ilerlemeData.length > 0
    ? ilerlemeData.filter(r => r.category?.toUpperCase() === 'ELEKTRİK').map(normalize)
    : workPackages.filter(w => ['dc', 'ac', 'og', 'enh'].includes(kategoriAnahtari(w))).map(normalize)

  const wpFiltered = periodWPs.filter(w => filterStatus === 'hepsi' || w.status === filterStatus)
  const filtered   = wpFiltered
  const visible    = filtered.slice(0, gorunenSayi)

  const periodLabel = { haftalik: 'bu hafta', aylik: 'bu ay', yillik: 'bu yıl' }

  return (
    <div>
      {/* ── KPI + Hava Durumu ─────────────────────────── */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', marginBottom: '1.25rem' }}>

        {[
          {
            label: !period ? 'Toplam İş Paketi' : 'Periyot Paketi',
            value: !period ? total : periodWPs.length,
            note:  !period ? 'Kayıtlı görev sayısı' : `${periodRange?.label || ''} vadeli`,
            cls: '',
          },
          {
            label: 'Tamamlandı',
            value: completed,
            note: `${periodWPs.length ? Math.round(completed / periodWPs.length * 100) : 0}% ${periodLabel[period] || ''}`,
            cls: '',
          },
          !!period && periodProgressSum > 0
            ? { label: 'Dönem İlerlemesi', value: periodProgressSum.toFixed(1), note: 'Toplam daily_progress', cls: 'primary-text' }
            : { label: 'Gecikmiş', value: late, note: 'Takvim dışı görev', cls: late > 0 ? 'red-text' : '' },
        ].map(k => (
          <div key={k.label} className="stat-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p className="stat-label">{k.label}</p>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <p className={`stat-value ${k.cls}`} style={{ margin: 0 }}>{k.value}</p>
            </div>
            <p className="stat-note">{k.note}</p>
          </div>
        ))}

        {/* Halka grafik */}
        <div className="stat-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p className="stat-label" style={{ alignSelf: 'stretch' }}>Genel İlerleme</p>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DonutChart pct={avgPct} />
          </div>
          <p className="stat-note" style={{ alignSelf: 'stretch' }}>Ortalama tamamlanma</p>
        </div>

        {/* Hava durumu */}
        {city && (
          <div className="stat-card" style={{ flexShrink: 0, width: 265, display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="stat-label" style={{ margin: 0 }}>Hava Durumu</p>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{city}</span>
            </div>
            <WeatherWidget location={city} size="full" />
          </div>
        )}
      </div>

      {/* ── Proje Bilgisi ─────────────────────────────── */}
      {project && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="card-header"><h3>Proje Bilgisi</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', padding: '0.25rem 0' }}>
            <InfoItem label="Konum"          value={project.location || '—'} />
            <InfoItem label="Kapasite (kWp)" value={project.capacity_kwp ? `${(project.capacity_kwp / 1000).toFixed(2)} MWp` : '—'} />
            <InfoItem label="Kapasite (kWe)" value={project.capacity_kwe ? project.capacity_kwe.toLocaleString('tr-TR') + ' kWe' : '—'} />
            <InfoItem label="Başlangıç"      value={project.start_date  ? new Date(project.start_date).toLocaleDateString('tr-TR')  : '—'} />
            <InfoItem label="Hedef Tarih"    value={project.target_date ? new Date(project.target_date).toLocaleDateString('tr-TR') : '—'} />
            <InfoItem label="Toplam Süre"    value={project.total_days  ? `${project.total_days} gün` : '—'} />
          </div>
        </div>
      )}

      {/* ── Günlük Rapor Kartı (sadece günlük modda) ── */}
      {!period && (
        <GunlukRaporKarti ilerlemeData={ilerlemeData} personelRaporu={personelRaporu} />
      )}

      {/* ── Periyot Trend Grafiği (günlük dışında) ── */}
      {!!period && trendRows.length > 0 && (
        <PeriodTrendChart rows={trendRows} period={period} periodRange={periodRange} />
      )}

      {/* ── Genel İlerleme Durumu Tablosu ── */}
      <GenelIlerlemeTablo mekanikItems={mekanikItems} elektrikItems={elektrikItems} />

      {/* ── İş Paketleri ─────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>
            İş Paketleri
            {!!period && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-muted)', marginLeft: 8 }}>
                — {periodRange?.label || ''}
              </span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setGorunenSayi(5) }}
              style={{ border: '1px solid var(--color-border)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--color-text)', background: '#fff', cursor: 'pointer' }}
            >
              <option value="hepsi">Tümü</option>
              <option value="active">Devam Ediyor</option>
              <option value="pending">Beklemede</option>
              <option value="completed">Tamamlandı</option>
              <option value="done">Tamamlandı (done)</option>
              <option value="late">Gecikmiş</option>
            </select>
            <ExportButton
              title="İş Paketleri"
              disabled={!filtered.length}
              getData={() => ({
                columns: ['İş Paketi', 'Kategori', 'Durum', 'Başlangıç', 'Bitiş', 'İlerleme %'],
                rows: filtered.map(w => [
                  w.name || w.title || '—',
                  KATEGORI_ETIKET[kategoriAnahtari(w)] || '—',
                  STATUS_MAP[w.status]?.label || w.status || '—',
                  w.start_date ? new Date(w.start_date).toLocaleDateString('tr-TR') : '—',
                  w.due_date   ? new Date(w.due_date).toLocaleDateString('tr-TR')   : '—',
                  `%${w.progress || 0}`,
                ]),
              })}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p style={{ padding: '1.5rem', color: 'var(--color-muted)', textAlign: 'center' }}>Veri bulunamadı.</p>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>İş Paketi</th>
                  <th>Durum</th>
                  <th>Başlangıç</th>
                  <th>Bitiş</th>
                  <th style={{ width: 160 }}>İlerleme</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(w => {
                  const s = STATUS_MAP[w.status] || { badge: 'blue', label: w.status || 'Aktif' }
                  return (
                    <tr key={w.id}>
                      <td className="fw">{w.name || w.title || '—'}</td>
                      <td><span className={`badge ${s.badge}`}>● {s.label}</span></td>
                      <td style={{ fontSize: 13, color: 'var(--color-muted)' }}>{w.start_date ? new Date(w.start_date).toLocaleDateString('tr-TR') : '—'}</td>
                      <td style={{ fontSize: 13, color: 'var(--color-muted)' }}>{w.due_date   ? new Date(w.due_date).toLocaleDateString('tr-TR')   : '—'}</td>
                      <td><ProgBar pct={w.progress || 0} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length > gorunenSayi && (
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                <button
                  onClick={() => setGorunenSayi(n => n + 5)}
                  style={{ padding: '7px 20px', border: '1px solid var(--color-border)', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--color-text)', fontWeight: 500 }}
                >
                  Devamını Yükle ({filtered.length - gorunenSayi} kalan)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── İş Planı (Excel-style Gantt tablosu) ────────────────────────────────────
function IsPlanPanel({ workPackages, project }) {
  const withDates = workPackages.filter(w => w.start_date && w.due_date)

  if (withDates.length === 0) {
    return (
      <div className="card">
        <div className="card-header"><h3>Gantt İş Planı</h3></div>
        <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>
          Tarih bilgisi olan iş paketi bulunamadı.
        </p>
      </div>
    )
  }

  const minTs = Math.min(...withDates.map(w => new Date(w.start_date).getTime()))
  const maxTs = Math.max(...withDates.map(w => new Date(w.due_date).getTime()))

  // Ay listesi
  const months = []
  let cur = new Date(new Date(minTs).getFullYear(), new Date(minTs).getMonth(), 1)
  while (cur.getTime() <= maxTs) {
    months.push({ label: cur.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase(), year: cur.getFullYear(), month: cur.getMonth() })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  // Kategori gruplama
  const SIRALAMA = ['santiye', 'mekanik', 'dc', 'ac', 'og', 'enh', 'diger']
  const grouped  = {}
  withDates.forEach(w => {
    const k = kategoriAnahtari(w)
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(w)
  })
  const grupSirali = SIRALAMA.filter(k => grouped[k])

  const KAT_STIL = {
    santiye: { bg: '#1e40af', text: '#fff', label: 'ŞANTİYE MOBİLİZASYON', prefix: 'S' },
    mekanik: { bg: '#15803d', text: '#fff', label: 'MEKANİK BÖLÜM',         prefix: 'M' },
    dc:      { bg: '#6d28d9', text: '#fff', label: 'ELEKTRİKSEL — DC',       prefix: 'E' },
    ac:      { bg: '#c2410c', text: '#fff', label: 'ELEKTRİKSEL — AC',       prefix: 'E' },
    og:      { bg: '#0369a1', text: '#fff', label: 'ELEKTRİKSEL — OG',       prefix: 'E' },
    enh:     { bg: '#92400e', text: '#fff', label: 'ENH',                     prefix: 'N' },
    diger:   { bg: '#475569', text: '#fff', label: 'DİĞER',                   prefix: 'D' },
  }

  const today     = new Date()
  const showToday = today.getTime() >= minTs && today.getTime() <= maxTs

  // Sütun genişlikleri
  const W_NO   = 44
  const W_ISIM = 200
  const W_BAS  = 82
  const W_BIT  = 82
  const W_SURE = 54
  const W_PCT  = 64
  const W_MON  = 110

  const cell = {
    flexShrink: 0, padding: '4px 6px', borderRight: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center',
  }
  const th = {
    ...cell, background: '#1e293b', color: '#f1f5f9',
    fontSize: 10, fontWeight: 700, justifyContent: 'center',
    borderRight: '1px solid #334155', borderBottom: '2px solid #475569',
    whiteSpace: 'nowrap',
  }

  return (
    <div className="card">
      {/* Başlık */}
      <div className="card-header">
        <div>
          <h3 style={{ marginBottom: 2 }}>Gantt İş Planı</h3>
          {project && (
            <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>
              {project.name}
              {project.capacity_kwp && ` · ${(project.capacity_kwp / 1000).toFixed(3)} MWp`}
              {project.location && ` · ${project.location}`}
              {project.start_date && ` · Başlangıç: ${new Date(project.start_date).toLocaleDateString('tr-TR')}`}
              {project.target_date && ` · Bitiş: ${new Date(project.target_date).toLocaleDateString('tr-TR')}`}
              {project.total_days && ` · Toplam: ~${project.total_days} Takvim Günü`}
            </p>
          )}
        </div>
        {showToday && (
          <span style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 2, height: 12, background: '#ef4444', borderRadius: 1, display: 'inline-block' }} />
            Bugün: {today.toLocaleDateString('tr-TR')}
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: W_NO + W_ISIM + W_BAS + W_BIT + W_SURE + W_PCT + months.length * W_MON }}>

          {/* Tablo başlıkları */}
          <div style={{ display: 'flex' }}>
            <div style={{ ...th, width: W_NO }}>No</div>
            <div style={{ ...th, width: W_ISIM, justifyContent: 'flex-start' }}>İŞ KALEMİ / BÖLÜM</div>
            <div style={{ ...th, width: W_BAS }}>BAŞLANGIÇ</div>
            <div style={{ ...th, width: W_BIT }}>BİTİŞ</div>
            <div style={{ ...th, width: W_SURE }}>SÜRE</div>
            <div style={{ ...th, width: W_PCT }}>İLERLEME</div>
            {months.map((m, i) => (
              <div key={i} style={{ ...th, width: W_MON, background: '#1e3a5f', justifyContent: 'center' }}>
                {m.label}
              </div>
            ))}
          </div>

          {/* Kategoriler ve satırlar */}
          {grupSirali.map(k => {
            const stil  = KAT_STIL[k] || KAT_STIL.diger
            const renk  = KATEGORI_RENK[k] || '#64748b'
            const items = grouped[k]

            return (
              <div key={k}>
                {/* Kategori başlık satırı */}
                <div style={{ display: 'flex', background: stil.bg, minHeight: 28 }}>
                  <div style={{ width: W_NO, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.15)' }} />
                  <div style={{
                    width: W_ISIM + W_BAS + W_BIT + W_SURE + W_PCT,
                    flexShrink: 0, padding: '5px 10px',
                    color: stil.text, fontSize: 11, fontWeight: 800,
                    letterSpacing: '0.06em', borderRight: '1px solid rgba(255,255,255,0.15)',
                  }}>
                    ▶ {stil.label}
                  </div>
                  {months.map((m, mi) => (
                    <div key={mi} style={{ width: W_MON, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.1)' }} />
                  ))}
                </div>

                {/* Görev satırları */}
                {items.map((w, i) => {
                  const start = new Date(w.start_date).getTime()
                  const end   = new Date(w.due_date).getTime()
                  const sure  = Math.round((end - start) / 86400000)
                  const pct   = w.progress || 0

                  return (
                    <div key={w.id} style={{
                      display: 'flex', minHeight: 34,
                      background: i % 2 === 0 ? '#ffffff' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                    }}>
                      {/* No */}
                      <div style={{ ...cell, width: W_NO, justifyContent: 'center', fontSize: 10, fontWeight: 700, color: renk }}>
                        {stil.prefix}{i + 1}
                      </div>
                      {/* İş kalemi */}
                      <div style={{ ...cell, width: W_ISIM, fontSize: 12, color: 'var(--color-text)', overflow: 'hidden' }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {w.name || w.title || '—'}
                        </span>
                      </div>
                      {/* Başlangıç */}
                      <div style={{ ...cell, width: W_BAS, justifyContent: 'center', fontSize: 11, color: 'var(--color-muted)' }}>
                        {new Date(w.start_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      {/* Bitiş */}
                      <div style={{ ...cell, width: W_BIT, justifyContent: 'center', fontSize: 11, color: 'var(--color-muted)' }}>
                        {new Date(w.due_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      {/* Süre */}
                      <div style={{ ...cell, width: W_SURE, justifyContent: 'center', fontSize: 11, color: 'var(--color-muted)' }}>
                        {sure}
                      </div>
                      {/* İlerleme */}
                      <div style={{ ...cell, width: W_PCT, justifyContent: 'center', fontSize: 11, fontWeight: 700, color: pct > 0 ? '#16a34a' : 'var(--color-muted)' }}>
                        %{pct}
                      </div>
                      {/* Ay bazlı Gantt barları */}
                      {months.map((m, mi) => {
                        const mStart = new Date(m.year, m.month, 1).getTime()
                        const mEnd   = new Date(m.year, m.month + 1, 0, 23, 59, 59).getTime()

                        const barS = Math.max(start, mStart)
                        const barE = Math.min(end, mEnd)

                        const isToday = showToday && today.getTime() >= mStart && today.getTime() <= mEnd
                        const todayX  = isToday ? (today.getTime() - mStart) / (mEnd - mStart) * 100 : null

                        if (barS > barE) {
                          return (
                            <div key={mi} style={{ width: W_MON, flexShrink: 0, position: 'relative', borderRight: '1px solid #e2e8f0', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              {todayX !== null && <div style={{ position: 'absolute', left: `${todayX}%`, top: 0, bottom: 0, width: 1.5, background: '#ef444488', zIndex: 2 }} />}
                            </div>
                          )
                        }

                        const leftPct  = (barS - mStart) / (mEnd - mStart) * 100
                        const widthPct = Math.max(2, (barE - barS) / (mEnd - mStart) * 100)

                        return (
                          <div key={mi} style={{ width: W_MON, flexShrink: 0, position: 'relative', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            {todayX !== null && <div style={{ position: 'absolute', left: `${todayX}%`, top: 0, bottom: 0, width: 1.5, background: '#ef444488', zIndex: 2 }} />}
                            <div style={{
                              position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`,
                              height: 18, borderRadius: 3, overflow: 'hidden',
                              background: `${renk}22`, border: `1.5px solid ${renk}70`,
                              zIndex: 1,
                            }}>
                              {pct > 0 && <div style={{ width: `${pct}%`, height: '100%', background: renk, opacity: 0.75 }} />}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1.25rem', padding: '0.75rem 1rem', borderTop: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
            {grupSirali.map(k => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 11, color: 'var(--color-muted)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: KATEGORI_RENK[k], display: 'inline-block' }} />
                {KAT_STIL[k]?.label || KATEGORI_ETIKET[k]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Stil sabitleri ─────────────────────────────────────────────────────────────
const tabBtn = {
  padding: '6px 14px', borderRadius: 7, border: '1px solid var(--color-border)',
  background: 'transparent', color: 'var(--color-text)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
}
const tabBtnActive = {
  ...tabBtn, background: 'var(--color-primary)', color: '#fff',
  borderColor: 'var(--color-primary)', fontWeight: 600,
}
const backBtn = {
  padding: '6px 12px', borderRadius: 7, border: '1px solid var(--color-border)',
  background: 'transparent', color: 'var(--color-muted)', fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
  gap: '0.3rem', transition: 'all 0.15s',
}

// ── Ana Bileşen ───────────────────────────────────────────────────────────────
export default function ProjeDetay({ projectId, projectName, onBack, selectedDate, setSelectedDate }) {
  const [tab, setTab]                = useState('genel')
  const [project, setProject]        = useState(null)
  const [wps, setWPs]                = useState([])
  const [allIlerleme, setAllIlerleme] = useState([])
  const [period, setPeriod]          = useState(null)   // null = günlük (Tarih Seç ile)
  const [periodOffset, setPeriodOffset] = useState(0)
  const [personelRaporu, setPersonelRaporu] = useState(null)
  const [loading, setLoading]        = useState(true)
  const [showCal, setShowCal]        = useState(false)
  const [calPos, setCalPos]          = useState({ top: 0, right: 0 })
  const [showExportMenu, setShowExportMenu] = useState(false)
  const calRef    = useRef(null)
  const calBtnRef = useRef(null)
  const exportRef = useRef(null)

  useEffect(() => {
    function handleOut(e) {
      if (calRef.current    && !calRef.current.contains(e.target) && !calBtnRef.current?.contains(e.target)) setShowCal(false)
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false)
    }
    if (showCal || showExportMenu) document.addEventListener('mousedown', handleOut)
    return () => document.removeEventListener('mousedown', handleOut)
  }, [showCal, showExportMenu])

  function openCal() {
    if (calBtnRef.current) {
      const r = calBtnRef.current.getBoundingClientRect()
      setCalPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setShowCal(v => !v)
  }

  function handleExport(type) {
    setShowExportMenu(false)
    // Export için en güncel ilerleme satırlarını kullan
    const latestDate = allIlerleme[0]?.report_date
    const exportIlerleme = latestDate ? allIlerleme.filter(r => r.report_date === latestDate) : []
    const opts = { selectedDate, projectName }
    if (type === 'pdf') {
      exportGunlukRaporPdf(project, wps, exportIlerleme, personelRaporu, opts)
    } else {
      exportGunlukRaporExcel(project, wps, exportIlerleme, personelRaporu, opts)
    }
  }

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      getProjects(),
      getWorkPackages(projectId),
      projectName ? getGunlukIlerleme(projectName) : Promise.resolve({ data: [] }),
      getPersonelMakineRaporu(),
    ]).then(([{ data: pData }, { data: wData }, { data: iData }, pRapor]) => {
      setProject(pData?.find(p => p.id === projectId) || null)

      const seen = new Set()
      const deduped = (wData || []).filter(w => {
        const key = (w.name || w.title || '').trim().toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setWPs(deduped)

      setAllIlerleme(iData || [])

      setPersonelRaporu(pRapor?.data || null)
      setLoading(false)
    })
  }, [projectId, projectName])

  return (
    <div>
      {/* Eylem çubuğu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={backBtn}>← Projelere Dön</button>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={() => setTab('genel')} style={tab === 'genel' ? tabBtnActive : tabBtn}>
            Genel Dashboard
          </button>
          <button onClick={() => setTab('gantt')} style={tab === 'gantt' ? tabBtnActive : tabBtn}>
            İş Planı
          </button>
        </div>

        {/* ── Sağ grup: Tarih Seç + Dışa Aktar ── */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>

          {/* Tarih Seç */}
          {setSelectedDate && (
            <div style={{ position: 'relative' }}>
              <button
                ref={calBtnRef}
                onClick={openCal}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px',
                  background: selectedDate ? '#185FA5' : '#fff',
                  color: selectedDate ? '#fff' : 'var(--color-text)',
                  border: selectedDate ? 'none' : '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: selectedDate ? '0 2px 8px rgba(24,95,165,0.22)' : 'none',
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

          {/* Dışa Aktar */}
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu(v => !v)}
              disabled={!wps.length}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                background: '#fff',
                color: !wps.length ? '#9ca3af' : 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 13, fontWeight: 500,
                cursor: !wps.length ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (wps.length) e.currentTarget.style.background = '#f8fafc' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Dışa Aktar
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {showExportMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
                background: '#fff', border: '1px solid var(--color-border)',
                borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,.10)',
                padding: '0.875rem', minWidth: 220,
              }}>
                {selectedDate && (
                  <div style={{ marginBottom: '0.625rem', padding: '6px 10px', background: '#FEF3C7', borderRadius: 6, fontSize: 11, color: '#92400E', fontWeight: 600 }}>
                    {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} raporu
                  </div>
                )}
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem' }}>
                  Kapsamlı Günlük Rapor
                </p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                  KPI, personel, ilerleme durumu,<br/>iş paketleri — tam Fons Solar teması
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
                  <button
                    onClick={() => handleExport('excel')}
                    style={{ flex: 1, padding: '8px 0', background: '#166534', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/>
                    </svg>
                    Excel
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    style={{ flex: 1, padding: '8px 0', background: '#991b1b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Periyot Seçici ─────────────────────────────────────────── */}
      {tab === 'genel' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          marginBottom: '1.25rem', flexWrap: 'wrap',
        }}>
          {/* Period tabs */}
          <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 10, padding: 3, gap: 2 }}>
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => { setPeriod(prev => prev === p.key ? null : p.key); setPeriodOffset(0) }}
                style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  background: period === p.key ? '#fff' : 'transparent',
                  color: period === p.key ? '#185FA5' : '#6B7280',
                  boxShadow: period === p.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}
              >{p.label}</button>
            ))}
          </div>

          {/* Period navigator — sadece aktif period varsa */}
          {period && (() => {
            const { label } = getPeriodRange(period, periodOffset) || {}
            const isNow = periodOffset === 0
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => setPeriodOffset(o => o - 1)}
                  style={{ all: 'unset', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 15, color: '#374151', boxSizing: 'border-box', fontFamily: 'inherit' }}
                >‹</button>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', minWidth: 160, textAlign: 'center' }}>
                  {label}
                </span>
                <button
                  onClick={() => setPeriodOffset(o => o + 1)}
                  disabled={isNow}
                  style={{ all: 'unset', cursor: isNow ? 'default' : 'pointer', opacity: isNow ? 0.3 : 1, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 15, color: '#374151', boxSizing: 'border-box', fontFamily: 'inherit' }}
                >›</button>
                {periodOffset !== 0 && (
                  <button
                    onClick={() => setPeriodOffset(0)}
                    style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: '#185FA5', fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#EFF6FF', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  >Şimdiye Dön</button>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--color-muted)', padding: '2rem' }}>Yükleniyor…</p>
      ) : tab === 'genel' ? (
        <GenelDashboard
          project={project}
          workPackages={wps}
          allIlerleme={allIlerleme}
          personelRaporu={personelRaporu}
          period={period}
          periodRange={period ? getPeriodRange(period, periodOffset) : null}
        />
      ) : (
        <IsPlanPanel workPackages={wps} project={project} />
      )}
    </div>
  )
}
