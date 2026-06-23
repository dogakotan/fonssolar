import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import YeniProjeWizard from '../wizard/YeniProjeWizard'
import ProjeEditWizard from '../wizard/ProjeEditWizard'

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
  'progress_items',
  'project_risks',
  'procurement_items',
  'budget_lines',
  'critical_path_items',
]

export default function TabProjeYonetimi({ onViewProject }) {
  const [view,        setView]        = useState('list')   // 'list' | 'new' | 'edit'
  const [editProject, setEditProject] = useState(null)
  const [projects,    setProjects]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [deleting,    setDeleting]    = useState(null)     // projectId being deleted

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, name, location, status, progress, capacity_kwp, capacity_kwe, start_date, target_date, total_days')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) { setError(err.message); return }
    setProjects(data || [])
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  async function handleDelete(project) {
    if (!window.confirm(`"${project.name}" projesini ve tüm bağlı verilerini silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz.`)) return

    setDeleting(project.id)
    setError(null)

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
    <div className="card">
      <div className="card-header">
        <h3>Proje Yönetimi</h3>
        <button
          onClick={() => setView('new')}
          style={{
            padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Yeni Proje
        </button>
      </div>

      <div style={{ padding: '1rem 1.5rem' }}>
        {error && (
          <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2.5rem 0', fontSize: 14 }}>Yükleniyor…</p>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: '1rem' }}>Henüz proje eklenmemiş.</p>
            <button
              onClick={() => setView('new')}
              style={{ padding: '0.5rem 1.5rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + İlk Projeyi Ekle
            </button>
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
                  const sc      = STATUS_COLOR[p.status] || { bg: '#f1f5f9', color: '#475569' }
                  const isDel   = deleting === p.id
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
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            onClick={() => { setEditProject(p); setView('edit') }}
                            disabled={isDel}
                            style={{
                              padding: '4px 12px', background: 'transparent',
                              color: 'var(--color-primary)', border: '1px solid var(--color-primary)',
                              borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={isDel}
                            style={{
                              padding: '4px 12px', background: 'transparent',
                              color: 'var(--color-danger)', border: '1px solid var(--color-danger)',
                              borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500,
                              cursor: isDel ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                              opacity: isDel ? 0.6 : 1,
                            }}
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
    </div>
  )
}
