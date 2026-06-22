import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const UNITS = ['Adet', 'Metre', 'Kg', 'Lt', 'Rulo', 'Kutu', 'Takım', 'Ton', 'M²', 'M³']

const INPUT = {
  border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
  width: '100%', boxSizing: 'border-box',
}
const LABEL = {
  fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase',
  letterSpacing: '0.4px', display: 'block', marginBottom: 4,
}

export default function YeniTalepModal({ onClose, onSaved }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ project_id: '', title: '', urgency: 'normal', request_note: '' })
  const [items, setItems] = useState([{ name: '', quantity: 1, unit: 'Adet', unit_price: '' }])

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data || []))
  }, [])

  const addItem    = () => setItems(p => [...p, { name: '', quantity: 1, unit: 'Adet', unit_price: '' }])
  const removeItem = (i) => setItems(p => p.filter((_, j) => j !== i))
  const updateItem = (i, field, value) => setItems(p => p.map((it, j) => j === i ? { ...it, [field]: value } : it))

  const setF = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit() {
    if (!form.title.trim()) return
    setSaving(true)

    const { data: pr, error } = await supabase
      .from('purchase_requests')
      .insert({
        project_id:   form.project_id || null,
        title:        form.title.trim(),
        urgency:      form.urgency,
        request_note: form.request_note.trim() || null,
        status:       'bekliyor',
        requested_by: user.id,
      })
      .select()
      .single()

    if (!error && pr) {
      const validItems = items.filter(i => i.name.trim())
      if (validItems.length > 0) {
        await supabase.from('purchase_request_items').insert(
          validItems.map(i => ({
            request_id: pr.id,
            name:       i.name.trim(),
            quantity:   Number(i.quantity) || 1,
            unit:       i.unit,
            unit_price: i.unit_price !== '' ? Number(i.unit_price) : null,
          }))
        )
      }
      onSaved()
    }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="modal-centered-box" style={{ width: '100%', maxWidth: 560 }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>Yeni Satın Alma Talebi</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label style={LABEL}>Proje</label>
            <select value={form.project_id} onChange={setF('project_id')} style={INPUT}>
              <option value="">— Proje seçin —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL}>Talep Başlığı *</label>
            <input
              type="text"
              placeholder="Örn: DC Kablo 4mm² — 500 Metre"
              value={form.title}
              onChange={setF('title')}
              style={INPUT}
            />
          </div>

          <div>
            <label style={LABEL}>Aciliyet</label>
            <select value={form.urgency} onChange={setF('urgency')} style={INPUT}>
              <option value="normal">Normal</option>
              <option value="acil">Acil</option>
              <option value="çok_acil">Çok Acil</option>
            </select>
          </div>

          <div>
            <label style={LABEL}>Açıklama</label>
            <textarea
              placeholder="Talep gerekçesi..."
              value={form.request_note}
              onChange={setF('request_note')}
              rows={3}
              style={{ ...INPUT, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={LABEL}>Malzeme Kalemleri</label>
            {items.map((item, i) => (
              <div key={i} className="talep-item-row">
                <input
                  placeholder="Malzeme adı"
                  value={item.name}
                  onChange={e => updateItem(i, 'name', e.target.value)}
                  style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Miktar"
                  value={item.quantity}
                  onChange={e => updateItem(i, 'quantity', e.target.value)}
                  style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 8px', fontSize: 13, fontFamily: 'inherit' }}
                />
                <select
                  value={item.unit}
                  onChange={e => updateItem(i, 'unit', e.target.value)}
                  style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 6px', fontSize: 13, fontFamily: 'inherit' }}
                >
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <input
                  type="number"
                  min="0"
                  placeholder="Birim ₺"
                  value={item.unit_price}
                  onChange={e => updateItem(i, 'unit_price', e.target.value)}
                  style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 8px', fontSize: 13, fontFamily: 'inherit' }}
                />
                <button
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                  style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: items.length === 1 ? 0.35 : 1, fontSize: 16 }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addItem}
              style={{ background: '#F3F4F6', border: '1px dashed #D1D5DB', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#6B7280', cursor: 'pointer', width: '100%', fontFamily: 'inherit', marginTop: 2 }}
            >
              + Kalem Ekle
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim()}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: !form.title.trim() ? 0.5 : 1 }}
          >
            {saving ? 'Kaydediliyor…' : 'Talep Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
