import { useState, useEffect } from 'react'
import { unzipSync, strFromU8, strToU8 } from 'fflate'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { useWeather } from '../../../hooks/useWeather'
import YeniTicketModal from '../../../components/tickets/YeniTicketModal'
import YeniTalepModal from '../../../components/satin-alma/YeniTalepModal'
import TicketDetayModal from '../../../components/tickets/TicketDetayModal'
import GunlukRaporDrawer from '../../../components/daily-report/GunlukRaporDrawer'
import {
  downloadXlsxZip,
  fetchXlsxTemplate,
  fillTemplateSheet,
  formatExcelDate,
  setTemplateCell,
} from '../../../utils/excelUtils'

const TICKET_STATUS = {
  'gönderildi':   { bg: '#DBEAFE', color: '#1D4ED8', label: 'Gönderildi' },
  'açık':         { bg: '#DBEAFE', color: '#1D4ED8', label: 'Gönderildi' },
  'işlemde':      { bg: '#FEF3C7', color: '#92400E', label: 'İşlemde' },
  'kapatıldı':    { bg: '#D1FAE5', color: '#065F46', label: 'Kapatıldı' },
  'iptal_edildi': { bg: '#F3F4F6', color: '#9CA3AF', label: 'İptal Edildi' },
}
const TICKET_CAT = {
  'genel':    { bg: '#F3F4F6', color: '#6B7280' },
  'elektrik': { bg: '#EFF6FF', color: '#185FA5' },
  'mekanik':  { bg: '#F5F3FF', color: '#7C3AED' },
}
const PR_STATUS = {
  bekliyor:       { bg: '#DBEAFE', color: '#1D4ED8', label: 'Bekliyor' },
  onaylandı:      { bg: '#D1FAE5', color: '#065F46', label: 'Onaylandı' },
  reddedildi:     { bg: '#FEE2E2', color: '#991B1B', label: 'Reddedildi' },
  fatura_kesildi: { bg: '#F3E8FF', color: '#6D28D9', label: 'Fatura Kesildi' },
}
const PR_URGENCY = {
  normal:   { bg: '#F3F4F6', color: '#6B7280', label: 'Normal' },
  acil:     { bg: '#FEF3C7', color: '#92400E', label: 'Acil' },
  çok_acil: { bg: '#FEE2E2', color: '#991B1B', label: 'Çok Acil' },
}
const WP_STATUS = {
  tamamlandi:   { color: '#10B981', label: 'Tamamlandı' },
  devam_ediyor: { color: '#185FA5', label: 'Devam Ediyor' },
  beklemede:    { color: '#9CA3AF', label: 'Beklemede' },
  askida:       { color: '#EF4444', label: 'Askıda' },
}

const DAILY_REPORT_MACHINE_ROWS = [
  { row: 22, keys: ['ekskavatör', 'ekskavator'] },
  { row: 23, keys: ['rok_delim', 'rok', 'delgi'] },
  { row: 24, keys: ['kolon', 'çakım', 'cakim', 'gayk_delici'] },
  { row: 25, keys: ['forklift', 'loader', 'jcb'] },
  { row: 26, keys: ['vinç', 'vinc'] },
  { row: 27, keys: ['kamyon', 'nakliye', 'traktör', 'traktor'] },
]

