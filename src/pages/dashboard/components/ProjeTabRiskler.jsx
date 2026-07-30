import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import Pager from '../../../components/ui/Pager'

const PAGE_SIZE = 10
const TH = { height: 24, boxSizing: 'border-box', padding: '0 12px', lineHeight: '24px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const TD = { height: 46, boxSizing: 'border-box', padding: '0 12px', fontSize: 12.5, color: 'var(--color-text-sub)', verticalAlign: 'middle' }

const fmtDate = (value) => value ? new Date(value).toLocaleDateString('tr-TR') : '—'
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('tr-TR') : '—'

// SEV_META/STATUS_META, ProjectOverviewDashboard.jsx'teki Riskler kartıyla aynı renk/etiket
// setini kullanır — iki yerde de "cümleler" (etiket metinleri) sabit tutuluyor, yalnızca
// gösterim (nokta + kalın metin) tema olarak tekilleştirildi.
const SEV_META = {
  kritik: { color: '#ef4444', label: 'Kritik' },
  yüksek: { color: '#f59e0b', label: 'Yüksek' },
  yuksek: { color: '#f59e0b', label: 'Yüksek' },
  orta:   { color: '#94a3b8', label: 'Orta' },
  düşük:  { color: '#3b82f6', label: 'Düşük' },
  dusuk:  { color: '#3b82f6', label: 'Düşük' },
}

const STATUS_META = {
  'açık':         { color: 'var(--color-danger)', label: 'Açık' },
  'azaltıldı':    { color: '#3b82f6', label: 'Azaltıldı' },
  'kabul_edildi': { color: '#64748b', label: 'Kabul Edildi' },
  'kapatıldı':    { color: 'var(--color-success)', label: 'Kapatıldı' },
}

const RISK_CATEGORY_LABEL = {
  is_kalemi: 'İş Kalemi',
  satin_alma: 'Satın Alma',
  diger: 'Diğer',
}

const RISK_RULE_LABEL = {
  gorev_gecikmesi: 'Görev Gecikmesi',
  malzeme_fazla_talep: 'Malzeme Fazla Talebi',
}

const SEVERITY_ORDER = { kritik: 1, yüksek: 2, yuksek: 2, orta: 3, düşük: 4, dusuk: 4 }

// Ekranın her yerinde aynı "nokta + kalın renkli metin" durumu göstergesi — pill/arkaplan
// rozeti değil, satın alma talep listesindeki RiskBadge (Uygun/Riskli/Listede Yok) ile
// aynı tema.
function DotBadge({ color, label, size = 12.5 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color, fontSize: size, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function RiskDetayModal({ risk, onClose, onGoTab }) {
  const sev = SEV_META[risk.severity] || { color: '#94a3b8', label: risk.severity || '—' }
  const st = STATUS_META[risk.status] || { color: '#94a3b8', label: risk.status || '—' }
  const target = risk.rule_code === 'gorev_gecikmesi' ? 'gantt'
    : risk.rule_code === 'malzeme_fazla_talep' ? 'satin-alma'
    : null

  return (
    <div
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, padding: 18, background: 'rgba(15, 23, 42, .42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{ width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 26, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: '#111827', overflowWrap: 'anywhere' }}>{risk.title}</h3>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: '#64748B' }}>
              {fmtDateTime(risk.created_at)} tarihinde oluşturuldu
              {risk.closed_at && <> · {fmtDateTime(risk.closed_at)} tarihinde kapandı</>}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'none', color: '#64748B', fontSize: 22, cursor: 'pointer', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
          <DotBadge color={sev.color} label={sev.label} />
          <DotBadge color={st.color} label={st.label} />
          <span style={{ fontSize: 12.5, color: '#475569', background: '#eef2f7', padding: '3px 9px', borderRadius: 999 }}>
            {RISK_CATEGORY_LABEL[risk.category] || 'Diğer'}
          </span>
          <span style={{ fontSize: 12.5, color: '#64748B' }}>
            {risk.source === 'otomatik' ? (RISK_RULE_LABEL[risk.rule_code] || 'Otomatik tespit') : 'Manuel giriş'}
          </span>
        </div>

        {risk.description && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontSize: 10.5, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.03em' }}>Açıklama</p>
            <p style={{ margin: 0, fontSize: 13.5, color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{risk.description}</p>
          </div>
        )}

        {risk.mitigation && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontSize: 10.5, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.03em' }}>Aksiyon / Önlem</p>
            <p style={{ margin: 0, fontSize: 13.5, color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{risk.mitigation}</p>
          </div>
        )}

        {(risk.probability != null && risk.impact != null) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
            <div style={{ padding: '10px 12px', borderRadius: 9, background: '#F8FAFC' }}>
              <p style={{ margin: '0 0 3px', fontSize: 10.5, color: '#64748B', textTransform: 'uppercase' }}>Olasılık</p>
              <strong style={{ fontSize: 14, color: '#0F172A' }}>{risk.probability} / 5</strong>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 9, background: '#F8FAFC' }}>
              <p style={{ margin: '0 0 3px', fontSize: 10.5, color: '#64748B', textTransform: 'uppercase' }}>Etki</p>
              <strong style={{ fontSize: 14, color: '#0F172A' }}>{risk.impact} / 5</strong>
            </div>
          </div>
        )}

        {target && (
          <button
            onClick={() => { onClose(); onGoTab?.(target) }}
            style={{ width: '100%', padding: '10px 14px', background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {risk.rule_code === 'gorev_gecikmesi' ? 'İş Planı sekmesine git' : 'Satın Alma sekmesine git'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function ProjeTabRiskler({ projectId, onGoTab }) {
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('acik')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)

  const fetchRisks = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('project_risks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRisks(data || [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchRisks() }, [fetchRisks])
  useRealtimeRefresh(['project_risks'], fetchRisks, { enabled: !!projectId, filter: { column: 'project_id', value: projectId } })
  useEffect(() => { setPage(0) }, [statusFilter])

  const filtered = risks
    .filter(r => statusFilter === 'all' ? true : statusFilter === 'acik' ? r.status !== 'kapatıldı' : r.status === 'kapatıldı')
    .sort((a, b) => (SEVERITY_ORDER[a.severity] || 5) - (SEVERITY_ORDER[b.severity] || 5) || new Date(b.created_at) - new Date(a.created_at))

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
      <DataStatusBanner error={error} onRetry={fetchRisks} />

      <div style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--color-border-md)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Riskler</h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 7 }}>
          {filtered.length} risk
        </span>

        <div style={{ marginLeft: 'auto' }}>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            style={{ border: '1px solid var(--color-border-md)', borderRadius: 7, padding: '5px 28px 5px 10px', fontSize: 12, color: 'var(--color-text-sub)', background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
          >
            <option value="acik">Açık Riskler</option>
            <option value="all">Tüm Riskler</option>
            <option value="kapatildi">Kapatılanlar</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>Yükleniyor…</div>
      ) : pageRows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
          Bu kriterde risk bulunamadı.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  {['RİSK', 'KATEGORİ', 'ÖNEM', 'DURUM', 'TARİH'].map(h => (
                    <th key={h} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(risk => {
                  const sev = SEV_META[risk.severity] || { color: '#94a3b8', label: risk.severity || '—' }
                  const st = STATUS_META[risk.status] || { color: '#94a3b8', label: risk.status || '—' }
                  return (
                    <tr
                      key={risk.id}
                      onClick={() => setSelected(risk)}
                      style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ ...TD, minWidth: 260 }}>
                        <strong style={{ color: 'var(--color-text)', fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={risk.title}>
                          {risk.title}
                        </strong>
                      </td>
                      <td style={{ ...TD, minWidth: 170 }}>
                        <strong style={{ color: 'var(--color-text-sub)', fontSize: 12.5 }}>{RISK_CATEGORY_LABEL[risk.category] || 'Diğer'}</strong>
                        <div style={{ fontSize: 10.5, color: 'var(--color-muted)', marginTop: 2 }}>
                          {risk.source === 'otomatik' ? (RISK_RULE_LABEL[risk.rule_code] || 'Otomatik tespit') : 'Manuel'}
                        </div>
                      </td>
                      <td style={TD}><DotBadge color={sev.color} label={sev.label} /></td>
                      <td style={TD}><DotBadge color={st.color} label={st.label} /></td>
                      <td style={{ ...TD, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{fmtDate(risk.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '4px 14px 12px' }}>
            <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
        </>
      )}

      {selected && <RiskDetayModal risk={selected} onClose={() => setSelected(null)} onGoTab={onGoTab} />}
    </div>
  )
}
