import { useState } from 'react'
import { formatPaymentCurrency } from './OdemeEkleModal'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const localDate = value => new Date(`${value}T00:00:00`)

function rowTone(row, todayKey) {
  if (row.status === 'ödendi') return ['Ödendi', 'green']
  if (row.due_date < todayKey || row.vade_durumu === 'vadesi_gecti') return ['Gecikti', 'red']
  const days = Math.ceil((localDate(row.due_date) - localDate(todayKey)) / 86400000)
  if (days === 0) return ['Bugün ödenecek', 'orange']
  if (days === 1) return ['Yarın ödenecek', 'orange']
  return ['İlk ödeme', 'blue']
}

export default function OdemeTakvimi({ rows, supplierMap, projectMap, canManage, onPay, onClose }) {
  const now = new Date()
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [selected, setSelected] = useState(dateKey(now))
  const [view, setView] = useState('month')
  const todayKey = dateKey(now)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const start = new Date(year, month, 1)
  const mondayOffset = (start.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, index) => new Date(year, month, index - mondayOffset + 1))
  const monthRows = rows.filter(row => row.due_date && localDate(row.due_date).getMonth() === month && localDate(row.due_date).getFullYear() === year)
  const dueThisMonth = monthRows.filter(row => Number(row.remaining_amount) > 0).reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0)
  const overdue = rows.filter(row => Number(row.remaining_amount) > 0 && (row.vade_durumu === 'vadesi_gecti' || row.due_date < todayKey)).reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0)
  const paid = rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0)
  const selectedRows = rows.filter(row => row.due_date === selected)
  const upcoming = rows.filter(row => row.due_date && row.due_date > selected && Number(row.remaining_amount) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3)

  const mobileGroups = (() => {
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
    const week = new Date(now); week.setDate(now.getDate() + 7)
    return [
      ['Vadesi Geçen', rows.filter(row => Number(row.remaining_amount) > 0 && row.due_date < todayKey)],
      [`Bugün — ${now.getDate()} ${MONTHS[now.getMonth()]}`, rows.filter(row => Number(row.remaining_amount) > 0 && row.due_date === todayKey)],
      [`Yarın — ${tomorrow.getDate()} ${MONTHS[tomorrow.getMonth()]}`, rows.filter(row => Number(row.remaining_amount) > 0 && row.due_date === dateKey(tomorrow))],
      ['Bu Hafta', rows.filter(row => Number(row.remaining_amount) > 0 && row.due_date > dateKey(tomorrow) && row.due_date <= dateKey(week))],
    ]
  })()

  const changeMonth = delta => setCursor(new Date(year, month + delta, 1))
  const renderCard = row => {
    const [label, tone] = rowTone(row, todayKey)
    return <article className={`calendar-payment-card ${tone}`} key={row.id}><div><b>{supplierMap[row.supplier_id] || row.invoice_no}</b><small>{row.invoice_no}</small><small>{projectMap[row.project_id] || '—'}</small></div><p><strong>{formatPaymentCurrency(row.remaining_amount || row.total_amount, row.currency)}</strong><em>{label}</em></p>{canManage && Number(row.remaining_amount) > 0 && <button onClick={() => onPay(row)}>Ödeme Ekle</button>}</article>
  }

  return (
    <div className="payment-calendar-backdrop">
      <div className="payment-calendar">
        <header><div><small>Finans / Ödeme Takibi / Ödeme Takvimi</small><h2>Ödeme Takvimi</h2><p>Fatura vadelerini ve yaklaşan ödemeleri takvim üzerinden takip edin.</p></div><button className="close" onClick={onClose}>×</button><div className="calendar-view-toggle"><button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>▣ Ay</button><button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>▣ Hafta</button></div></header>
        <div className="calendar-month-toolbar"><button onClick={() => changeMonth(-1)}>‹</button><b>{MONTHS[month]} {year}</b><button onClick={() => changeMonth(1)}>›</button><div className="calendar-kpis"><article className="blue"><i>◷</i><span><small>Bu Ay Ödenecek</small><b>{formatPaymentCurrency(dueThisMonth)}</b></span></article><article className="red"><i>!</i><span><small>Vadesi Geçen</small><b>{formatPaymentCurrency(overdue)}</b></span></article><article className="green"><i>✓</i><span><small>Ödenen</small><b>{formatPaymentCurrency(paid)}</b></span></article></div></div>
        <div className="calendar-mobile-groups">{mobileGroups.map(([title, items]) => items.length > 0 && <section key={title}><h3>{title} <b>{items.length}</b></h3>{items.map(renderCard)}</section>)}</div>
        <div className="calendar-desktop-layout">
          <main className={view !== 'month' ? 'list-view' : ''}>
            {view === 'month' && <><div className="calendar-weekdays">{['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map(cell => {
              const key = dateKey(cell)
              const items = rows.filter(row => row.due_date === key)
              return <button key={key} className={`${cell.getMonth() !== month ? 'muted' : ''} ${selected === key ? 'selected' : ''}`} onClick={() => setSelected(key)}><b>{cell.getDate()}</b>{items.slice(0, 2).map(row => { const [label, tone] = rowTone(row, todayKey); return <span className={tone} key={row.id}><strong>{supplierMap[row.supplier_id]?.split(' ')[0] || row.invoice_no}</strong><em>{formatPaymentCurrency(row.remaining_amount || row.total_amount, row.currency)}</em><small>{label}</small></span> })}</button>
            })}</div></>}
            {view !== 'month' && <div className="calendar-list-view">{rows.filter(row => row.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).map(renderCard)}</div>}
          </main>
          <aside><section className="calendar-day-detail"><h3>{localDate(selected).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}</h3><p>Günün Toplamı <b>{formatPaymentCurrency(selectedRows.reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0))}</b></p>{selectedRows.map(renderCard)}{!selectedRows.length && <small className="calendar-empty">Bu tarihte ödeme bulunmuyor.</small>}</section><section><h3>Yaklaşanlar</h3>{upcoming.map(row => <article className="calendar-upcoming" key={row.id}><time>{localDate(row.due_date).getDate()}<small>{MONTHS[localDate(row.due_date).getMonth()].slice(0, 3)}</small></time><p><b>{supplierMap[row.supplier_id] || row.invoice_no}</b><small>{row.invoice_no}</small></p><strong>{formatPaymentCurrency(row.remaining_amount, row.currency)}</strong></article>)}</section></aside>
        </div>
      </div>
    </div>
  )
}