function Badge({ map, value }) {
  const b = map[value] || { bg: '#F3F4F6', color: '#374151', label: value || '—' }
  return (
    <span style={{ background: b.bg, color: b.color, fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      {b.label}
    </span>
  )
}

function todayStr() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function Donut({ data, size = 108 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = 40, cx = 54, cy = 54
  const circ = 2 * Math.PI * r
  let cumPct = 0
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={16} />
      {data.filter(d => d.value > 0).map((d, i) => {
        const pct = d.value / total
        const dashLen = pct * circ
        const rotation = cumPct * 360
        cumPct += pct
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={16}
            strokeDasharray={`${dashLen} ${circ - dashLen}`}
            transform={`rotate(${rotation} ${cx} ${cy})`}
          />
        )
      })}
    </svg>
  )
}

export default function TabSantiyeSefi() {
  const { user, projectId } = useAuth()
  const [project, setProject]         = useState(null)
  const [wpStats, setWpStats]         = useState({ tamamlandı: 0, aktif: 0, bekliyor: 0, gecikmiş: 0 })
  const [tickets, setTickets]         = useState([])
  const [prs, setPrs]                 = useState([])
  const [todayReport, setTodayReport] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [showRapor, setShowRapor]     = useState(false)
  const [showTicket, setShowTicket]   = useState(false)
  const [showTalep, setShowTalep]     = useState(false)
  const [detayTicket, setDetayTicket] = useState(null)
  const [refreshKey, setRefreshKey]   = useState(0)
  const [exportingReport, setExportingReport] = useState(false)
  const [exportError, setExportError] = useState('')

  const refresh = () => setRefreshKey(k => k + 1)

  useEffect(() => {
    if (!projectId || !user) return
    const today = todayStr()
    async function load() {
      const [projRes, wpRes, tickRes, prRes, reportRes] = await Promise.all([
        supabase.from('projects').select('id, name, location, progress, target_date').eq('id', projectId).single(),
        supabase.from('project_tasks').select('status').eq('project_id', projectId),
        supabase.from('tickets')
          .select('id, title, category, severity, status, created_at, created_by')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('purchase_requests')
          .select('id, title, urgency, status, created_at')
          .eq('project_id', projectId)
          .eq('requested_by', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('daily_reports')
          .select('id').eq('project_id', projectId).eq('report_date', today).maybeSingle(),
      ])
      if (projRes.data) setProject(projRes.data)
      if (wpRes.data) {
        const counts = { tamamlandi: 0, devam_ediyor: 0, beklemede: 0, askida: 0 }
        wpRes.data.forEach(w => { if (counts[w.status] !== undefined) counts[w.status]++ })
        setWpStats(counts)
      }
      setTickets(tickRes.data || [])
      setPrs(prRes.data || [])
      setTodayReport(reportRes.data || null)
      setLoading(false)
    }
    load()
  }, [projectId, user, refreshKey])

  const cityName = project?.location?.split('/')?.[0]?.trim() || project?.location || null
  const { current: wx, tomorrow: wxTmr } = useWeather(cityName)

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—'
  const fmtLong = (d) => d ? new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  const donutData = Object.entries(WP_STATUS).map(([k, v]) => ({ color: v.color, value: wpStats[k] || 0 }))

  const CARD = {
    background: '#fff', border: '1px solid #E5E7EB', borderLeft: '3px solid #185FA5',
    borderRadius: 12, padding: '14px 18px',
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    boxShadow: '0 1px 3px rgba(0,0,0,.06)', transition: 'box-shadow 0.15s',
  }

  async function getProgressTotalsByDate(date) {
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('id')
      .eq('project_id', projectId)
      .lte('report_date', date)

    const reportIds = (reports || []).map(r => r.id)
    if (!reportIds.length) return new Map()

    const { data: rows } = await supabase
      .from('progress_daily')
      .select('item_id, qty_added')
      .in('report_id', reportIds)

    const totals = new Map()
    ;(rows || []).forEach(row => {
      totals.set(row.item_id, (totals.get(row.item_id) || 0) + Number(row.qty_added || 0))
    })
    return totals
  }

  const normalize = value => String(value || '').toLowerCase()
  const sumCount = (rows, predicate) => (rows || []).filter(predicate).reduce((sum, row) => sum + Number(row.count || 0), 0)

  async function handleDailyReportExport(event) {
    event?.stopPropagation?.()
    if (!projectId) return

    const today = todayStr()
    setExportingReport(true)
    setExportError('')

    try {
      const templateBuffer = await fetchXlsxTemplate([
        '/fons-solar-gunluk-rapor-sablonu.xlsx',
        '/excel/fons-solar-gunluk-rapor-sablonu.xlsx',
      ])
      const files = unzipSync(new Uint8Array(templateBuffer))

      const [{ data: todayReportRow }, { data: latestReportRow }] = await Promise.all([
        supabase
          .from('daily_reports')
          .select('*')
          .eq('project_id', projectId)
          .eq('report_date', today)
          .maybeSingle(),
        supabase
          .from('daily_reports')
          .select('*')
          .eq('project_id', projectId)
          .order('report_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      const report = todayReportRow || latestReportRow
      const exportDate = report?.report_date || today

      const reportId = report?.id
      const [
        { data: profile },
        { data: progressItems },
        { data: tasks },
        personnelRes,
        machineryRes,
        progressTotals,
      ] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', report?.created_by || user?.id).maybeSingle(),
        supabase.from('progress_items').select('*').eq('project_id', projectId).order('order_index'),
        supabase.from('project_tasks').select('*').eq('project_id', projectId).in('status', ['devam_ediyor', 'tamamlandi']).order('task_code'),
        reportId ? supabase.from('personnel_log_entries').select('*').eq('report_id', reportId) : Promise.resolve({ data: [] }),
        reportId ? supabase.from('machinery_logs').select('*').eq('report_id', reportId) : Promise.resolve({ data: [] }),
        getProgressTotalsByDate(exportDate),
      ])

      const personnel = personnelRes.data || []
      const machinery = machineryRes.data || []
      const personelCount = (departmentKeys, shiftKeys = []) => sumCount(personnel, row => {
        const department = normalize(row.department)
        const shift = normalize(row.shift)
        return departmentKeys.some(key => department.includes(key))
          && (!shiftKeys.length || shiftKeys.some(key => shift.includes(key)))
      })

      let reportXml = strFromU8(files['xl/worksheets/sheet1.xml'])
      reportXml = setTemplateCell(reportXml, 'E4', projectId)
      reportXml = setTemplateCell(reportXml, 'E5', formatExcelDate(exportDate))
      reportXml = setTemplateCell(reportXml, 'E6', profile?.full_name || profile?.email || user?.email || '')
      reportXml = setTemplateCell(reportXml, 'E7', report?.weather || '')
      reportXml = setTemplateCell(reportXml, 'E8', report?.notes || '')
      reportXml = setTemplateCell(reportXml, 'D12', personelCount(['mekanik']))
      reportXml = setTemplateCell(reportXml, 'D13', 0)
      reportXml = setTemplateCell(reportXml, 'D14', personelCount(['elektrik']))
      reportXml = setTemplateCell(reportXml, 'D15', 0)
      reportXml = setTemplateCell(reportXml, 'D16', personelCount(['yevmiyeci']))
      reportXml = setTemplateCell(reportXml, 'D17', personelCount(['idari', 'teknik']))

      DAILY_REPORT_MACHINE_ROWS.forEach(({ row, keys }) => {
        const matching = machinery.filter(machine => keys.some(key => normalize(machine.machine_type).includes(key)))
        const count = matching.reduce((sum, machine) => sum + Number(machine.count || 0), 0)
        const status = matching.find(machine => machine.status)?.status || ''
        const notes = matching.map(machine => machine.notes).filter(Boolean).join(' / ')
        reportXml = setTemplateCell(reportXml, `C${row}`, count)
        reportXml = setTemplateCell(reportXml, `D${row}`, status)
        reportXml = setTemplateCell(reportXml, `E${row}`, notes)
      })
      files['xl/worksheets/sheet1.xml'] = strToU8(reportXml)

      fillTemplateSheet(files, 2, (progressItems || []).map(item => [
        undefined,
        item.name || '',
        item.unit || '',
        item.target_qty || 0,
        progressTotals.get(item.id) || 0,
        '',
      ]), 5)

      fillTemplateSheet(files, 3, (tasks || []).map(task => [
        undefined,
        task.task_code || '',
        task.task_name || '',
        task.status || '',
        Number(task.progress_pct || 0) / 100,
        '',
      ]), 5)

      downloadXlsxZip(files, `gunluk-rapor-${projectId}-${exportDate}.xlsx`)
    } catch (err) {
      setExportError(err.message || 'Günlük rapor indirilemedi')
    } finally {
      setExportingReport(false)
    }
  }

  return (
    <div>

      {/* ── Proje bilgi satırı — her zaman görünür ── */}
      {project && (
        <div className="ss-project-bar">
          <span className="ss-project-bar-name">{project.name}</span>
          <button
            type="button"
            onClick={handleDailyReportExport}
            disabled={exportingReport}
            style={{
              order: 99,
              marginLeft: 'auto',
              padding: '7px 11px',
              borderRadius: 8,
              border: '1px solid #bfdbfe',
              background: exportingReport ? '#f8fafc' : '#eff6ff',
              color: '#185FA5',
              fontSize: 12,
              fontWeight: 700,
              cursor: exportingReport ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {exportingReport ? 'Hazırlanıyor…' : '📋 Günlük Rapor İndir'}
          </button>
          {project.location && (
            <><span className="ss-project-bar-sep">·</span><span className="ss-project-bar-loc">{project.location}</span></>
          )}
          {project.target_date && (
            <><span className="ss-project-bar-sep">·</span><span className="ss-project-bar-date">Hedef: {fmtLong(project.target_date)}</span></>
          )}
        </div>
      )}

      {/* ── Hızlı Eylemler + Hava Durumu ── */}
      {exportError && (
        <p style={{ margin: '-0.5rem 0 0.75rem', color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
          ❌ {exportError}
        </p>
      )}

      <div className="ss-kpi-grid">

        {/* Günlük Rapor */}
        <button className="ss-kpi-card" onClick={() => setShowRapor(true)} style={{
          ...CARD,
          borderLeftColor: todayReport ? '#10B981' : '#185FA5',
          background: todayReport ? '#F0FDF4' : '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Günlük Rapor</span>
            {todayReport
              ? <span style={{ fontSize: 11, fontWeight: 600, color: '#10B981', background: '#D1FAE5', borderRadius: 10, padding: '1px 8px' }}>Girildi</span>
              : <span style={{ fontSize: 11, fontWeight: 600, color: '#F59E0B', background: '#FEF3C7', borderRadius: 10, padding: '1px 8px' }}>Eksik</span>
            }
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: todayReport ? '#065F46' : '#185FA5' }}>Raporu Gir / Düzenle</p>
        </button>

        {/* Ticket Oluştur */}
        <button className="ss-kpi-card" onClick={() => setShowTicket(true)} style={CARD}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Hata Bildirimi</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#185FA5' }}>+ Ticket Oluştur</p>
        </button>

        {/* Satın Alma Talebi */}
        <button className="ss-kpi-card" onClick={() => setShowTalep(true)} style={CARD}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Malzeme Talebi</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#185FA5' }}>+ Satın Alma Talebi</p>
        </button>

        {/* Proje İlerleme — tablet/masaüstü, mobilde gizli */}
        {!loading && project && (
          <div className="ss-kpi-card ss-hide-mobile" style={{ ...CARD, cursor: 'default', display: 'flex', gap: 16, alignItems: 'center', flexGrow: 1.6 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Donut data={donutData} size={88} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', pointerEvents: 'none' }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{project.progress ?? 0}%</span>
                <span style={{ fontSize: 9, color: '#9CA3AF' }}>tamam</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.location || '—'}
                {project.target_date && ` · ${fmtLong(project.target_date)}`}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                {Object.entries(WP_STATUS).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.color, flexShrink: 0 }} />
                    {v.label} <strong style={{ color: '#111827' }}>{wpStats[k] || 0}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Hava Durumu — tablet/masaüstü, mobilde gizli */}
        {cityName && (
          <div className="ss-kpi-card ss-hide-mobile" style={{ ...CARD, cursor: 'default', overflow: 'hidden' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>
              Hava — {cityName}
            </p>
            {wx ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{wx.emoji}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{wx.temp}°</span>
                      <span style={{ fontSize: 12, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wx.label}</span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                      💨 {wx.wind} km/h &nbsp;💧 %{wx.humidity}
                    </p>
                  </div>
                </div>
                {wxTmr && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #F3F4F6', fontSize: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Yarın</span>
                    <span style={{ fontSize: 14 }}>{wxTmr.emoji}</span>
                    <span style={{ fontWeight: 700, color: '#111827' }}>{wxTmr.max}°</span>
                    <span style={{ color: '#9CA3AF' }}>{wxTmr.min}°</span>
                    <span style={{ color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wxTmr.label}</span>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Yükleniyor…</p>
            )}
          </div>
        )}
      </div>

      {/* ── Alt İki Kolon ── */}
      <div className="ss-bottom-grid">

        {/* Ticketlar */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Ticketlar</span>
            <button onClick={() => setShowTicket(true)} style={{ background: 'none', border: 'none', fontSize: 13, color: '#185FA5', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
              + Yeni
            </button>
          </div>
          <div>
            {loading && <p style={{ padding: '20px 18px', color: '#9CA3AF', fontSize: 13, margin: 0 }}>Yükleniyor…</p>}
            {!loading && tickets.length === 0 && <p style={{ padding: '20px 18px', color: '#9CA3AF', fontSize: 13, margin: 0 }}>Ticket yok.</p>}
            {tickets.map(t => (
              <div key={t.id} className="ss-list-row" onClick={() => setDetayTicket(t)}>
                <span className="ss-list-title">{t.title}</span>
                <div className="ss-list-badges">
                  <Badge map={TICKET_CAT} value={t.category} />
                  <Badge map={TICKET_STATUS} value={t.status} />
                </div>
                <span className="ss-list-date">{fmtDate(t.created_at)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Satın Alma Talepleri */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Satın Alma Talepleri</span>
            <button onClick={() => setShowTalep(true)} style={{ background: 'none', border: 'none', fontSize: 13, color: '#185FA5', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
              + Yeni
            </button>
          </div>
          <div>
            {loading && <p style={{ padding: '20px 18px', color: '#9CA3AF', fontSize: 13, margin: 0 }}>Yükleniyor…</p>}
            {!loading && prs.length === 0 && <p style={{ padding: '20px 18px', color: '#9CA3AF', fontSize: 13, margin: 0 }}>Talep yok.</p>}
            {prs.map(pr => (
              <div key={pr.id} className="ss-list-row ss-list-row--static">
                <span className="ss-list-title">{pr.title}</span>
                <div className="ss-list-badges">
                  <Badge map={PR_URGENCY} value={pr.urgency} />
                  <Badge map={PR_STATUS} value={pr.status} />
                </div>
                <span className="ss-list-date">{fmtDate(pr.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modaller ── */}
      {showRapor && (
        <GunlukRaporDrawer
          projectId={projectId}
          onClose={() => { setShowRapor(false); refresh() }}
        />
      )}
      {showTicket && (
        <YeniTicketModal
          onClose={() => setShowTicket(false)}
          onSaved={() => { setShowTicket(false); refresh() }}
        />
      )}
      {showTalep && (
        <YeniTalepModal
          defaultProjectId={projectId}
          onClose={() => setShowTalep(false)}
          onSaved={() => { setShowTalep(false); refresh() }}
        />
      )}
      {detayTicket && (
        <TicketDetayModal
          ticket={detayTicket}
          onClose={() => { setDetayTicket(null); refresh() }}
          onUpdated={() => { setDetayTicket(null); refresh() }}
        />
      )}
    </div>
  )
}
