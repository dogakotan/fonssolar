import { useState, useEffect } from 'react'

const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const TR_MONTHS_SHORT = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']
const TR_DAYS = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz']

function weekdayMon(date) { return (date.getDay() + 6) % 7 }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }

// view: 'day' | 'month' | 'year'
export default function DateNavigator({ selectedDate, onChange }) {
  const today = new Date(); today.setHours(0,0,0,0)

  const [view, setView]           = useState('day')
  const [viewYear, setViewYear]   = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [yearBase, setYearBase]   = useState(Math.floor(today.getFullYear() / 12) * 12)

  useEffect(() => {
    const target = selectedDate || today
    setViewYear(target.getFullYear())
    setViewMonth(target.getMonth())
    setYearBase(Math.floor(target.getFullYear() / 12) * 12)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // ── Gün görünümü ──────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    const atMax = viewYear === today.getFullYear() && viewMonth === today.getMonth()
    if (atMax) return
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const firstDay  = new Date(viewYear, viewMonth, 1)
  const offset    = weekdayMon(firstDay)
  const totalDays = daysInMonth(viewYear, viewMonth)
  const totalCells = Math.ceil((offset + totalDays) / 7) * 7
  const atMax     = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const selD = selectedDate &&
    selectedDate.getFullYear() === viewYear &&
    selectedDate.getMonth()    === viewMonth
      ? selectedDate.getDate() : null

  function handleDay(day) {
    const plain = new Date(viewYear, viewMonth, day); plain.setHours(0,0,0,0)
    if (plain > today) return
    if (selD === day) { onChange(null); return }
    const d = new Date(viewYear, viewMonth, day, 23, 59, 59, 999)
    onChange(d)
  }

  // ── Ay görünümü ──────────────────────────────────────
  function selectMonth(m) {
    setViewMonth(m)
    setView('day')
  }

  // ── Yıl görünümü ──────────────────────────────────────
  function selectYear(y) {
    setViewYear(y)
    // ay seçimine dön
    setView('month')
  }

  // ── Ortak stiller ──────────────────────────────────────
  const baseCell = {
    all: 'unset',
    display: 'block',
    width: 30, height: 28,
    lineHeight: '28px',
    textAlign: 'center',
    fontSize: 12,
    borderRadius: 6,
    cursor: 'pointer',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const navBtn = {
    all: 'unset',
    cursor: 'pointer',
    width: 26, height: 26,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, border: '1px solid #E5E7EB',
    fontSize: 16, color: '#374151', boxSizing: 'border-box',
    flexShrink: 0,
  }

  // ── Render ──────────────────────────────────────────
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E5E7EB',
      borderRadius: 12,
      boxShadow: '0 6px 28px rgba(0,0,0,0.14)',
      padding: '14px 14px 10px',
      width: 240,
      userSelect: 'none',
      fontFamily: 'inherit',
    }}>

      {/* ══ GÜN GÖRÜNÜMÜ ══════════════════════════════════ */}
      {view === 'day' && (
        <>
          {/* Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button style={navBtn} onClick={prevMonth}>‹</button>

            <button
              onClick={() => setView('month')}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#111827', padding: '2px 6px', borderRadius: 6, transition: 'background 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {TR_MONTHS[viewMonth]} {viewYear}
            </button>

            <button style={{ ...navBtn, opacity: atMax ? 0.3 : 1, cursor: atMax ? 'default' : 'pointer' }} onClick={nextMonth} disabled={atMax}>›</button>
          </div>

          {/* Gün adları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 30px)', gap: 2, marginBottom: 4, justifyContent: 'center' }}>
            {TR_DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#9CA3AF', height: 18, lineHeight: '18px' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Kutucuklar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 30px)', gap: 2, justifyContent: 'center' }}>
            {Array.from({ length: totalCells }, (_, i) => {
              const day = i - offset + 1
              if (day < 1 || day > totalDays) return <div key={i} style={{ width: 30, height: 28 }} />
              const plain = new Date(viewYear, viewMonth, day); plain.setHours(0,0,0,0)
              const isToday    = plain.getTime() === today.getTime()
              const isFuture   = plain > today
              const isSelected = selD === day

              let bg      = 'transparent'
              let color   = isFuture ? '#D1D5DB' : '#374151'
              let fw      = 400
              let outline = 'none'

              if (isSelected)            { bg = '#185FA5'; color = '#fff'; fw = 700 }
              else if (isToday && !selD) { bg = '#EFF6FF'; color = '#185FA5'; fw = 700; outline = '1.5px solid #185FA5' }
              else if (isToday)          { outline = '1.5px solid #185FA5'; color = '#185FA5' }

              return (
                <button
                  key={i}
                  onClick={() => handleDay(day)}
                  disabled={isFuture}
                  style={{ ...baseCell, background: bg, color, fontWeight: fw, outline, opacity: isFuture ? 0.4 : 1 }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ══ AY GÖRÜNÜMÜ ════════════════════════════════════ */}
      {view === 'month' && (
        <>
          {/* Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button style={navBtn} onClick={() => { setViewYear(y => y - 1) }}>‹</button>

            <button
              onClick={() => setView('year')}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#111827', padding: '2px 6px', borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {viewYear}
            </button>

            <button
              style={{ ...navBtn, opacity: viewYear >= today.getFullYear() ? 0.3 : 1, cursor: viewYear >= today.getFullYear() ? 'default' : 'pointer' }}
              onClick={() => { if (viewYear < today.getFullYear()) setViewYear(y => y + 1) }}
              disabled={viewYear >= today.getFullYear()}
            >›</button>
          </div>

          {/* 4×3 ay ızgarası */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {TR_MONTHS_SHORT.map((m, idx) => {
              const isFuture = viewYear === today.getFullYear() && idx > today.getMonth()
              const isCurrent = viewYear === today.getFullYear() && idx === today.getMonth()
              const isSel = selectedDate && selectedDate.getFullYear() === viewYear && selectedDate.getMonth() === idx

              return (
                <button
                  key={idx}
                  onClick={() => !isFuture && selectMonth(idx)}
                  disabled={isFuture}
                  style={{
                    all: 'unset',
                    display: 'block',
                    textAlign: 'center',
                    padding: '7px 4px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: isSel ? 700 : isCurrent ? 600 : 400,
                    cursor: isFuture ? 'default' : 'pointer',
                    opacity: isFuture ? 0.35 : 1,
                    background: isSel ? '#185FA5' : isCurrent ? '#EFF6FF' : 'transparent',
                    color: isSel ? '#fff' : isCurrent ? '#185FA5' : '#374151',
                    outline: isCurrent && !isSel ? '1.5px solid #185FA5' : 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    transition: 'background 0.1s',
                  }}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ══ YIL GÖRÜNÜMÜ ═══════════════════════════════════ */}
      {view === 'year' && (
        <>
          {/* Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button style={navBtn} onClick={() => setYearBase(b => b - 12)}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{yearBase} – {yearBase + 11}</span>
            <button
              style={{ ...navBtn, opacity: yearBase + 12 > today.getFullYear() ? 0.3 : 1, cursor: yearBase + 12 > today.getFullYear() ? 'default' : 'pointer' }}
              onClick={() => { if (yearBase + 12 <= today.getFullYear()) setYearBase(b => b + 12) }}
              disabled={yearBase + 12 > today.getFullYear()}
            >›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {Array.from({ length: 12 }, (_, i) => {
              const y = yearBase + i
              const isFuture = y > today.getFullYear()
              const isSel = selectedDate && selectedDate.getFullYear() === y
              const isCurrent = y === today.getFullYear()

              return (
                <button
                  key={y}
                  onClick={() => !isFuture && selectYear(y)}
                  disabled={isFuture}
                  style={{
                    all: 'unset',
                    display: 'block',
                    textAlign: 'center',
                    padding: '7px 2px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: isSel ? 700 : 400,
                    cursor: isFuture ? 'default' : 'pointer',
                    opacity: isFuture ? 0.35 : 1,
                    background: isSel ? '#185FA5' : isCurrent ? '#EFF6FF' : 'transparent',
                    color: isSel ? '#fff' : isCurrent ? '#185FA5' : '#374151',
                    outline: isCurrent && !isSel ? '1.5px solid #185FA5' : 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    transition: 'background 0.1s',
                  }}
                >
                  {y}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Alt bilgi ──────────────────────────────────────── */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: selectedDate ? '#185FA5' : '#9CA3AF', fontWeight: selectedDate ? 600 : 400 }}>
          {selectedDate
            ? selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Canlı veri'}
        </span>
        {view !== 'day'
          ? <button onClick={() => setView('day')} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: '#374151', background: '#F3F4F6', borderRadius: 6, padding: '3px 8px', fontFamily: 'inherit', fontWeight: 500, boxSizing: 'border-box' }}>
              ← Günler
            </button>
          : selectedDate && (
              <button onClick={() => onChange(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: '#374151', background: '#F3F4F6', borderRadius: 6, padding: '3px 8px', fontFamily: 'inherit', fontWeight: 500, boxSizing: 'border-box' }}>
                ↩ Bugüne Dön
              </button>
            )
        }
      </div>
    </div>
  )
}
