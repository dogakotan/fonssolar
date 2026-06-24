import { useState, useEffect } from 'react'

const F = {
  label:        { fontSize: 13, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 3, display: 'block' },
  input:        { padding: '0.5rem 0.75rem', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--color-text)', background: 'var(--color-surface)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' },
  inputRo:      { padding: '0.5rem 0.75rem', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, color: 'var(--color-muted)', background: '#f8fafc', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' },
  hint:         { fontSize: 11, color: 'var(--color-muted)', marginTop: 2 },
  group:        { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  btnPrimary:   { padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { padding: '0.5rem 1.25rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  secTitle:     { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 0.75rem' },
}

export default function Adim1ProjeBilgileri({
  result,
  onDone,
  onCancel,
  mode = 'new',
  initialProject,
}) {
  const src = result ?? initialProject ?? {}

  const [form, setForm] = useState({
    id:               mode === 'edit' ? (src.id ?? '') : (src.id ?? ''),
    name:             src.name             ?? '',
    location:         src.location         ?? '',
    capacity_kwp:     src.capacity_kwp     != null ? String(src.capacity_kwp)     : '',
    capacity_kwe:     src.capacity_kwe     != null ? String(src.capacity_kwe)     : '',
    storage_kwh:      src.storage_kwh      != null ? String(src.storage_kwh)      : '',
    start_date:       src.start_date       ?? '',
    target_date:      src.target_date      ?? '',
    total_days:       src.total_days       != null ? String(src.total_days)       : '',
    status:           src.status           ?? 'aktif',
    progress:         src.progress         != null ? String(src.progress)         : '0',
    panel_brand:      src.panel_brand      ?? '',
    panel_count:      src.panel_count      != null ? String(src.panel_count)      : '',
    inverter_brand:   src.inverter_brand   ?? '',
    inverter_count:   src.inverter_count   != null ? String(src.inverter_count)   : '',
    battery_brand:    src.battery_brand    ?? '',
    battery_power_kw: src.battery_power_kw != null ? String(src.battery_power_kw) : '',
    battery_count:    src.battery_count    != null ? String(src.battery_count)    : '',
  })
  const [error, setError] = useState(null)

  useEffect(() => {
    if (form.start_date && form.target_date) {
      const diff = Math.round(
        (new Date(form.target_date) - new Date(form.start_date)) / (1000 * 60 * 60 * 24)
      )
      if (diff > 0) setForm(f => ({ ...f, total_days: String(diff) }))
    }
  }, [form.start_date, form.target_date])

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

        <form data-wizard-form="project" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Temel Bilgiler */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={F.group}>
              <label style={F.label}>
                Proje ID {mode !== 'edit' && <span style={{ color: 'var(--color-danger)' }}>*</span>}
              </label>
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
              <label style={F.label}>Başlangıç Tarihi</label>
              <input style={F.input} type="date" value={form.start_date} onChange={set('start_date')} />
            </div>

            <div style={F.group}>
              <label style={F.label}>Hedef Bitiş Tarihi</label>
              <input style={F.input} type="date" value={form.target_date} onChange={set('target_date')} />
            </div>

            <div style={F.group}>
              <label style={F.label}>Toplam Gün</label>
              <input style={F.inputRo} type="number" value={form.total_days} readOnly placeholder="Tarihlerden hesaplanır" />
              <span style={F.hint}>Başlangıç ve bitiş tarihinden otomatik hesaplanır</span>
            </div>

            <div style={F.group}>
              <label style={F.label}>İlerleme (0–100)</label>
              <input style={F.input} type="number" min="0" max="100" value={form.progress} onChange={set('progress')} placeholder="0" />
            </div>
          </div>

          {/* Kurulu Güç */}
          <div style={{ paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
            <p style={F.secTitle}>Kurulu Güç</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={F.group}>
                <label style={F.label}>DC Güç (kWp)</label>
                <input style={F.input} type="number" min="0" step="any" value={form.capacity_kwp} onChange={set('capacity_kwp')} placeholder="5000" />
              </div>
              <div style={F.group}>
                <label style={F.label}>AC Güç (kWe)</label>
                <input style={F.input} type="number" min="0" step="any" value={form.capacity_kwe} onChange={set('capacity_kwe')} placeholder="4800" />
              </div>
              <div style={F.group}>
                <label style={F.label}>Depolama Kapasitesi (kWh)</label>
                <input style={F.input} type="number" min="0" step="any" value={form.storage_kwh} onChange={set('storage_kwh')} placeholder="0" />
              </div>
            </div>
          </div>

          {/* Ekipman Bilgileri */}
          <div style={{ paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
            <p style={F.secTitle}>Ekipman Bilgileri</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={F.group}>
                <label style={F.label}>Panel Markası</label>
                <input style={F.input} value={form.panel_brand} onChange={set('panel_brand')} placeholder="LONGi, JA Solar…" />
              </div>
              <div style={F.group}>
                <label style={F.label}>Panel Sayısı</label>
                <input style={F.input} type="number" min="0" value={form.panel_count} onChange={set('panel_count')} placeholder="0" />
              </div>
              <div style={F.group}>
                <label style={F.label}>İnvertör Markası</label>
                <input style={F.input} value={form.inverter_brand} onChange={set('inverter_brand')} placeholder="Sungrow, Huawei…" />
              </div>
              <div style={F.group}>
                <label style={F.label}>İnvertör Sayısı</label>
                <input style={F.input} type="number" min="0" value={form.inverter_count} onChange={set('inverter_count')} placeholder="0" />
              </div>
              <div style={F.group}>
                <label style={F.label}>Batarya Markası</label>
                <input style={F.input} value={form.battery_brand} onChange={set('battery_brand')} placeholder="BYD, CATL…" />
              </div>
              <div style={F.group}>
                <label style={F.label}>Batarya Gücü (kW)</label>
                <input style={F.input} type="number" min="0" step="any" value={form.battery_power_kw} onChange={set('battery_power_kw')} placeholder="0" />
              </div>
              <div style={F.group}>
                <label style={F.label}>Batarya Adedi</label>
                <input style={F.input} type="number" min="0" value={form.battery_count} onChange={set('battery_count')} placeholder="0" />
              </div>
            </div>
          </div>

          <div style={{ display: 'none' }}>
            <button type="button" onClick={onCancel} style={F.btnSecondary}>İptal</button>
            <button data-wizard-submit="next" type="submit" style={F.btnPrimary}>Devam →</button>
          </div>
        </form>
      </div>
    </div>
  )
}
