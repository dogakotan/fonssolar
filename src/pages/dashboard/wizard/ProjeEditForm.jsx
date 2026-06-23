import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

const F = {
  label:       { fontSize: 13, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 3, display: 'block' },
  input:       { padding: '0.5rem 0.75rem', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--color-text)', background: 'var(--color-surface)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' },
  inputRo:     { padding: '0.5rem 0.75rem', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--color-muted)', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' },
  hint:        { fontSize: 11, color: 'var(--color-muted)', marginTop: 2 },
  group:       { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  btnPrimary:  { padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary:{ padding: '0.5rem 1.25rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
}

export default function ProjeEditForm({ project, onSave, onBack }) {
  const [form, setForm] = useState({
    name:         project.name         || '',
    location:     project.location     || '',
    capacity_kwp: project.capacity_kwp ?? '',
    capacity_kwe: project.capacity_kwe ?? '',
    start_date:   project.start_date   || '',
    target_date:  project.target_date  || '',
    total_days:   project.total_days   ?? 180,
    status:       project.status       || 'aktif',
    progress:     project.progress     ?? 0,
  })
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [saved,   setSaved]   = useState(false)

  function set(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const payload = {
      name:         form.name,
      location:     form.location     || null,
      capacity_kwp: form.capacity_kwp !== '' ? Number(form.capacity_kwp) : null,
      capacity_kwe: form.capacity_kwe !== '' ? Number(form.capacity_kwe) : null,
      start_date:   form.start_date   || null,
      target_date:  form.target_date  || null,
      total_days:   form.total_days   !== '' ? Number(form.total_days) : 180,
      status:       form.status,
      progress:     Number(form.progress) || 0,
    }

    const { error: err } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', project.id)

    setLoading(false)

    if (err) { setError(err.message); return }

    setSaved(true)
    setTimeout(() => onSave(), 1000)
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Proje Düzenle</h3>
          <span style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'monospace' }}>{project.id}</span>
        </div>
        <button style={F.btnSecondary} onClick={onBack}>← Geri</button>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {saved && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', color: '#166534', fontSize: 14 }}>
            ✓ Proje güncellendi, listeye dönülüyor…
          </div>
        )}
        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            <div style={F.group}>
              <label style={F.label}>Proje ID</label>
              <input style={F.inputRo} value={project.id} readOnly />
              <span style={F.hint}>Proje ID değiştirilemez</span>
            </div>

            <div style={F.group}>
              <label style={F.label}>Proje Adı <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input style={F.input} value={form.name} onChange={set('name')} required />
            </div>

            <div style={F.group}>
              <label style={F.label}>Konum</label>
              <input style={F.input} value={form.location} onChange={set('location')} placeholder="Şehir / İlçe" />
            </div>

            <div style={F.group}>
              <label style={F.label}>Durum <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <select style={F.input} value={form.status} onChange={set('status')} required>
                <option value="aktif">Aktif</option>
                <option value="beklemede">Beklemede</option>
                <option value="tamamlandı">Tamamlandı</option>
                <option value="iptal edildi">İptal Edildi</option>
              </select>
            </div>

            <div style={F.group}>
              <label style={F.label}>DC Güç (kWp)</label>
              <input style={F.input} type="number" min="0" step="any" value={form.capacity_kwp} onChange={set('capacity_kwp')} placeholder="5000" />
            </div>

            <div style={F.group}>
              <label style={F.label}>AC Güç (kWe)</label>
              <input style={F.input} type="number" min="0" step="any" value={form.capacity_kwe} onChange={set('capacity_kwe')} placeholder="4800" />
            </div>

            <div style={F.group}>
              <label style={F.label}>Başlangıç Tarihi</label>
              <input style={F.input} type="date" value={form.start_date} onChange={set('start_date')} />
            </div>

            <div style={F.group}>
              <label style={F.label}>Hedef Bitiş Tarihi</label>
              <input style={F.input} type="date" value={form.target_date} onChange={set('target_date')} />
            </div>

            <div style={F.group}>
              <label style={F.label}>Toplam Gün</label>
              <input style={F.input} type="number" min="1" value={form.total_days} onChange={set('total_days')} placeholder="180" />
            </div>

            <div style={F.group}>
              <label style={F.label}>İlerleme (0–100)</label>
              <input style={F.input} type="number" min="0" max="100" value={form.progress} onChange={set('progress')} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={onBack} disabled={loading} style={F.btnSecondary}>
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || saved}
              style={{ ...F.btnPrimary, opacity: (loading || saved) ? 0.7 : 1, cursor: (loading || saved) ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Kaydediliyor…' : 'Güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
