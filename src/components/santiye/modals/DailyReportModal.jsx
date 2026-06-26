import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { todayStr } from '../../../hooks/useSantiyeData'

const SHIFTS      = ['mühendis', 'usta', 'işçi']
const DEPARTMENTS = ['idari', 'mekanik', 'elektrik', 'yevmiyeci']
const MACHINE_TYPES = ['ekskavatör', 'jcb', 'loader', 'rok_delim', 'gayk_delici', 'vinç', 'kamyon', 'traktör']
const MACHINE_LABELS = {
  ekskavatör: 'Ekskavatör', jcb: 'JCB', loader: 'Loader', rok_delim: 'Rok Delim',
  gayk_delici: 'Gayk Delici', vinç: 'Vinç', kamyon: 'Kamyon', traktör: 'Traktör',
}
const WEATHER_OPTIONS = ['açık', 'parçalı bulutlu', 'bulutlu', 'yağmurlu', 'karlı', 'fırtınalı']
const WEATHER_EMOJI   = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️', 61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️', 80: '🌦️', 81: '🌦️', 82: '⛈️', 95: '⛈️', 99: '⛈️' }
const WC_TO_ENUM = { 0: 'açık', 1: 'parçalı bulutlu', 2: 'parçalı bulutlu', 3: 'bulutlu',
  51: 'yağmurlu', 53: 'yağmurlu', 55: 'yağmurlu', 61: 'yağmurlu', 63: 'yağmurlu', 65: 'yağmurlu',
  80: 'yağmurlu', 81: 'yağmurlu', 82: 'yağmurlu', 71: 'karlı', 73: 'karlı', 75: 'karlı',
  95: 'fırtınalı', 99: 'fırtınalı' }
const CATEGORY_LABELS = {
  mobilizasyon: 'Mobilizasyon', mekanik: 'Mekanik', elektrik_dc: 'Elektrik DC',
  elektrik_ac: 'Elektrik AC', elektrik_og: 'Elektrik OG', topraklama: 'Topraklama',
  enh: 'ENH', devreye_alma: 'Devreye Alma', elektrik: 'Elektrik', inşaat: 'İnşaat', diğer: 'Diğer',
}
const CATEGORY_COLORS = {
  mobilizasyon: '#6366F1', mekanik: '#0EA5E9', elektrik_dc: '#F59E0B', elektrik_ac: '#F59E0B',
  elektrik_og: '#EF4444', topraklama: '#84CC16', enh: '#8B5CF6', devreye_alma: '#185FA5',
  elektrik: '#F59E0B', inşaat: '#78716C', diğer: '#9CA3AF',
}

function initPersonnel() {
  const p = {}
  SHIFTS.forEach(s => DEPARTMENTS.forEach(d => { p[`${s}|${d}`] = 0 }))
  return p
}
function initMachinery() {
  const m = {}
  MACHINE_TYPES.forEach(t => { m[t] = { count: 0, status: 'çalışıyor', notes: '' } })
  return m
}

