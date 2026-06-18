import { useState, useEffect } from 'react'
import { getAllWorkPackages, getWorkPackages, getProjects } from '../../../api'

const KATEGORI_RENK = {
  santiye: '#0d9488',
  mekanik: '#16a34a',
  dc:      '#7c3aed',
  ac:      '#ea580c',
  og:      '#2563eb',
  enh:     '#ca8a04',
  diger:   '#64748b',
}

const KAT_STIL = {
  santiye: { bg: '#1e40af', text: '#fff', label: 'ŞANTİYE MOBİLİZASYON', prefix: 'S' },
  mekanik: { bg: '#15803d', text: '#fff', label: 'MEKANİK BÖLÜM',         prefix: 'M' },
  dc:      { bg: '#6d28d9', text: '#fff', label: 'ELEKTRİKSEL — DC',       prefix: 'E' },
  ac:      { bg: '#c2410c', text: '#fff', label: 'ELEKTRİKSEL — AC',       prefix: 'E' },
  og:      { bg: '#0369a1', text: '#fff', label: 'ELEKTRİKSEL — OG',       prefix: 'E' },
  enh:     { bg: '#92400e', text: '#fff', label: 'ENH',                     prefix: 'N' },
  diger:   { bg: '#475569', text: '#fff', label: 'DİĞER',                   prefix: 'D' },
}

function kategoriAnahtari(w) {
  if (w.category) {
    const c = w.category.toLowerCase()
    if (c.includes('şantiye') || c.includes('santiye') || c.includes('mobilizasyon')) return 'santiye'
    if (c.includes('mekanik')) return 'mekanik'
    if (c.includes('dc'))      return 'dc'
    if (c.includes('ac'))      return 'ac'
    if (c.includes('og') || c.includes('enerji nakil')) return 'og'
    if (c.includes('enh'))     return 'enh'
    return c
  }
  const n = (w.name || w.title || '').toLowerCase()
  if (n.includes('arazi') || n.includes('ulaşım') || n.includes('işletme bina') || n.includes('depo'))    return 'santiye'
  if (n.includes('kolon') || n.includes('kiriş') || n.includes('aşık') || n.includes('panel montaj'))    return 'mekanik'
  if (n.includes('dc') || n.includes('kablo reglaj') || n.includes('konnektör') || n.includes('izolasyon')) return 'dc'
  if (n.includes('ac') || n.includes('inverter') || n.includes('ges pano'))                               return 'ac'
  if (n.includes('xlpe') || n.includes('og ') || n.includes('köşk') || n.includes('trafo') || n.includes('scada')) return 'og'
  if (n.includes('enh') || n.includes('enerji nakil'))                                                    return 'enh'
  return 'diger'
}

const W_NO   = 44
const W_ISIM = 200
const W_BAS  = 82
const W_BIT  = 82
const W_SURE = 54
const W_PCT  = 64
const W_MON  = 110

