import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const UNITS = ['Adet', 'Metre', 'Kg', 'Lt', 'Rulo', 'Kutu', 'Takım', 'Ton', 'M²', 'M³']
const OTHER_VALUE = '__diger__'
const URGENCY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'acil', label: 'Acil' },
  { value: 'çok_acil', label: 'Çok Acil' },
]

const INPUT = {
  border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
  width: '100%', boxSizing: 'border-box',
}
const LABEL = {
  fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase',
  letterSpacing: '0.4px', display: 'block', marginBottom: 4,
}

function projectIdLabel(projectId) {
  if (!projectId) return 'Bağlı Proje'
  if (/^[0-9a-f-]{24,}$/i.test(String(projectId))) return 'Bağlı Proje'
  return String(projectId)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, c => c.toLocaleUpperCase('tr-TR'))
}

export default function YeniTalepModal({ onClose, onSaved, defaultProjectId, availableProjects }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [materialOptions, setMaterialOptions] = useState([])
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [form, setForm] = useState({ project_id: defaultProjectId || '', title: '', category: 'malzeme', urgency: 'normal', request_note: '' })
  const [item, setItem] = useState({ name: '', quantity: 1, unit: 'Adet', bom_item_id: null })
  const [useOther, setUseOther] = useState(false)
  const [materialMenuOpen, setMaterialMenuOpen] = useState(false)
  const [materialMenuStyle, setMaterialMenuStyle] = useState(null)
  const materialMenuRef = useRef(null)
  const materialButtonRef = useRef(null)
  const modalBoxRef = useRef(null)
  const modalFooterRef = useRef(null)

  useEffect(() => {
    function handleOutsideClick(e) {
      if (materialMenuRef.current && !materialMenuRef.current.contains(e.target)) setMaterialMenuOpen(false)
    }
    if (materialMenuOpen) document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [materialMenuOpen])

  function toggleMaterialMenu() {
    if (!materialMenuOpen && materialButtonRef.current) {
      const rect = materialButtonRef.current.getBoundingClientRect()
      const margin = 8
      // Boşluğu tüm ekrana göre değil, modal kutusunun kendi üst/alt sınırına göre
      // hesaplıyoruz — aksi halde dropdown modalın altındaki footer'ı (İptal/Talep
      // Oluştur) veya üstündeki alanları (Proje) kapatabiliyor.
      const boxRect = modalBoxRef.current?.getBoundingClientRect()
      const footerTop = modalFooterRef.current?.getBoundingClientRect().top
      const boundBottom = footerTop ?? boxRect?.bottom ?? window.innerHeight
      const boundTop = boxRect?.top ?? 0
      const spaceBelow = boundBottom - rect.bottom - margin
      const spaceAbove = rect.top - boundTop - margin
      const openUp = spaceBelow < 120 && spaceAbove > spaceBelow
      setMaterialMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.max(80, Math.min(220, spaceAbove)) }
          : { top: rect.bottom + 4, maxHeight: Math.max(80, Math.min(220, spaceBelow)) }),
      })
    }
    setMaterialMenuOpen(v => !v)
  }

  useEffect(() => {
    if (!form.project_id) { setMaterialOptions([]); return }
    supabase.from('procurement_items').select('id, equipment').eq('project_id', form.project_id)
      .then(({ data }) => {
        const seen = new Set()
        const options = []
        ;(data || []).forEach(row => {
          if (!row.equipment || seen.has(row.equipment)) return
          seen.add(row.equipment)
          options.push({ id: row.id, equipment: row.equipment })
        })
        setMaterialOptions(options)
      })
  }, [form.project_id])

  useEffect(() => {
    if (defaultProjectId) {
      setForm(f => ({ ...f, project_id: defaultProjectId }))

      async function loadDefaultProject() {
        const byId = await supabase.from('projects')
          .select('id, name')
          .eq('id', defaultProjectId)
          .maybeSingle()

        if (byId.data) {
          setProjects([byId.data])
          return
        }

        const label = projectIdLabel(defaultProjectId)
        if (label !== 'Bağlı Proje') {
          const byName = await supabase.from('projects')
            .select('id, name')
            .ilike('name', `%${String(defaultProjectId).replace(/[-_]+/g, ' ')}%`)
            .limit(1)
            .maybeSingle()

          if (byName.data) {
            setProjects([{ ...byName.data, id: defaultProjectId }])
            return
          }
        }

        setProjects([{ id: defaultProjectId, name: label }])
      }

      loadDefaultProject()
      return
    }

    if (availableProjects?.length) {
      setProjects(availableProjects)
      return
    }

    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => setProjects(data || []))
  }, [defaultProjectId, availableProjects])

  const setF = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  const updateItem = (field, value) => setItem(it => ({ ...it, [field]: value }))

  function handleCategoryChange(e) {
    setForm(f => ({ ...f, category: e.target.value }))
    setUseOther(false)
    setMaterialMenuOpen(false)
    setItem(it => ({ ...it, name: '', bom_item_id: null }))
  }

  function selectMaterial(option) {
    if (option === OTHER_VALUE) {
      setUseOther(true)
      setItem(it => ({ ...it, name: '', bom_item_id: null }))
    } else {
      setUseOther(false)
      setItem(it => ({ ...it, name: option.equipment, bom_item_id: option.id }))
    }
    setMaterialMenuOpen(false)
  }

  async function handleSubmit() {
    if (!form.project_id) {
      setErrorMessage('Satın alma talebi oluşturmak için proje seçimi zorunludur.')
      return
    }
    if (!form.title.trim() || !item.name.trim()) return
    setSaving(true)
    setErrorMessage(null)

    const { error } = await supabase.rpc('create_purchase_request_with_items', {
      p_project_id:   form.project_id,
      p_title:        form.title.trim(),
      p_urgency:      form.urgency,
      p_category:     form.category,
      p_request_note: form.request_note.trim() || null,
      p_requested_by: user.id,
      p_items: [{
        name:        item.name.trim(),
        quantity:    Number(item.quantity) || 1,
        unit:        item.unit,
        bom_item_id: item.bom_item_id || null,
      }],
    })

    if (error) {
      setErrorMessage(error.message || 'Talep kaydedilemedi.')
    } else {
      onSaved()
    }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="modal-centered-box" ref={modalBoxRef} style={{ width: '100%', maxWidth: 560 }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>Yeni Satın Alma Talebi</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label style={LABEL}>Proje *</label>
            <select required value={form.project_id} onChange={setF('project_id')} style={INPUT} disabled={!!defaultProjectId}>
              <option value="">— Proje seçin —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {errorMessage && (
            <p style={{ margin: '-6px 0 0', color: '#B42318', fontSize: 13 }}>{errorMessage}</p>
          )}

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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={LABEL}>Tip</label>
              <select value={form.category} onChange={handleCategoryChange} style={INPUT}>
                <option value="malzeme">Malzeme</option>
                <option value="hizmet">Hizmet</option>
                <option value="diger">Diğer</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Aciliyet</label>
              <select value={form.urgency} onChange={setF('urgency')} style={INPUT}>
                {URGENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
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
            <label style={LABEL}>{form.category === 'hizmet' ? 'Hizmet' : form.category === 'diger' ? 'Diğer Talep' : 'Malzeme'}</label>
            <div className="talep-item-row">
              {form.category === 'malzeme' ? (
                useOther ? (
                  <input
                    autoFocus
                    placeholder="Eklenecek malzemenin adını yazın"
                    value={item.name}
                    onChange={e => setItem(it => ({ ...it, name: e.target.value, bom_item_id: null }))}
                    style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}
                  />
                ) : (
                  <div ref={materialMenuRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      ref={materialButtonRef}
                      onClick={toggleMaterialMenu}
                      style={{
                        border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
                        width: '100%', boxSizing: 'border-box', background: '#fff', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, textAlign: 'left',
                      }}
                    >
                      <span style={{ color: item.name ? '#111827' : '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name || '— Malzeme seçin —'}
                      </span>
                      <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>▾</span>
                    </button>
                    {materialMenuOpen && materialMenuStyle && (
                      <div style={{
                        ...materialMenuStyle, zIndex: 2000,
                        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
                        overflowY: 'auto', boxShadow: '0 12px 28px rgba(15,23,42,0.16)',
                      }}>
                        {materialOptions.map(option => (
                          <div
                            key={option.id}
                            onClick={() => selectMaterial(option)}
                            style={{ padding: '8px 10px', fontSize: 13, cursor: 'pointer', color: '#111827', borderBottom: '1px solid #F3F4F6' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                          >
                            {option.equipment}
                          </div>
                        ))}
                        <div
                          onClick={() => selectMaterial(OTHER_VALUE)}
                          style={{ padding: '8px 10px', fontSize: 13, cursor: 'pointer', color: '#92400E', fontWeight: 600 }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FEF3C7' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                        >
                          Diğer (Listede Yok)
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <input
                  placeholder={form.category === 'diger' ? 'Talep açıklaması' : 'Hizmet adı'}
                  value={item.name}
                  onChange={e => updateItem('name', e.target.value)}
                  style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}
                />
              )}
              <input
                type="number"
                min="0"
                placeholder="Miktar"
                value={item.quantity}
                onChange={e => updateItem('quantity', e.target.value)}
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 8px', fontSize: 13, fontFamily: 'inherit' }}
              />
              <select
                value={item.unit}
                onChange={e => updateItem('unit', e.target.value)}
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 6px', fontSize: 13, fontFamily: 'inherit' }}
              >
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            {useOther && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#92400E' }}>
                ⚠ Listede olmayan bu malzeme için risk hesaplanamayacak.
              </p>
            )}
          </div>
        </div>

        <div ref={modalFooterRef} style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim() || !form.project_id || !item.name.trim()}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (!form.title.trim() || !form.project_id || !item.name.trim()) ? 0.5 : 1 }}
          >
            {saving ? 'Kaydediliyor…' : 'Talep Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
