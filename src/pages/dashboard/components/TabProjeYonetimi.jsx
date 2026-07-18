import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import YeniProjeWizard from '../wizard/YeniProjeWizard'
import ProjeEditWizard from '../wizard/ProjeEditWizard'
import { importProjectExcel, exportProjectExcelBlob, downloadBlob, formatImportSummary } from '../../../utils/projectExcelBridge'

const STATUS_LABEL = {
  aktif:          'Aktif',
  beklemede:      'Beklemede',
  'tamamlandı':   'Tamamlandı',
  'iptal edildi': 'İptal Edildi',
}

const STATUS_COLOR = {
  aktif:          { bg: '#dcfce7', color: '#166534' },
  beklemede:      { bg: '#fef9c3', color: '#854d0e' },
  'tamamlandı':   { bg: '#dbeafe', color: '#1e40af' },
  'iptal edildi': { bg: '#fee2e2', color: '#991b1b' },
}

const SUB_TABLES = [
  'project_tasks',
  'project_risks',
  'procurement_items',
  'budget_lines',
]

const PROJECT_DELETE_TABLES = [
  'agent_reports', 'quality_inspections',
]

const PROJECT_TEMPLATE_FILE = 'fons-solar-proje-sablonu.xlsx'

export default function TabProjeYonetimi({ onViewProject }) {
  const [view,            setView]            = useState('list')
  const [editProject,     setEditProject]     = useState(null)
  const [projects,        setProjects]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [deleting,        setDeleting]        = useState(null)
  const [exportLoadingId, setExportLoadingId] = useState(null)

  const [importState,   setImportState]   = useState('idle')   // 'idle' | 'importing'
  const [importError,   setImportError]   = useState(null)
  const fileInputRef = useRef(null)

  const [toast, setToast] = useState(null)
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 6000)
  }

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, name, location, status, progress, capacity_kwp, capacity_kwe, storage_kwh, start_date, target_date, total_days')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) { setError(err.message); return }
    setProjects(data || [])
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(project) {
    if (!window.confirm(`"${project.name}" projesini ve tüm bağlı verilerini silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz.`)) return

    setDeleting(project.id)
    setError(null)

    const deleteByProject = async table => {
      const { error: err } = await supabase.from(table).delete().eq('project_id', project.id)
      if (err) throw new Error(`${table}: ${err.message}`)
    }
    const deleteByIds = async (table, column, ids) => {
      if (!ids.length) return
      const { error: err } = await supabase.from(table).delete().in(column, ids)
      if (err) throw new Error(`${table}: ${err.message}`)
    }

    try {
      const [{ data: tickets }, { data: invoices }, { data: requests }, { data: reports }] = await Promise.all([
        supabase.from('tickets').select('id').eq('project_id', project.id),
        supabase.from('invoices').select('id').eq('project_id', project.id),
        supabase.from('purchase_requests').select('id').eq('project_id', project.id),
        supabase.from('daily_reports').select('id').eq('project_id', project.id),
      ])
      const ids = rows => (rows || []).map(row => row.id)
      await deleteByIds('ticket_comments', 'ticket_id', ids(tickets))
      await deleteByIds('ticket_history', 'ticket_id', ids(tickets))
      await deleteByIds('invoice_approvals', 'invoice_id', ids(invoices))
      await deleteByIds('purchase_request_items', 'request_id', ids(requests))
      await deleteByIds('personnel_log_entries', 'report_id', ids(reports))
      await deleteByIds('machinery_logs', 'report_id', ids(reports))
      await deleteByIds('daily_tasks', 'report_id', ids(reports))
      await deleteByIds('progress_daily', 'report_id', ids(reports))
      await Promise.all(PROJECT_DELETE_TABLES.map(deleteByProject))
      await Promise.all(['tickets', 'invoices', 'purchase_requests', 'daily_reports'].map(deleteByProject))
      const { error: profileErr } = await supabase.from('profiles').update({ project_id: null }).eq('project_id', project.id)
      if (profileErr) throw new Error(`profiles: ${profileErr.message}`)
    } catch (cleanupError) {
      setDeleting(null)
      setError(`Bağlı veri silme hatası: ${cleanupError.message}`)
      return
    }

    for (const table of SUB_TABLES) {
      const { error: err } = await supabase.from(table).delete().eq('project_id', project.id)
      if (err) {
        setDeleting(null)
        setError(`Alt tablo silme hatası (${table}): ${err.message}`)
        return
      }
    }

    const { error: err } = await supabase.from('projects').delete().eq('id', project.id)
    setDeleting(null)
    if (err) { setError(`Proje silme hatası: ${err.message}`); return }
    setProjects(p => p.filter(x => x.id !== project.id))
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport(project) {
    setExportLoadingId(project.id)
    try {
      const blob = await exportProjectExcelBlob(project.id)
      downloadBlob(blob, `${project.id}_detayli_proje_takip.xlsx`)
      showToast('Excel indirildi')
    } catch (err) {
      setError(`Excel oluşturulurken hata: ${err.message}`)
    } finally {
      setExportLoadingId(null)
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function handleImportClick() {
    setImportError(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportError(null)
    setImportState('importing')
    try {
      const result = await importProjectExcel(file)
      setImportState('idle')
      showToast(`Excel aktarıldı (${result?.project_id || ''})\n${formatImportSummary(result?.summary)}`)
      fetchProjects()
    } catch (err) {
      setImportState('idle')
      setImportError(err.message)
    }
  }

  // ── Template ────────────────────────────────────────────────────────────────
  function handleDownloadTemplate() {
    const a = document.createElement('a')
    a.href = `/excel/${PROJECT_TEMPLATE_FILE}`
    a.download = PROJECT_TEMPLATE_FILE
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ── Views ───────────────────────────────────────────────────────────────────
  if (view === 'new') {
    return (
      <YeniProjeWizard
        onSuccess={() => { setView('list'); fetchProjects() }}
        onViewProject={onViewProject}
      />
    )
  }

  if (view === 'edit' && editProject) {
    return (
      <ProjeEditWizard
        project={editProject}
        onSuccess={() => { setView('list'); fetchProjects() }}
        onViewProject={onViewProject}
      />
    )
  }

  return (
    <div className="card" style={{ position: 'relative' }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="card-header">
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={handleDownloadTemplate}
            style={{ padding: '0.5rem 1.1rem', background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Şablon İndir
          </button>
          <button
            onClick={handleImportClick}
            disabled={importState === 'importing'}
            style={{ padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: importState === 'importing' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: importState === 'importing' ? 0.7 : 1 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {importState === 'importing' ? 'Aktarılıyor…' : 'Yeni Proje'}
          </button>
          <button
            onClick={() => setView('new')}
            style={{ padding: '0.5rem 0.75rem', background: 'none', border: 'none', color: 'var(--color-muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            Manuel doldur
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ padding: '1rem 1.5rem' }}>
        {(error || importError) && (
          <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem', whiteSpace: 'pre-line' }}>
            {error || importError}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2.5rem 0', fontSize: 14 }}>Yükleniyor…</p>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: '1rem' }}>Henüz proje eklenmemiş.</p>
            <button
              onClick={handleImportClick}
              disabled={importState === 'importing'}
              style={{ padding: '0.5rem 1.5rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: importState === 'importing' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: importState === 'importing' ? 0.7 : 1 }}
            >
              {importState === 'importing' ? 'Aktarılıyor…' : '+ İlk Projeyi Ekle'}
            </button>
            <div style={{ marginTop: '0.6rem' }}>
              <button
                onClick={() => setView('new')}
                style={{ padding: '0.4rem 0.6rem', background: 'none', border: 'none', color: 'var(--color-muted)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                Manuel doldur
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Proje Adı', 'ID', 'Konum', 'Durum', 'DC Güç', 'İlerleme', 'Başlangıç', 'Hedef Bitiş', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const sc    = STATUS_COLOR[p.status] || { bg: '#f1f5f9', color: '#475569' }
                  const isDel = deleting === p.id
                  const isExp = exportLoadingId === p.id
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: isDel ? 0.5 : 1 }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--color-text)' }}>{p.name}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-muted)', fontFamily: 'monospace', fontSize: 11 }}>{p.id}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-text-sub)' }}>{p.location || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
                          {STATUS_LABEL[p.status] || p.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>
                        {p.capacity_kwp ? `${Number(p.capacity_kwp).toLocaleString('tr')} kWp` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', minWidth: 110 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                            <div style={{ width: `${p.progress || 0}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap', minWidth: 28 }}>{p.progress || 0}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>{p.start_date || '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>{p.target_date || '—'}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            onClick={() => { setEditProject(p); setView('edit') }}
                            disabled={isDel || isExp}
                            style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => handleExport(p)}
                            disabled={isDel || isExp}
                            style={{ padding: '4px 10px', background: 'transparent', color: '#15803d', border: '1px solid #16a34a', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500, cursor: isExp ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isExp ? 0.6 : 1 }}
                          >
                            {isExp ? '…' : 'Excel'}
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={isDel || isExp}
                            style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500, cursor: isDel ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isDel ? 0.6 : 1 }}
                          >
                            {isDel ? '…' : 'Sil'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem',
          padding: '0.75rem 1.25rem', borderRadius: 10, maxWidth: 380,
          background: toast.type === 'success' ? '#16a34a' : '#dc2626',
          color: '#fff', fontWeight: 600, fontSize: 13, whiteSpace: 'pre-line',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          zIndex: 9999, transition: 'all .2s',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