export default function TabIsPlan({ projectId }) {
  const [tasks,    setTasks]   = useState([])
  const [project,  setProject] = useState(null)
  const [loading,  setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const fetchTasks    = projectId ? getWorkPackages(projectId) : getAllWorkPackages()
    const fetchProjects = getProjects()

    Promise.all([fetchTasks, fetchProjects]).then(([{ data: wData }, { data: pData }]) => {
      const seen = new Set()
      const deduped = (wData || []).filter(w => {
        const key = (w.name || w.title || '').trim().toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setTasks(deduped)
      if (projectId && pData) {
        setProject(pData.find(p => p.id === projectId) || null)
      }
      setLoading(false)
    })
  }, [projectId])

  if (loading) {
    return (
      <div className="card">
        <div className="card-header"><h3>Gantt İş Planı</h3></div>
        <p style={{ padding: '2rem', color: 'var(--color-muted)' }}>Yükleniyor…</p>
      </div>
    )
  }

  const withDates = tasks.filter(w => w.start_date && w.due_date)

  if (withDates.length === 0) {
    return (
      <div className="card">
        <div className="card-header"><h3>Gantt İş Planı</h3></div>
        <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>
          {tasks.length === 0
            ? 'İş paketi bulunamadı. Supabase work_packages tablosuna veri eklediğinizden emin olun.'
            : 'Tarih bilgisi (start_date) olan iş paketi bulunamadı.'}
        </p>
      </div>
    )
  }

  const minTs = Math.min(...withDates.map(w => new Date(w.start_date).getTime()))
  const maxTs = Math.max(...withDates.map(w => new Date(w.due_date).getTime()))

  const months = []
  let cur = new Date(new Date(minTs).getFullYear(), new Date(minTs).getMonth(), 1)
  while (cur.getTime() <= maxTs) {
    months.push({ label: cur.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase(), year: cur.getFullYear(), month: cur.getMonth() })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  const SIRALAMA = ['santiye', 'mekanik', 'dc', 'ac', 'og', 'enh', 'diger']
  const grouped  = {}
  withDates.forEach(w => {
    const k = kategoriAnahtari(w)
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(w)
  })
  const grupSirali = SIRALAMA.filter(k => grouped[k])

  const today     = new Date()
  const showToday = today.getTime() >= minTs && today.getTime() <= maxTs

  const cell = {
    flexShrink: 0, padding: '4px 6px', borderRight: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center',
  }
  const th = {
    ...cell, background: '#1e293b', color: '#f1f5f9',
    fontSize: 10, fontWeight: 700, justifyContent: 'center',
    borderRight: '1px solid #334155', borderBottom: '2px solid #475569',
    whiteSpace: 'nowrap',
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 style={{ marginBottom: 2 }}>Gantt İş Planı</h3>
          {project && (
            <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>
              {project.name}
              {project.capacity_kwp && ` · ${(project.capacity_kwp / 1000).toFixed(3)} MWp`}
              {project.location && ` · ${project.location}`}
              {project.start_date && ` · Başlangıç: ${new Date(project.start_date).toLocaleDateString('tr-TR')}`}
              {project.target_date && ` · Bitiş: ${new Date(project.target_date).toLocaleDateString('tr-TR')}`}
              {project.total_days && ` · Toplam: ~${project.total_days} Takvim Günü`}
            </p>
          )}
        </div>
        {showToday && (
          <span style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 2, height: 12, background: '#ef4444', borderRadius: 1, display: 'inline-block' }} />
            Bugün: {today.toLocaleDateString('tr-TR')}
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: W_NO + W_ISIM + W_BAS + W_BIT + W_SURE + W_PCT + months.length * W_MON }}>

          {/* Başlık satırı */}
          <div style={{ display: 'flex' }}>
            <div style={{ ...th, width: W_NO }}>No</div>
            <div style={{ ...th, width: W_ISIM, justifyContent: 'flex-start' }}>İŞ KALEMİ / BÖLÜM</div>
            <div style={{ ...th, width: W_BAS }}>BAŞLANGIÇ</div>
            <div style={{ ...th, width: W_BIT }}>BİTİŞ</div>
            <div style={{ ...th, width: W_SURE }}>SÜRE</div>
            <div style={{ ...th, width: W_PCT }}>İLERLEME</div>
            {months.map((m, i) => (
              <div key={i} style={{ ...th, width: W_MON, background: '#1e3a5f' }}>{m.label}</div>
            ))}
          </div>

          {/* Kategori grupları */}
          {grupSirali.map(k => {
            const stil  = KAT_STIL[k]
            const renk  = KATEGORI_RENK[k]
            const items = grouped[k]

            return (
              <div key={k}>
                {/* Kategori başlık */}
                <div style={{ display: 'flex', background: stil.bg, minHeight: 28 }}>
                  <div style={{ width: W_NO, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.15)' }} />
                  <div style={{
                    width: W_ISIM + W_BAS + W_BIT + W_SURE + W_PCT,
                    flexShrink: 0, padding: '5px 10px',
                    color: stil.text, fontSize: 11, fontWeight: 800,
                    letterSpacing: '0.06em', borderRight: '1px solid rgba(255,255,255,0.15)',
                  }}>
                    ▶ {stil.label}
                  </div>
                  {months.map((m, mi) => (
                    <div key={mi} style={{ width: W_MON, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.1)' }} />
                  ))}
                </div>

                {/* Görev satırları */}
                {items.map((w, i) => {
                  const start = new Date(w.start_date).getTime()
                  const end   = new Date(w.due_date).getTime()
                  const sure  = Math.round((end - start) / 86400000)
                  const pct   = w.progress || 0

                  return (
                    <div key={w.id} style={{
                      display: 'flex', minHeight: 34,
                      background: i % 2 === 0 ? '#ffffff' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                    }}>
                      <div style={{ ...cell, width: W_NO, justifyContent: 'center', fontSize: 10, fontWeight: 700, color: renk }}>
                        {stil.prefix}{i + 1}
                      </div>
                      <div style={{ ...cell, width: W_ISIM, fontSize: 12, color: 'var(--color-text)', overflow: 'hidden' }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {w.name || w.title || '—'}
                        </span>
                      </div>
                      <div style={{ ...cell, width: W_BAS, justifyContent: 'center', fontSize: 11, color: 'var(--color-muted)' }}>
                        {new Date(w.start_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      <div style={{ ...cell, width: W_BIT, justifyContent: 'center', fontSize: 11, color: 'var(--color-muted)' }}>
                        {new Date(w.due_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      <div style={{ ...cell, width: W_SURE, justifyContent: 'center', fontSize: 11, color: 'var(--color-muted)' }}>
                        {sure}
                      </div>
                      <div style={{ ...cell, width: W_PCT, justifyContent: 'center', fontSize: 11, fontWeight: 700, color: pct > 0 ? '#16a34a' : 'var(--color-muted)' }}>
                        %{pct}
                      </div>

                      {/* Gantt barları */}
                      {months.map((m, mi) => {
                        const mStart = new Date(m.year, m.month, 1).getTime()
                        const mEnd   = new Date(m.year, m.month + 1, 0, 23, 59, 59).getTime()
                        const barS   = Math.max(start, mStart)
                        const barE   = Math.min(end, mEnd)
                        const isToday = showToday && today.getTime() >= mStart && today.getTime() <= mEnd
                        const todayX  = isToday ? (today.getTime() - mStart) / (mEnd - mStart) * 100 : null

                        if (barS > barE) {
                          return (
                            <div key={mi} style={{ width: W_MON, flexShrink: 0, position: 'relative', borderRight: '1px solid #e2e8f0', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              {todayX !== null && <div style={{ position: 'absolute', left: `${todayX}%`, top: 0, bottom: 0, width: 1.5, background: '#ef444488', zIndex: 2 }} />}
                            </div>
                          )
                        }

                        const leftPct  = (barS - mStart) / (mEnd - mStart) * 100
                        const widthPct = Math.max(2, (barE - barS) / (mEnd - mStart) * 100)

                        return (
                          <div key={mi} style={{ width: W_MON, flexShrink: 0, position: 'relative', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            {todayX !== null && <div style={{ position: 'absolute', left: `${todayX}%`, top: 0, bottom: 0, width: 1.5, background: '#ef444488', zIndex: 2 }} />}
                            <div style={{
                              position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`,
                              height: 18, borderRadius: 3, overflow: 'hidden',
                              background: `${renk}22`, border: `1.5px solid ${renk}70`,
                              zIndex: 1,
                            }}>
                              {pct > 0 && <div style={{ width: `${pct}%`, height: '100%', background: renk, opacity: 0.75 }} />}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1.25rem', padding: '0.75rem 1rem', borderTop: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
            {grupSirali.map(k => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 11, color: 'var(--color-muted)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: KATEGORI_RENK[k], display: 'inline-block' }} />
                {KAT_STIL[k]?.label}
              </span>
            ))}
            {showToday && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 11, color: '#ef4444' }}>
                <span style={{ width: 2, height: 12, background: '#ef4444', borderRadius: 1, display: 'inline-block' }} />
                Bugün
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
