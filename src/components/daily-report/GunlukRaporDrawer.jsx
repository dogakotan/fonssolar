import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const MACHINES = [
  { key: 'vinç',        label: 'Vinç' },
  { key: 'jcb',         label: 'JCB' },
  { key: 'ekskavatör',  label: 'Ekskavatör' },
  { key: 'loader',      label: 'Loader' },
  { key: 'gayk_delici', label: 'Gayk Delici' },
  { key: 'rok_delim',   label: 'Rok Delim' },
  { key: 'kamyon',      label: 'Kamyon' },
  { key: 'traktör',     label: 'Traktör' },
]
const SHIFTS    = ['mühendis', 'usta', 'işçi']
const SHIFT_LBL = { mühendis: 'Mühendis', usta: 'Usta', işçi: 'İşçi' }
const COLS      = ['idari', 'mekanik', 'elektrik', 'yevmiyeci']
const COL_LBL   = { idari: 'İdari', mekanik: 'Mekanik', elektrik: 'Elektrik', yevmiyeci: 'Yevmiyeci' }
const WEATHER_OPTS = [
  { value: 'açık',            label: 'Açık' },
  { value: 'parçalı bulutlu', label: 'Parçalı Bulutlu' },
  { value: 'bulutlu',         label: 'Bulutlu' },
  { value: 'yağmurlu',        label: 'Yağmurlu' },
  { value: 'karlı',           label: 'Karlı' },
  { value: 'fırtınalı',       label: 'Fırtınalı' },
]
const MACH_STATUS = [
  { value: 'çalışıyor', label: 'Çalışıyor' },
  { value: 'arızalı',   label: 'Arızalı' },
  { value: 'beklemede', label: 'Beklemede' },
]

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function initPersonnel() {
  return SHIFTS.reduce((acc, s) => ({
    ...acc,
    [s]: COLS.reduce((a, c) => ({ ...a, [c]: 0 }), {}),
  }), {})
}
function initMachinery() {
  return MACHINES.reduce((acc, m) => ({
    ...acc,
    [m.key]: { count: 0, status: 'çalışıyor', notes: '' },
  }), {})
}

const INPUT = {
  border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff',
}
const NUM_INPUT = {
  ...INPUT, width: 56, textAlign: 'center', padding: '5px 4px',
}
const tabBtn = (active) => ({
  background: 'none', border: 'none', padding: '9px 14px',
  fontSize: 13, fontWeight: active ? 600 : 400,
  color: active ? '#185FA5' : '#6B7280',
  cursor: 'pointer', fontFamily: 'inherit',
  borderBottom: active ? '2px solid #185FA5' : '2px solid transparent',
  marginBottom: -2, whiteSpace: 'nowrap', transition: 'all 0.1s',
})