export default function DailyReportModal({ projectId, userId, profileId, onClose, onSaved }) {
  const today = todayStr()

  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [toast, setToast]           = useState('')
  const [error, setError]           = useState('')
  const [reportId, setReportId]     = useState(null)

  const [form, setForm] = useState({
    general_status: 'normal',
    weather:        'açık',
    weather_note:   '',
    notes:          '',
  })
  const [personnel, setPersonnel] = useState(initPersonnel)
  const [machinery, setMachinery] = useState(initMachinery)
  const [progressItems, setProgressItems] = useState([])
  const [existingQtys, setExistingQtys]   = useState({})

  useEffect(() => {
    loadAll()
    fetchWeather()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [reportRes, itemsRes] = await Promise.all([
      supabase.from('daily_reports')
        .select('id, general_status, worker_count, weather, weather_note, notes')
        .eq('project_id', projectId).eq('report_date', today).maybeSingle(),
      supabase.from('progress_items')
        .select('id, name, unit, target_qty, total_progress, category, order_index')
        .eq('project_id', projectId)
        .order('category').order('order_index'),
    ])

    const report = reportRes.data
    if (report) {
      setReportId(report.id)
      setForm({
        general_status: report.general_status || 'normal',
        weather:        report.weather        || 'açık',
        weather_note:   report.weather_note   || '',
        notes:          report.notes          || '',
      })

      const [persRes, machRes, progRes] = await Promise.all([
        supabase.from('personnel_log_entries').select('shift, department, count').eq('report_id', report.id),
        supabase.from('machinery_logs').select('machine_type, count, status, notes').eq('report_id', report.id),
        supabase.from('progress_daily').select('item_id, id, qty_added').eq('report_id', report.id),
      ])

      const pState = initPersonnel()
      ;(persRes.data || []).forEach(e => { pState[`${e.shift}|${e.department}`] = e.count })
      setPersonnel(pState)

      const mState = initMachinery()
      ;(machRes.data || []).forEach(m => {
        if (mState[m.machine_type]) mState[m.machine_type] = { count: m.count, status: m.status, notes: m.notes || '' }
      })
      setMachinery(mState)

      const eQtys = {}
      ;(progRes.data || []).forEach(e => { eQtys[e.item_id] = { id: e.id, qty: Number(e.qty_added) } })
      setExistingQtys(eQtys)

      const items = (itemsRes.data || []).map(item => ({
        ...item,
        qty_today: eQtys[item.id]?.qty || 0,
        note: '',
      }))
      setProgressItems(items)
    } else {
      setProgressItems((itemsRes.data || []).map(item => ({ ...item, qty_today: 0, note: '' })))
    }

    setLoading(false)
  }

  async function fetchWeather() {
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=38.6823&longitude=29.4082&current=weathercode&timezone=Europe/Istanbul')
      const data = await res.json()
      const wc = data?.current?.weathercode
      if (wc !== undefined) {
        const mapped = WC_TO_ENUM[wc] || 'açık'
        setForm(f => ({ ...f, weather: mapped }))
      }
    } catch {}
  }

  function updateProgressQty(id, value) {
    setProgressItems(prev => prev.map(item =>
      item.id === id ? { ...item, qty_today: Number(value) || 0 } : item
    ))
  }
  function updateProgressNote(id, note) {
    setProgressItems(prev => prev.map(item => item.id === id ? { ...item, note } : item))
  }
  function setPersonnelCell(key, val) {
    setPersonnel(p => ({ ...p, [key]: Math.max(0, parseInt(val) || 0) }))
  }
  function setMachineryField(type, field, val) {
    setMachinery(m => ({ ...m, [type]: { ...m[type], [field]: field === 'count' ? (parseInt(val) || 0) : val } }))
  }

  const totalPersonnel = Object.values(personnel).reduce((s, v) => s + (Number(v) || 0), 0)

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const { data: rep, error: repErr } = await supabase.from('daily_reports')
        .upsert({
          project_id:     projectId,
          report_date:    today,
          created_by:     userId,
          general_status: form.general_status,
          worker_count:   totalPersonnel,
          weather:        form.weather,
          weather_note:   form.weather_note || null,
          notes:          form.notes || null,
          updated_at:     new Date().toISOString(),
        }, { onConflict: 'project_id,report_date' })
        .select('id').single()

      if (repErr) throw repErr
      const rid = rep.id

      await supabase.from('personnel_log_entries').delete().eq('report_id', rid)
      const persRows = Object.entries(personnel)
        .filter(([, v]) => Number(v) > 0)
        .map(([key, count]) => {
          const [shift, department] = key.split('|')
          return { report_id: rid, shift, department, count: Number(count) }
        })
      if (persRows.length) await supabase.from('personnel_log_entries').insert(persRows)

      await supabase.from('machinery_logs').delete().eq('report_id', rid)
      const machRows = Object.entries(machinery)
        .filter(([, v]) => v.count > 0)
        .map(([machine_type, v]) => ({ report_id: rid, machine_type, count: v.count, status: v.status, notes: v.notes || null }))
      if (machRows.length) await supabase.from('machinery_logs').insert(machRows)

      const toInsert = []
      for (const item of progressItems) {
        const newQty = Number(item.qty_today) || 0
        const oldQty = existingQtys[item.id]?.qty || 0
        const diff   = newQty - oldQty
        if (newQty > 0) toInsert.push({ report_id: rid, item_id: item.id, qty_added: newQty, note: item.note || null })
        if (diff !== 0) {
          const newTotal = Math.max(0, (Number(item.total_progress) || 0) + diff)
          await supabase.from('progress_items').update({ total_progress: newTotal }).eq('id', item.id)
        }
      }
      await supabase.from('progress_daily').delete().eq('report_id', rid)
      if (toInsert.length) await supabase.from('progress_daily').insert(toInsert)

      setToast('Rapor kaydedildi ✓')
      setTimeout(() => { onSaved?.(); onClose() }, 900)
    } catch (e) {
      setError(e.message || 'Kayıt sırasında hata oluştu.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={OVERLAY}>
      <div style={{ ...PANEL, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <p style={{ color: '#9CA3AF', fontSize: 14 }}>Yükleniyor…</p>
      </div>
    </div>
  )

  const groupedItems = {}
  progressItems.forEach(item => {
    const cat = item.category || 'diğer'
    if (!groupedItems[cat]) groupedItems[cat] = []
    groupedItems[cat].push(item)
  })

  return (
    <div style={OVERLAY} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={PANEL}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>Günlük Saha Raporu</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>
              {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} style={CLOSE_BTN}>×</button>
        </div>

        {toast && (
          <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 24px', fontSize: 13, fontWeight: 600 }}>
            {toast}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Genel Durum */}
            <div>
              <p style={SECTION_TITLE}>Genel Durum</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { value: 'normal',  label: '🟢 Normal Seyir',         bg: '#D1FAE5', color: '#065F46' },
                  { value: 'dikkat',  label: '🟡 Dikkat',               bg: '#FEF3C7', color: '#92400E' },
                  { value: 'kritik',  label: '🔴 Kritik',               bg: '#FEE2E2', color: '#991B1B' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, general_status: opt.value }))}
                    style={{
                      flex: 1, padding: '8px 6px', borderRadius: 8, border: '2px solid',
                      borderColor: form.general_status === opt.value ? opt.color : '#E5E7EB',
                      background: form.general_status === opt.value ? opt.bg : '#F9FAFB',
                      color: form.general_status === opt.value ? opt.color : '#6B7280',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.1s',
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Personel */}
            <div>
              <p style={{ ...SECTION_TITLE, marginBottom: 10 }}>
                Personel
                <span style={{ fontSize: 11, fontWeight: 500, color: '#185FA5', marginLeft: 8 }}>
                  Toplam: {totalPersonnel} kişi
                </span>
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={TH}></th>
                      {DEPARTMENTS.map(d => <th key={d} style={TH}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {SHIFTS.map(shift => (
                      <tr key={shift}>
                        <td style={{ ...TD, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{shift}</td>
                        {DEPARTMENTS.map(dept => {
                          const key = `${shift}|${dept}`
                          return (
                            <td key={dept} style={TD}>
                              <input
                                type="number" min={0}
                                value={personnel[key] || 0}
                                onChange={e => setPersonnelCell(key, e.target.value)}
                                style={NUM_INPUT}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* İş Makineleri */}
            <div>
              <p style={SECTION_TITLE}>İş Makineleri</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MACHINE_TYPES.map(type => (
                  <div key={type} style={{ display: 'grid', gridTemplateColumns: '90px 50px 110px 1fr', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{MACHINE_LABELS[type]}</span>
                    <input
                      type="number" min={0}
                      value={machinery[type].count}
                      onChange={e => setMachineryField(type, 'count', e.target.value)}
                      style={{ ...NUM_INPUT, width: '100%' }}
                    />
                    <select
                      value={machinery[type].status}
                      onChange={e => setMachineryField(type, 'status', e.target.value)}
                      style={{ ...SELECT, fontSize: 11 }}
                    >
                      <option value="çalışıyor">Çalışıyor</option>
                      <option value="arızalı">Arızalı</option>
                      <option value="beklemede">Beklemede</option>
                    </select>
                    <input
                      type="text"
                      value={machinery[type].notes}
                      onChange={e => setMachineryField(type, 'notes', e.target.value)}
                      placeholder="not..."
                      style={{ ...TEXT_INPUT, fontSize: 11 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Hava Durumu */}
            <div>
              <p style={SECTION_TITLE}>Hava Durumu</p>
              <select value={form.weather} onChange={e => setForm(f => ({ ...f, weather: e.target.value }))} style={SELECT}>
                {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <input
                type="text"
                value={form.weather_note}
                onChange={e => setForm(f => ({ ...f, weather_note: e.target.value }))}
                placeholder="Hava durumu notu (opsiyonel)..."
                style={{ ...TEXT_INPUT, marginTop: 8 }}
              />
            </div>

            {/* Günlük Notlar */}
            <div>
              <p style={SECTION_TITLE}>Günlük Notlar</p>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Bugün yapılan işler, önemli gelişmeler, sorunlar..."
                rows={5}
                style={{ ...TEXT_INPUT, resize: 'vertical' }}
              />
            </div>
          </div>

          {/* RIGHT COLUMN — Progress Items */}
          <div>
            <p style={{ ...SECTION_TITLE, marginBottom: 4 }}>İlerleme Girişi</p>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: '#9CA3AF' }}>Bugün tamamlanan miktarları gir</p>

            {Object.keys(groupedItems).length === 0 && (
              <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 32 }}>
                Bu proje için iş kalemi bulunamadı.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(groupedItems).map(([cat, items]) => (
                <div key={cat}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{
                      background: CATEGORY_COLORS[cat] || '#9CA3AF',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                  </div>
                  {items.map(item => {
                    const existQty = existingQtys[item.id]?.qty || 0
                    const prevTotal = (Number(item.total_progress) || 0) - existQty
                    const kalan = (Number(item.target_qty) || 0) - prevTotal - (Number(item.qty_today) || 0)
                    const isOver = kalan < 0
                    return (
                      <div key={item.id} style={{
                        background: '#F9FAFB', borderRadius: 8, padding: '10px 12px',
                        marginBottom: 8, border: isOver ? '1px solid #FECACA' : '1px solid #F3F4F6',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{item.name}</span>
                          <span style={{ fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap', marginLeft: 8 }}>
                            H:{item.target_qty} | Y:{prevTotal.toFixed(1)} | K:{Math.max(0, (Number(item.target_qty) - prevTotal)).toFixed(1)} {item.unit}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>Bugün:</span>
                          <input
                            type="number" min={0} step="0.01"
                            value={item.qty_today || ''}
                            onChange={e => updateProgressQty(item.id, e.target.value)}
                            style={{
                              width: 80, border: `1px solid ${isOver ? '#FCA5A5' : '#D1D5DB'}`,
                              borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit',
                              outline: 'none', background: isOver ? '#FFF5F5' : '#fff',
                            }}
                          />
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{item.unit}</span>
                          {kalan >= 0 && (
                            <span style={{ fontSize: 10, color: '#185FA5', marginLeft: 4 }}>
                              → Kalan: {kalan.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {isOver && (
                          <div style={{ marginTop: 8 }}>
                            <p style={{ fontSize: 11, color: '#EF4444', margin: '0 0 4px', fontWeight: 600 }}>
                              ⚠️ Hedefi aşıyor ({Math.abs(kalan).toFixed(1)} {item.unit})
                            </p>
                            <input
                              type="text"
                              value={item.note}
                              onChange={e => updateProgressNote(item.id, e.target.value)}
                              placeholder="Aşma sebebini açıkla..."
                              style={{ ...TEXT_INPUT, fontSize: 11 }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #F3F4F6',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          background: '#FAFAFA',
        }}>
          {error && <p style={{ color: '#EF4444', fontSize: 12, margin: 0 }}>{error}</p>}
          {!error && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Toplam personel: {totalPersonnel} kişi</span>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={BTN_SECONDARY}>İptal</button>
            <button onClick={handleSave} disabled={saving} style={BTN_PRIMARY}>
              {saving ? 'Kaydediliyor…' : '💾 Raporu Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
}
const PANEL = {
  background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column',
  width: '95vw', maxWidth: 1060, maxHeight: '92vh',
  boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
}
const CLOSE_BTN = {
  background: 'none', border: 'none', fontSize: 24, color: '#9CA3AF',
  cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0,
}
const SECTION_TITLE = {
  margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#374151',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}
const TH = {
  padding: '4px 6px', textAlign: 'center', fontSize: 11, fontWeight: 600,
  color: '#6B7280', background: '#F9FAFB', border: '1px solid #E5E7EB',
}
const TD = { padding: '4px 6px', textAlign: 'center', border: '1px solid #E5E7EB' }
const NUM_INPUT = {
  width: 50, textAlign: 'center', border: '1px solid #D1D5DB', borderRadius: 6,
  padding: '4px 6px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
}
const TEXT_INPUT = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #D1D5DB',
  borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', display: 'block',
}
const SELECT = {
  width: '100%', border: '1px solid #D1D5DB', borderRadius: 8,
  padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
  background: '#fff', cursor: 'pointer',
}
const BTN_PRIMARY = {
  background: '#003B8E', color: '#fff', border: 'none', borderRadius: 8,
  padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
const BTN_SECONDARY = {
  background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 8,
  padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}
