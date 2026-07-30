import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const CATEGORY_LABELS = {
  mobilizasyon: 'Mobilizasyon',
  mekanik: 'Mekanik',
  elektrik_dc: 'Elektrik DC',
  elektrik_ac: 'Elektrik AC',
  elektrik_og: 'Elektrik OG',
  topraklama: 'Topraklama',
  enh: 'ENH',
  devreye_alma: 'Devreye Alma',
  evrak_sureci: 'Evrak Süreci',
  satin_alma: 'Satın Alma',
  kolon_montaji: 'Kolon Montajı',
  kiris_montaji: 'Kiriş Montajı',
  asik_montaji: 'Aşık Montajı',
  panel_montaji: 'Panel Montajı',
  kosk_trafo: 'Köşk / Trafo',
}

const inputStyle = {
  width: 110,
  padding: '0.5rem 0.65rem',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  textAlign: 'right',
}

function equalWeights(categories) {
  if (!categories.length) return []
  const totalHundredths = 10000
  const base = Math.floor(totalHundredths / categories.length)
  return categories.map((category, index) => ({
    category,
    weight_pct: String((index === categories.length - 1
      ? totalHundredths - base * (categories.length - 1)
      : base) / 100),
  }))
}

function uniqueCategories(rows = []) {
  return [...new Set(rows.map(row => row.category).filter(Boolean))]
}

export default function Adim3KategoriAgirliklari({ projectId, taskRows, result, mode = 'new', onDone, onBack }) {
  const taskCategories = useMemo(() => uniqueCategories(taskRows), [taskRows])
  const [rows, setRows] = useState(() => result?.rows?.length
    ? result.rows.map(row => ({ ...row, weight_pct: String(row.weight_pct) }))
    : mode === 'new' ? equalWeights(taskCategories) : [])
  const [loading, setLoading] = useState(mode === 'edit' && !result?.rows?.length)
  const [error, setError] = useState(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (mode !== 'edit' || result?.rows?.length || loadedRef.current) return
    loadedRef.current = true

    Promise.all([
      supabase.from('project_category_weights').select('category, weight_pct').eq('project_id', projectId).order('category'),
      taskCategories.length
        ? Promise.resolve({ data: [] })
        : supabase.from('project_tasks').select('category').eq('project_id', projectId),
    ]).then(([weightResult, taskResult]) => {
      if (weightResult.error || taskResult.error) {
        setError(weightResult.error?.message || taskResult.error?.message)
        return
      }
      const stored = weightResult.data || []
      const categories = taskCategories.length ? taskCategories : uniqueCategories(taskResult.data)
      const storedCategories = new Set(stored.map(row => row.category))
      setRows([
        ...stored.map(row => ({ category: row.category, weight_pct: String(row.weight_pct) })),
        ...categories.filter(category => !storedCategories.has(category)).map(category => ({ category, weight_pct: '0' })),
      ])
    }).finally(() => setLoading(false))
  }, [mode, projectId, result, taskCategories])

  const total = rows.reduce((sum, row) => sum + (Number(row.weight_pct) || 0), 0)
  const validTotal = Math.abs(total - 100) <= 0.01

  function updateWeight(category, value) {
    setRows(current => current.map(row => row.category === category ? { ...row, weight_pct: value } : row))
  }

  function handleSave() {
    setError(null)
    if (!rows.length) {
      onDone({ skipped: true, rows: [], count: 0 })
      return
    }
    if (rows.some(row => row.weight_pct === '' || Number(row.weight_pct) < 0 || Number(row.weight_pct) > 100)) {
      setError('Her kategori ağırlığı 0 ile 100 arasında olmalıdır.')
      return
    }
    if (!validTotal) {
      setError(`Kategori ağırlıkları toplamı %100 olmalıdır. Mevcut toplam: %${total.toFixed(2)}`)
      return
    }
    onDone({
      skipped: false,
      count: rows.length,
      rows: rows.map(row => ({ category: row.category, weight_pct: Number(row.weight_pct) })),
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>İlerleme Kategori Ağırlıkları</h3>
        <span style={{ fontSize: 12, color: validTotal ? '#15803d' : '#b45309', fontWeight: 700 }}>
          Toplam: %{total.toFixed(2)}
        </span>
      </div>

      <div style={{ padding: '1.25rem 1.5rem' }}>
        <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
          Projenin genel ilerlemesinde her iş kategorisinin etkisini belirleyin. Kaydetmek için toplam tam olarak %100 olmalıdır.
        </p>

        {error && (
          <div role="alert" style={{ padding: '0.65rem 0.85rem', marginBottom: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Kategori ağırlıkları yükleniyor…</p>
        ) : rows.length === 0 ? (
          <div style={{ padding: '1rem', border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b', fontSize: 13 }}>
            İş kalemi kategorisi bulunmadı. Önce İş Kalemleri adımına görev ekleyebilirsiniz.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {rows.map(row => (
              <div key={row.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem 0.9rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fafafa' }}>
                <label htmlFor={`weight-${row.category}`} style={{ color: '#0f172a', fontSize: 13, fontWeight: 600 }}>
                  {CATEGORY_LABELS[row.category] || row.category}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    id={`weight-${row.category}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.weight_pct}
                    onChange={event => updateWeight(row.category, event.target.value)}
                    style={inputStyle}
                  />
                  <span style={{ color: '#64748b', fontSize: 13 }}>%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'none' }}>
        <button type="button" onClick={onBack}>← Geri</button>
        <button type="button" data-wizard-submit="next" onClick={handleSave}>Devam →</button>
      </div>
    </div>
  )
}