export default function GunlukRaporDrawer({ projectId, onClose }) {
  const { user } = useAuth()
  const [activeTab,      setActiveTab]      = useState(1)
  const [saving,         setSaving]         = useState(false)
  const [saveMsg,        setSaveMsg]        = useState(null)
  const [histLoading,    setHistLoading]    = useState(false)
  const [history,        setHistory]        = useState([])
  const [expandedShifts, setExpandedShifts] = useState({ mühendis: true, usta: true, işçi: true })

  const toggleShift = (s) => setExpandedShifts(p => ({ ...p, [s]: !p[s] }))

  // Form state
  const [date,       setDate]       = useState(todayStr())
  const [weather,    setWeather]    = useState('açık')
  const [notes,      setNotes]      = useState('')
  const [personnel,  setPersonnel]  = useState(initPersonnel())
  const [machinery,  setMachinery]  = useState(initMachinery())
  const [doneTasks,  setDoneTasks]  = useState([''])
  const [planned,    setPlanned]    = useState([''])
  const [progItems,  setProgItems]  = useState([])  // { item, qty_added, note }

  // Load progress_items for this project
  useEffect(() => {
    if (!projectId) return
    supabase.from('progress_items')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index')
      .then(({ data }) => {
        if (data) setProgItems(data.map(item => ({ item, qty_added: '', note: '' })))
      })
  }, [projectId])

  // Load today's report on mount
  useEffect(() => {
    loadReport(date)
  }, [])

  // Load history
  useEffect(() => {
    if (!projectId) return
    setHistLoading(true)
    supabase
      .from('daily_reports')
      .select(`id, report_date, weather, notes, personnel_logs(total)`)
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(10)
      .then(({ data }) => { setHistory(data || []); setHistLoading(false) })
  }, [projectId, saveMsg])

  async function loadReport(reportDate) {
    if (!projectId) return
    const { data: rep } = await supabase.from('daily_reports')
      .select('id, weather, notes')
      .eq('project_id', projectId)
      .eq('report_date', reportDate)
      .maybeSingle()

    if (!rep) {
      // Reset form to blank
      setWeather('açık')
      setNotes('')
      setPersonnel(initPersonnel())
      setMachinery(initMachinery())
      setDoneTasks([''])
      setPlanned([''])
      setProgItems(prev => prev.map(p => ({ ...p, qty_added: '', note: '' })))
      return
    }

    setWeather(rep.weather || 'açık')
    setNotes(rep.notes || '')

    // Personnel
    const { data: pLogs } = await supabase.from('personnel_logs')
      .select('*').eq('report_id', rep.id)
    if (pLogs?.length) {
      const newP = initPersonnel()
      pLogs.forEach(row => {
        if (newP[row.shift]) {
          COLS.forEach(c => { newP[row.shift][c] = row[c] || 0 })
        }
      })
      setPersonnel(newP)
    } else {
      setPersonnel(initPersonnel())
    }

    // Machinery
    const { data: mLogs } = await supabase.from('machinery_logs')
      .select('*').eq('report_id', rep.id)
    if (mLogs?.length) {
      const newM = initMachinery()
      mLogs.forEach(row => {
        if (newM[row.machine_type]) {
          newM[row.machine_type] = { count: row.count || 0, status: row.status || 'çalışıyor', notes: row.notes || '' }
        }
      })
      setMachinery(newM)
    } else {
      setMachinery(initMachinery())
    }

    // Tasks
    const { data: tasks } = await supabase.from('daily_tasks')
      .select('*').eq('report_id', rep.id).order('order_index')
    const done = tasks?.filter(t => t.type === 'done').map(t => t.description) || []
    const plan = tasks?.filter(t => t.type === 'planned').map(t => t.description) || []
    setDoneTasks(done.length ? done : [''])
    setPlanned(plan.length ? plan : [''])

    // Progress daily
    const { data: pdRows } = await supabase.from('progress_daily')
      .select('item_id, qty_added, note').eq('report_id', rep.id)
    if (pdRows) {
      setProgItems(prev => prev.map(p => {
        const found = pdRows.find(r => r.item_id === p.item.id)
        return found ? { ...p, qty_added: found.qty_added || '', note: found.note || '' } : { ...p, qty_added: '', note: '' }
      }))
    }
  }

  async function handleSave() {
    if (!projectId || !user) return
    setSaving(true)
    setSaveMsg(null)

    // 1. Upsert daily_reports
    const { data: repData, error: repErr } = await supabase.from('daily_reports')
      .upsert(
        { project_id: projectId, report_date: date, created_by: user.id, weather, notes },
        { onConflict: 'project_id,report_date' }
      )
      .select('id')
      .single()

    if (repErr || !repData) {
      setSaveMsg({ ok: false, text: 'Rapor kaydedilemedi.' })
      setSaving(false)
      return
    }
    const rid = repData.id

    // 2. Personnel logs
    await supabase.from('personnel_logs').delete().eq('report_id', rid)
    const pRows = SHIFTS.map(shift => ({
      report_id: rid, shift,
      idari:     personnel[shift].idari     || 0,
      mekanik:   personnel[shift].mekanik   || 0,
      elektrik:  personnel[shift].elektrik  || 0,
      yevmiyeci: personnel[shift].yevmiyeci || 0,
    }))
    await supabase.from('personnel_logs').insert(pRows)

    // 3. Machinery logs
    await supabase.from('machinery_logs').delete().eq('report_id', rid)
    const mRows = MACHINES.map(m => ({
      report_id: rid,
      machine_type: m.key,
      count:  machinery[m.key].count  || 0,
      status: machinery[m.key].status || 'çalışıyor',
      notes:  machinery[m.key].notes  || null,
    }))
    await supabase.from('machinery_logs').insert(mRows)

    // 4. Daily tasks
    await supabase.from('daily_tasks').delete().eq('report_id', rid)
    const taskRows = [
      ...doneTasks.filter(d => d.trim()).map((d, i) => ({ report_id: rid, type: 'done',    description: d, order_index: i })),
      ...planned.filter(d => d.trim()).map((d, i)    => ({ report_id: rid, type: 'planned', description: d, order_index: i })),
    ]
    if (taskRows.length) await supabase.from('daily_tasks').insert(taskRows)

    // 5. Progress daily
    await supabase.from('progress_daily').delete().eq('report_id', rid)
    const pdRows = progItems
      .filter(p => parseFloat(p.qty_added) > 0)
      .map(p => ({
        report_id: rid,
        item_id: p.item.id,
        qty_added: parseFloat(p.qty_added),
        note: p.note || null,
      }))
    if (pdRows.length) {
      await supabase.from('progress_daily').insert(pdRows)
      // Update total_progress per item
      for (const p of progItems) {
        const { data: agg } = await supabase.from('progress_daily')
          .select('qty_added').eq('item_id', p.item.id)
        const total = (agg || []).reduce((s, r) => s + (parseFloat(r.qty_added) || 0), 0)
        await supabase.from('progress_items').update({ total_progress: total }).eq('id', p.item.id)
      }
    }

    setSaveMsg({ ok: true, text: 'Rapor kaydedildi.' })
    setSaving(false)
  }

  function setPCell(shift, col, val) {
    setPersonnel(prev => ({ ...prev, [shift]: { ...prev[shift], [col]: parseInt(val) || 0 } }))
  }
  function setMField(key, field, val) {
    setMachinery(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }))
  }
  function setProgField(idx, field, val) {
    setProgItems(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p))
  }

  const pRowTotal = (shift) => COLS.reduce((s, c) => s + (parseInt(personnel[shift][c]) || 0), 0)
  const pColTotal = (col) => SHIFTS.reduce((s, sh) => s + (parseInt(personnel[sh][col]) || 0), 0)
  const pGrandTotal = () => SHIFTS.reduce((s, sh) => s + pRowTotal(sh), 0)

  const CAT_BADGE = {
    mekanik:  { bg: '#EFF6FF', color: '#185FA5' },
    elektrik: { bg: '#FEF3C7', color: '#92400E' },
    inşaat:   { bg: '#F0FDF4', color: '#15803D' },
    diğer:    { bg: '#F3F4F6', color: '#6B7280' },
  }

  return (
    <div className="gr-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      {/* Drawer */}
      <div className="gr-drawer">
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Günlük Rapor</p>
            <input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); loadReport(e.target.value) }}
              style={{ ...INPUT, fontSize: 13, padding: '4px 8px' }}
            />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Tab bar */}
        <div style={{ borderBottom: '2px solid #E5E7EB', display: 'flex', padding: '0 12px', flexShrink: 0, overflowX: 'auto' }}>
          {[
            { full: 'Genel',      short: 'Genel' },
            { full: 'Personel',   short: 'Personel' },
            { full: 'Makineler',  short: 'Makine' },
            { full: 'İşler',      short: 'İşler' },
            { full: 'İş Kalemi',  short: 'İlerleme' },
          ].map((t, i) => (
            <button key={i} onClick={() => setActiveTab(i + 1)} style={tabBtn(activeTab === i + 1)}>
              <span className="gr-tab-full">{t.full}</span>
              <span className="gr-tab-short">{t.short}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="gr-content">

          {/* ── Tab 1: Genel ── */}
          {activeTab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Hava Durumu</label>
                <select value={weather} onChange={e => setWeather(e.target.value)} style={{ ...INPUT, minWidth: 180 }}>
                  {WEATHER_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Genel Notlar</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Bugünkü genel gözlem ve notlar…"
                  style={{ ...INPUT, width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
            </div>
          )}

          {/* ── Tab 2: Personel ── */}
          {activeTab === 2 && (
            <>
              {/* Masaüstü / tablet: tablo */}
              <div className="gr-desktop-only" style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={TH}></th>
                      {COLS.map(c => <th key={c} style={TH}>{COL_LBL[c]}</th>)}
                      <th style={{ ...TH, color: '#374151' }}>Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SHIFTS.map(shift => (
                      <tr key={shift}>
                        <td style={{ ...TD, fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>{SHIFT_LBL[shift]}</td>
                        {COLS.map(col => (
                          <td key={col} style={TD}>
                            <input type="number" min="0"
                              value={personnel[shift][col] || ''}
                              onChange={e => setPCell(shift, col, e.target.value)}
                              style={NUM_INPUT}
                            />
                          </td>
                        ))}
                        <td style={{ ...TD, fontWeight: 700, color: '#185FA5', textAlign: 'center' }}>{pRowTotal(shift)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#F9FAFB' }}>
                      <td style={{ ...TD, fontWeight: 700, color: '#374151' }}>Toplam</td>
                      {COLS.map(col => (
                        <td key={col} style={{ ...TD, fontWeight: 700, color: '#374151', textAlign: 'center' }}>{pColTotal(col)}</td>
                      ))}
                      <td style={{ ...TD, fontWeight: 700, color: '#185FA5', textAlign: 'center' }}>{pGrandTotal()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobil: accordion kartlar */}
              <div className="gr-mobile-only">
                {SHIFTS.map(shift => (
                  <div key={shift} className="gr-shift-card">
                    <button className="gr-shift-header" onClick={() => toggleShift(shift)}>
                      <span>{SHIFT_LBL[shift]}</span>
                      <span className="gr-shift-total">Toplam: <strong>{pRowTotal(shift)}</strong></span>
                      <span className="gr-shift-chevron">{expandedShifts[shift] ? '▲' : '▼'}</span>
                    </button>
                    {expandedShifts[shift] && (
                      <div className="gr-shift-inputs">
                        {COLS.map(col => (
                          <div key={col} className="gr-shift-cell">
                            <label className="gr-shift-cell-label">{COL_LBL[col]}</label>
                            <input type="number" min="0"
                              value={personnel[shift][col] || ''}
                              onChange={e => setPCell(shift, col, e.target.value)}
                              style={{ ...NUM_INPUT, width: '100%', boxSizing: 'border-box' }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Tab 3: Makineler ── */}
          {activeTab === 3 && (
            <>
              {/* Masaüstü / tablet: tablo */}
              <div className="gr-desktop-only" style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Makine</th>
                      <th style={TH}>Adet</th>
                      <th style={TH}>Durum</th>
                      <th style={TH}>Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MACHINES.map(m => (
                      <tr key={m.key}>
                        <td style={{ ...TD, fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>{m.label}</td>
                        <td style={TD}>
                          <input type="number" min="0"
                            value={machinery[m.key].count || ''}
                            onChange={e => setMField(m.key, 'count', parseInt(e.target.value) || 0)}
                            style={NUM_INPUT}
                          />
                        </td>
                        <td style={TD}>
                          <select value={machinery[m.key].status}
                            onChange={e => setMField(m.key, 'status', e.target.value)}
                            style={{ ...INPUT, fontSize: 12 }}
                          >
                            {MACH_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </td>
                        <td style={TD}>
                          <input type="text"
                            value={machinery[m.key].notes}
                            onChange={e => setMField(m.key, 'notes', e.target.value)}
                            placeholder="—"
                            style={{ ...INPUT, width: '100%', minWidth: 100 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobil: kart satırlar */}
              <div className="gr-mobile-only">
                {MACHINES.map(m => (
                  <div key={m.key} className="gr-machine-card">
                    <span className="gr-machine-name">{m.label}</span>
                    <div className="gr-machine-row">
                      <div className="gr-machine-field">
                        <label className="gr-machine-label">Adet</label>
                        <input type="number" min="0"
                          value={machinery[m.key].count || ''}
                          onChange={e => setMField(m.key, 'count', parseInt(e.target.value) || 0)}
                          style={{ ...NUM_INPUT, width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div className="gr-machine-field">
                        <label className="gr-machine-label">Durum</label>
                        <select value={machinery[m.key].status}
                          onChange={e => setMField(m.key, 'status', e.target.value)}
                          style={{ ...INPUT, width: '100%', fontSize: 12 }}
                        >
                          {MACH_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <div className="gr-machine-field gr-machine-note">
                        <label className="gr-machine-label">Not</label>
                        <input type="text"
                          value={machinery[m.key].notes}
                          onChange={e => setMField(m.key, 'notes', e.target.value)}
                          placeholder="—"
                          style={{ ...INPUT, width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Tab 4: İşler ── */}
          {activeTab === 4 && (
            <div className="gr-tasks-grid">
              {/* Bugün Yapılanlar */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Bugün Yapılanlar</p>
                {doneTasks.map((task, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      type="text"
                      value={task}
                      onChange={e => setDoneTasks(prev => prev.map((t, j) => j === i ? e.target.value : t))}
                      placeholder={`Yapılan iş ${i + 1}`}
                      style={{ ...INPUT, flex: 1, minWidth: 0 }}
                    />
                    {doneTasks.length > 1 && (
                      <button onClick={() => setDoneTasks(prev => prev.filter((_, j) => j !== i))} style={DEL_BTN}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setDoneTasks(prev => [...prev, ''])} style={ADD_BTN}>+ Satır Ekle</button>
              </div>

              {/* Yarın Planlanıyor */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Yarın Planlanıyor</p>
                {planned.map((task, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      type="text"
                      value={task}
                      onChange={e => setPlanned(prev => prev.map((t, j) => j === i ? e.target.value : t))}
                      placeholder={`Planlanan iş ${i + 1}`}
                      style={{ ...INPUT, flex: 1, minWidth: 0 }}
                    />
                    {planned.length > 1 && (
                      <button onClick={() => setPlanned(prev => prev.filter((_, j) => j !== i))} style={DEL_BTN}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setPlanned(prev => [...prev, ''])} style={ADD_BTN}>+ Satır Ekle</button>
              </div>
            </div>
          )}

          {/* ── Tab 5: İş Kalemi İlerlemesi ── */}
          {activeTab === 5 && (
            <div>
              {progItems.length === 0 && (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Bu proje için iş kalemi tanımlanmamış.</p>
              )}
              {progItems.map((p, idx) => {
                const cb = CAT_BADGE[p.item.category] || CAT_BADGE['diğer']
                const pct = p.item.target_qty > 0 ? Math.min(100, Math.round(p.item.total_progress / p.item.target_qty * 100)) : 0
                return (
                  <div key={p.item.id} style={{ borderBottom: '1px solid #F3F4F6', padding: '12px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ ...cb, fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20 }}>
                        {p.item.category}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#111827', flex: 1 }}>{p.item.name}</span>
                      <span style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                        {p.item.total_progress} / {p.item.target_qty} {p.item.unit}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#185FA5' }}>{pct}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Bugün eklenen ({p.item.unit}):</label>
                      <input
                        type="number" min="0"
                        value={p.qty_added}
                        onChange={e => setProgField(idx, 'qty_added', e.target.value)}
                        style={{ ...NUM_INPUT, width: 70 }}
                      />
                      <label style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Not:</label>
                      <input
                        type="text"
                        value={p.note}
                        onChange={e => setProgField(idx, 'note', e.target.value)}
                        placeholder="—"
                        style={{ ...INPUT, flex: 1, minWidth: 0 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer: Save */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #E5E7EB', flexShrink: 0 }}>
          {saveMsg && (
            <p style={{ fontSize: 13, color: saveMsg.ok ? '#10B981' : '#EF4444', margin: '0 0 8px' }}>
              {saveMsg.text}
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', background: '#185FA5', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>

        {/* Geçmiş Raporlar */}
        <div style={{ borderTop: '1px solid #E5E7EB', flexShrink: 0, maxHeight: 180, overflowY: 'auto' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', margin: 0, padding: '10px 20px 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Geçmiş Raporlar
          </p>
          {histLoading && <p style={{ fontSize: 13, color: '#9CA3AF', padding: '0 20px 12px', margin: 0 }}>Yükleniyor…</p>}
          {!histLoading && history.length === 0 && <p style={{ fontSize: 13, color: '#9CA3AF', padding: '0 20px 12px', margin: 0 }}>Rapor yok.</p>}
          {history.map(h => {
            const pTotal = (h.personnel_logs || []).reduce((s, r) => s + (r.total || 0), 0)
            const isCurrent = h.report_date === date
            return (
              <div
                key={h.id}
                onClick={() => { setDate(h.report_date); loadReport(h.report_date) }}
                style={{
                  padding: '7px 20px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center',
                  background: isCurrent ? '#EFF6FF' : 'transparent',
                  borderLeft: isCurrent ? '3px solid #185FA5' : '3px solid transparent',
                }}
                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = '#F9FAFB' }}
                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 13, fontWeight: isCurrent ? 600 : 400, color: isCurrent ? '#185FA5' : '#374151', minWidth: 90 }}>
                  {new Date(h.report_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span style={{ fontSize: 12, color: '#6B7280' }}>{h.weather || '—'}</span>
                {pTotal > 0 && <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>{pTotal} kişi</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const TH = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px',
  borderBottom: '1px solid #F3F4F6', background: '#F9FAFB',
}
const TD = {
  padding: '8px 10px', borderBottom: '1px solid #F3F4F6',
}
const ADD_BTN = {
  background: 'none', border: '1px dashed #D1D5DB', borderRadius: 7,
  padding: '5px 12px', fontSize: 12, color: '#6B7280', cursor: 'pointer',
  fontFamily: 'inherit', marginTop: 2,
}
const DEL_BTN = {
  background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer',
  fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0,
}
