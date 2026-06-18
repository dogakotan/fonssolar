import { useState, useEffect, useRef } from 'react'
import AgentPanel from '../../../components/AgentPanel'
import ExportButton from '../../../components/ui/ExportButton'
import DateNavigator from '../../../components/ui/DateNavigator'
import { getAllAgentReports, getProjects } from '../../../api'
import { dateFilter } from '../../../utils/exportUtils'

const ROLE_META = {
  // AgentPanel rolleri (underscore key)
  santiye_sefi:               { label: 'Şantiye Şefi',              icon: '🏗️', color: '#0f6e56' },
  elektrik_sefi:              { label: 'Elektrik Şefi',              icon: '⚡', color: '#185fa5' },
  mekanik_sef:                { label: 'Mekanik Şef',                icon: '🔩', color: '#854f0b' },
  isg_sorumlusu:              { label: 'İSG Sorumlusu',              icon: '🦺', color: '#a32d2d' },
  proje_koordinatoru:         { label: 'Proje Koordinatörü',         icon: '📋', color: '#534ab7' },
  maliyet_kontrolcu:          { label: 'Maliyet Kontrolcü',          icon: '💰', color: '#3b6d11' },
  lojistik:                   { label: 'Lojistik & Tedarik',         icon: '🚛', color: '#5f5e5a' },
  orchestrator:               { label: 'Orchestrator',               icon: '🎯', color: '#1a1a2e' },
  // TabEkip ajan ID'leri (kebab-case)
  'proje-koordinatoru':       { label: 'Proje Koordinatörü',         icon: '📋', color: '#534ab7' },
  'proje-tasarim-sorumlusu':  { label: 'Proje Tasarım Sorumlusu',    icon: '📐', color: '#0369a1' },
  'proje-kurulum-sefi':       { label: 'Proje Kurulum Şefi',         icon: '🏭', color: '#0f6e56' },
  'evrak-takip-uzmani':       { label: 'Evrak Takip Uzmanı',         icon: '📂', color: '#6d4c41' },
  'maliyet-kontrolcu':        { label: 'Maliyet Kontrolcü',          icon: '💰', color: '#3b6d11' },
  'santiye-sefi':             { label: 'Şantiye Şefi',               icon: '🏗️', color: '#374151' },
  'operasyon-sorumlusu':      { label: 'Operasyon Sorumlusu',        icon: '⚙️', color: '#1e3a5f' },
  'mekanik-sef':              { label: 'Mekanik Şef',                icon: '🔩', color: '#854f0b' },
  'elektrik-sefi':            { label: 'Elektrik Şefi',              icon: '⚡', color: '#185fa5' },
  'is-makinesi-operator-sefi':{ label: 'İş Makinesi Operatör Şefi', icon: '🚜', color: '#5c3317' },
  'enh-sorumlusu':            { label: 'ENH Sorumlusu',              icon: '🔌', color: '#1a3650' },
  'isg-sorumlusu':            { label: 'İSG Sorumlusu',              icon: '🦺', color: '#a32d2d' },
  'kalite-kontrol-sefi':      { label: 'Kalite Kontrol Şefi',        icon: '✅', color: '#065f46' },
  'lojistik-tedarik-sorumlusu':{ label: 'Lojistik & Tedarik Sorumlusu', icon: '🚛', color: '#5f5e5a' },
}

const RISK_BADGE = {
  kritik: { cls: 'red',   label: 'Kritik'  },
  yüksek: { cls: 'red',   label: 'Yüksek' },
  orta:   { cls: 'amber', label: 'Orta'   },
  düşük:  { cls: 'green', label: 'Düşük'  },
}

