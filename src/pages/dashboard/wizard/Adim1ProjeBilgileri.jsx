import { useState } from 'react'

const F = {
  label:       { fontSize: 13, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 3, display: 'block' },
  input:       { padding: '0.5rem 0.75rem', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--color-text)', background: 'var(--color-surface)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' },
  inputRo:     { padding: '0.5rem 0.75rem', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--color-muted)', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' },
  hint:        { fontSize: 11, color: 'var(--color-muted)', marginTop: 2 },
  group:       { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  btnPrimary:  { padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary:{ padding: '0.5rem 1.25rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
}

export default function Adim1ProjeBilgileri({
  result,
  onDone,
  onCancel,
  mode = 'new',
  initialProject,
}) {
  const [form, setForm] = useState({
    id:           mode === 'edit' ? (initialProject?.id          ?? '') : '',
    name:         mode === 'edit' ? (initialProject?.name        ?? '') : '',
    location:     mode === 'edit' ? (initialProject?.location    ?? '') : '',
    capacity_kwp: mode === 'edit' ? String(initialProject?.capacity_kwp ?? '') : '',
    capacity_kwe: mode === 'edit' ? String(initialProject?.capacity_kwe ?? '') : '',
    start_date:   mode === 'edit' ? (initialProject?.start_date  ?? '') : '',
    target_date:  mode === 'edit' ? (initialProject?.target_date ?? '') : '',
    total_days:   mode === 'edit' ? String(initialProject?.total_days ?? 180) : '180',
    status:       mode === 'edit' ? (initialProject?.status      ?? 'aktif') : 'aktif',
    progress:     mode === 'edit' ? String(initialProject?.progress ?? 0) : '0',
  })
  const [error, setError] = useState(null)

  if (result !== undefined) {
    return (
      <div className="card">
        <div className="card-header"><h3>Adım 1 — Proje Bilgileri</h3></div>
        <div style={{ padding: '1.5rem' }}>
          <p style={{ color: 'var(--color-success)', margin: '0 0 1rem', fontSize: 14 }}>
            ✓ Proje bilgileri hazırlandı: <strong>{result.name}</strong> ({result.id})
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button style={F.btnSecondary} onClick={onCancel}>İptal</button>
            <button style={F.btnPrimary} onClick={() => onDone(result)}>Devam Et →</button>
          </div>
        </div>
      </div>
    )
  }

  function handleIdChange(e) {
    const slug = e.target.value.toLowerCase().replace(/\s+/g, '-')
    setForm(f => ({ ...f, id: slug }))
  }

  function set(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.id?.trim()) { setError('Proje ID zorunludur.'); return }
    if (!form.name?.trim()) { setError('Proje Adı zorunludur.'); return }
    onDone({ ...form })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Adım 1 — Proje Bilgileri</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          {mode === 'edit' ? 'Zorunlu adım — projects tablosu' : 'Zorunlu adım'}
        </span>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            <div style={F.group}>
              <label style={F.label}>Proje ID {mode !== 'edit' && <span style={{ color: 'var(--color-danger)' }}>*</span>}</label>
              {mode === 'edit'
                ? <input style={F.inputRo} value={form.id} readOnly />
                : <input style={F.input} value={form.id} onChange={handleIdChange} required placeholder="kayseri-ges-2026" />
              }
              <span style={F.hint}>{mode === 'edit' ? 'Proje ID değiştirilemez' : 'Slug — boşluklar otomatik tire olur'}</span>
            </div>

            <div style={F.group}>
              <label style={F.label}>Proje Adı <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input style={F.input} value={form.name} onChange={set('name')} required placeholder="Kayseri GES Projesi" />
            </div>

            <div style={F.group}>
              <label style={F.label}>Konum</label>
              <input style={F.input} value={form.location} onChange={set('location')} placeholder="Şehir / İlçe / Mahalle" />
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
            <button type="button" onClick={onCancel} style={F.btnSecondary}>İptal</button>
            <button type="submit" style={F.btnPrimary}>
              {mode === 'edit' ? 'Devam →' : 'Devam →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
