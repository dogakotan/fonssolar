import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-sub)',
}

const inputStyle = {
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--color-border-md)',
  borderRadius: 'var(--radius-md)',
  fontSize: 14,
  color: 'var(--color-text)',
  background: 'var(--color-surface)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

export default function ProjeEkleForm({ onSuccess }) {
  const [form, setForm] = useState({
    id: '',
    name: '',
    location: '',
    capacity_kwp: '',
    capacity_kwe: '',
    start_date: '',
    target_date: '',
    total_days: '180',
    status: 'aktif',
    progress: '0',
  })
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  function handleIdChange(e) {
    const slug = e.target.value.toLowerCase().replace(/\s+/g, '-')
    setForm(f => ({ ...f, id: slug }))
  }

  function set(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const payload = {
      id:           form.id,
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

    const { error: err } = await supabase.from('projects').insert([payload])
    setLoading(false)

    if (err) {
      if (err.code === '23505') {
        setError(`"${form.id}" ID'siyle bir proje zaten mevcut. Farklı bir ID girin.`)
      } else {
        setError(err.message)
      }
      return
    }

    onSuccess()
  }

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <div className="card-header">
        <h3>Yeni Proje Ekle</h3>
      </div>

      {error && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-danger)',
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>
              Proje ID <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              style={inputStyle}
              value={form.id}
              onChange={handleIdChange}
              required
              placeholder="kayseri-ges-2026"
            />
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              Benzersiz slug — boşluklar otomatik tire olur
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>
              Proje Adı <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={set('name')}
              required
              placeholder="Kayseri GES Projesi"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>Konum</label>
            <input
              style={inputStyle}
              value={form.location}
              onChange={set('location')}
              placeholder="Şehir / İlçe"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>
              Durum <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <select style={inputStyle} value={form.status} onChange={set('status')} required>
              <option value="aktif">Aktif</option>
              <option value="beklemede">Beklemede</option>
              <option value="tamamlandı">Tamamlandı</option>
              <option value="iptal edildi">İptal Edildi</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>DC Güç (kWp)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="any"
              value={form.capacity_kwp}
              onChange={set('capacity_kwp')}
              placeholder="5000"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>AC Güç (kWe)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="any"
              value={form.capacity_kwe}
              onChange={set('capacity_kwe')}
              placeholder="4800"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>Başlangıç Tarihi</label>
            <input
              style={inputStyle}
              type="date"
              value={form.start_date}
              onChange={set('start_date')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>Hedef Bitiş Tarihi</label>
            <input
              style={inputStyle}
              type="date"
              value={form.target_date}
              onChange={set('target_date')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>Toplam Gün</label>
            <input
              style={inputStyle}
              type="number"
              min="1"
              value={form.total_days}
              onChange={set('total_days')}
              placeholder="180"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={labelStyle}>İlerleme (0–100)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              max="100"
              value={form.progress}
              onChange={set('progress')}
              placeholder="0"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={onSuccess}
            disabled={loading}
            style={{
              padding: '0.5rem 1.25rem',
              background: 'transparent',
              color: 'var(--color-muted)',
              border: '1px solid var(--color-border-md)',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.5rem 1.25rem',
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Kaydediliyor…' : 'Projeyi Kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}