function formatTarih(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function TabRaporlar({ projectId, projectName, selectedDate, setSelectedDate }) {
  const [reports, setReports]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [roleFilter, setRoleFilter] = useState('')
  const [expanded, setExpanded]     = useState({})
  const [projects, setProjects]     = useState([])
  const [activeProjectId, setActiveProjectId] = useState(projectId || '')
  const [showCal, setShowCal]       = useState(false)
  const [calPos, setCalPos]         = useState({ top: 0, right: 0 })
  const calRef    = useRef(null)
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

  // Proje listesini çek (AgentPanel için)
  useEffect(() => {
    getProjects().then(({ data }) => setProjects(data || []))
  }, [])

  // Dışarıdan gelen projectId değişirse güncelle
  useEffect(() => {
    if (projectId) setActiveProjectId(projectId)
  }, [projectId])

  // Raporları çek
  useEffect(() => {
    setLoading(true)
    getAllAgentReports({
      projectId: activeProjectId || undefined,
      role: roleFilter || undefined,
    }).then(({ data }) => {
      setReports(data || [])
      setLoading(false)
    })
  }, [activeProjectId, roleFilter])

  // Seçili tarihe göre filtrele: o gün oluşturulan raporlar
  const displayReports = selectedDate
    ? reports.filter(r => {
        if (!r.created_at) return false
        const d = new Date(r.created_at)
        const sel = new Date(selectedDate)
        return (
          d.getFullYear() === sel.getFullYear() &&
          d.getMonth()    === sel.getMonth() &&
          d.getDate()     === sel.getDate()
        )
      })
    : reports

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const activeProject = projects.find(p => p.id === activeProjectId)
  const agentProjectId   = activeProjectId || 'genel'
  const agentProjectName = activeProject?.name || projectName || 'Tüm Projeler'

  const allRoles = [...new Set(reports.map(r => r.agent_role))].sort()

  return (
    <div>
      {/* ── AI Agent Paneli ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header">
          <h3>AI Agent Paneli</h3>
          {/* Proje seçici */}
          <select
            value={activeProjectId}
            onChange={e => setActiveProjectId(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
              fontSize: 13, color: '#374151', background: '#fff', cursor: 'pointer',
            }}
          >
            <option value="">Tüm Projeler</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div style={{ padding: '0 1.25rem 1.25rem' }}>
          <AgentPanel projectId={agentProjectId} projectName={agentProjectName} />
        </div>
      </div>

      {/* ── Geçmiş Raporlar ───────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Geçmiş Raporlar</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="badge blue">
              {selectedDate ? `${displayReports.length} / ${reports.length} rapor` : `${reports.length} rapor`}
            </span>

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
              title="Agent Raporlari"
              disabled={loading || reports.length === 0}
              getData={(periyot) => {
                const filtered = dateFilter(reports, 'created_at', periyot)
                return {
                  columns: ['Tarih', 'Ajan', 'Proje', 'Risk Seviyesi', 'Rapor Özeti'],
                  rows: filtered.map(r => [
                    new Date(r.created_at).toLocaleDateString('tr-TR'),
                    ROLE_META[r.agent_role]?.label || r.agent_role,
                    r.project_id || '—',
                    r.risk_level || '—',
                    (r.report_text || '').slice(0, 200),
                  ]),
                }
              }}
            />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db',
                fontSize: 12, color: '#374151', background: '#fff', cursor: 'pointer',
              }}
            >
              <option value="">Tüm Roller</option>
              {allRoles.map(r => {
                const m = ROLE_META[r]
                return <option key={r} value={r}>{m ? `${m.icon} ${m.label}` : r}</option>
              })}
            </select>
          </div>
        </div>

        {loading && (
          <p style={{ padding: '1.5rem', color: 'var(--color-muted)' }}>Yükleniyor…</p>
        )}

        {!loading && displayReports.length === 0 && (
          <p style={{ padding: '1.5rem', color: 'var(--color-muted)' }}>
            {selectedDate
              ? `${selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} tarihinde rapor bulunamadı.`
              : 'Henüz rapor oluşturulmamış. Yukarıdaki Agent Paneli\'nden ilk raporunuzu oluşturun.'}
          </p>
        )}

        {!loading && displayReports.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Ajan</th>
                <th>Proje</th>
                <th>Risk</th>
                <th>Rapor</th>
              </tr>
            </thead>
            <tbody>
              {displayReports.map(r => {
                const meta  = ROLE_META[r.agent_role] || { label: r.agent_role, icon: '🤖', color: '#6b7280' }
                const risk  = RISK_BADGE[r.risk_level] || null
                const isExp = expanded[r.id]
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                      {formatTarih(r.created_at)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{meta.icon}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: meta.color }}>
                          {meta.label}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                      {r.project_id}
                    </td>
                    <td>
                      {risk
                        ? <span className={`badge ${risk.cls}`}>{risk.label}</span>
                        : <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>—</span>
                      }
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      <div style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.5 }}>
                        {isExp
                          ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{r.report_text}</pre>
                          : <span>{(r.report_text || '').slice(0, 120)}{(r.report_text || '').length > 120 ? '…' : ''}</span>
                        }
                      </div>
                      {(r.report_text || '').length > 120 && (
                        <button
                          onClick={() => toggleExpand(r.id)}
                          style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                        >
                          {isExp ? 'Daralt ▲' : 'Tamamını gör ▼'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
