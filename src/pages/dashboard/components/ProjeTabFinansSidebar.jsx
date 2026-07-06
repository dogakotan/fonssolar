import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { maliyetDurumu } from '../../../utils/finans'

const formatTRY = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatTRYShort = (value) =>
  new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0)

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function StatusDot({ color }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}

// Küçük "i" ikonu — üstüne gelince açıklama balonu gösterir. Balon sağ kenarı ikonla hizalanıp
// SOLA doğru açılır (translateX ile ortalamaz) — böylece kartın sağ kenarını taşıp komşu karta
// binmiyor; genişliği de kart genişliğinin altında tutuluyor.
function InfoTooltip({ text, color }) {
  const [show, setShow] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--color-muted-light)',
        color: 'var(--color-muted-light)', fontSize: 9, fontWeight: 700, fontFamily: 'Georgia, serif', fontStyle: 'italic',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0, lineHeight: 1,
      }}>i</span>
      {show && (
        <div style={{
          position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', zIndex: 30,
          width: 190, maxWidth: '80vw', background: '#fff', border: `1px solid ${color}`, borderRadius: 10, padding: '9px 11px',
          boxShadow: '0 14px 28px rgba(15,23,42,0.14)', fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-sub)',
          fontWeight: 500, textAlign: 'left', whiteSpace: 'normal',
        }}>
          {text}
        </div>
      )}
    </span>
  )
}

// Satın Alma sekmesindeki donut ile aynı görsel dil — Harcama Dağılımı'nda GES maliyet kalemleri için kullanılıyor.
function PercentDonut({ total, totalLabel, centerValue, items, size = 112, thickness = 19 }) {
  const [hovered, setHovered] = useState(null)
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const holeSize = size - thickness * 2

  let acc = 0
  const arcs = items.map(item => {
    const pct = percent(item.value, total)
    const length = (pct / 100) * circumference
    const offset = -((acc / 100) * circumference)
    acc += pct
    return { ...item, pct, length, offset }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {total <= 0 && (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-md)" strokeWidth={thickness} />
          )}
          {total > 0 && arcs.map(arc => arc.pct > 0 && (
            <circle
              key={arc.label}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth={thickness}
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={arc.offset}
              opacity={hovered && hovered !== arc.label ? 0.4 : 1}
              onMouseEnter={() => setHovered(arc.label)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default', transition: 'opacity .15s ease' }}
            />
          ))}
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{ width: holeSize, height: holeSize, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border-md)' }}>
            {centerValue != null && (
              <strong style={{ fontSize: 19, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1 }}>{centerValue}</strong>
            )}
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: holeSize - 10,
            }}>{totalLabel}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Bütçe Kullanımı kartındaki tek satırlık yatay stacked bar — Gerçekleşen/Onay Bekleyen/Kullanılabilir
// bütçenin toplam bütçe içindeki payını tek bakışta gösterir (kalan bütçeyi tek başına göstermek
// yanıltıcı olabilir çünkü onay bekleyen faturalar da yakında bütçeden düşecek).
function StackedBudgetBar({ segments, total }) {
  return (
    <div>
      <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', background: 'var(--color-bg)' }}>
        {segments.map(seg => {
          const width = percent(Math.max(0, seg.value), total)
          return width > 0 ? (
            <div key={seg.label} title={`${seg.label}: ${formatTRY(seg.value)}`} style={{ width: `${width}%`, background: seg.color, transition: 'width .3s ease' }} />
          ) : null
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
        {segments.map(seg => (
          <div key={seg.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <StatusDot color={seg.color} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)' }}>{seg.label}</span>
            </div>
            <p style={{ margin: '3px 0 0 12px', fontSize: 12.5, fontWeight: 800, color: 'var(--color-text)' }}>{formatTRY(seg.value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const sectionBase = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-md)',
  borderRadius: 10,
  padding: '17px 19px',
  boxSizing: 'border-box',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
}

const sectionBody = { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }

const sectionTitle = {
  margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--color-muted-light)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}

const sectionDivider = { height: 1, background: 'var(--color-border-md)', margin: '10px 0' }

// "Bütçe Kullanımı" kartı — Proje Finans Özeti ve Kur ile birlikte üst satırda (finans-panel-grid)
// yer alması için ayrı export edildi (ana satır ile grafik satırı artık farklı grid oranları kullanıyor).
export function BudgetUsageCard({ kpi }) {
  const segments = [
    { label: 'Gerçekleşen Harcama', value: Math.max(0, kpi.totalActual), color: 'var(--color-primary)' },
    { label: 'Onay Bekleyen', value: Math.max(0, kpi.pendingAmount), color: 'var(--color-warning)' },
    { label: 'Kullanılabilir Bütçe', value: Math.max(0, kpi.availableBudget), color: 'var(--color-success)' },
  ]
  return (
    <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-primary)' }}>
      <h3 style={sectionTitle}>Bütçe Kullanımı</h3>
      <div style={sectionDivider} />
      <div style={sectionBody}>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'var(--color-muted)' }}>
          Toplam Bütçe <strong style={{ fontSize: 12.5, color: 'var(--color-text)', fontWeight: 800 }}>{formatTRY(kpi.totalPlanned)}</strong>
        </p>
        <StackedBudgetBar segments={segments} total={kpi.totalPlanned} />
      </div>
    </section>
  )
}

export default function ProjeTabFinansSidebar({ curve, dagilim, sapma, cpi, loading }) {
  const dagilimTotal = dagilim.reduce((s, item) => s + item.value, 0)
  const sapmaColor = sapma.amount > 0 ? 'var(--color-danger)' : sapma.amount < 0 ? 'var(--color-success)' : 'var(--color-muted)'
  const durum = maliyetDurumu(sapma.pct)
  const actualToDate = sapma.plannedToDate + sapma.amount
  const sapmaText = sapma.amount === 0
    ? 'Harcama planlanan tutarla birebir aynı.'
    : `Planlanana göre ${formatTRY(Math.abs(sapma.amount))} daha ${sapma.amount < 0 ? 'az' : 'fazla'} harcandı.`

  return (
    <>
      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-success)', order: 1 }}>
        <h3 style={sectionTitle}>Harcama Dağılımı</h3>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PercentDonut total={dagilimTotal} totalLabel="harcama" items={dagilim} />
            <div style={{ display: 'grid', gap: 8 }}>
              {dagilim.map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot color={item.color} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>{item.label}</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                      {formatTRY(item.value)} · %{percent(item.value, dagilimTotal)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-primary)', order: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={sectionTitle}>Aylık Maliyet Akışı</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}><StatusDot color="#3b82f6" /> Planlanan</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}><StatusDot color="#22c55e" /> Gerçekleşen</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: 'var(--color-muted)' }}><StatusDot color="#f97316" /> Onay Bekleyen</span>
          </div>
        </div>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          {loading || curve.length === 0 ? (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-muted-light)', textAlign: 'center' }}>
              {loading ? '…' : 'Proje tarihleri veya bütçesi tanımlı değil.'}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={195}>
              <LineChart data={curve} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10.5 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10.5 }} tickFormatter={formatTRYShort} width={46} />
                <Tooltip formatter={(value) => formatTRY(value)} labelStyle={{ fontSize: 12.5 }} contentStyle={{ fontSize: 12.5 }} />
                <Line type="monotone" dataKey="planned" stroke="#3b82f6" dot={false} strokeWidth={2} name="Planlanan" />
                <Line type="monotone" dataKey="actual" stroke="#22c55e" dot={{ r: 3 }} strokeWidth={2} name="Gerçekleşen" connectNulls={false} />
                <Line dataKey="pendingSnapshot" stroke="#f97316" strokeDasharray="4 4" dot={{ r: 5, fill: '#f97316' }} strokeWidth={0} name="Onay Bekleyen (bugün itibarıyla)" connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="sa-card" style={{ ...sectionBase, borderTop: `3px solid ${durum.color}`, order: 3 }}>
        <h3 style={sectionTitle}>Maliyet Durumu</h3>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.4 }}>
            {loading ? '…' : sapmaText}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ background: durum.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
              {durum.durum}
            </span>
            <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
              Risk: {durum.risk}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--color-muted)' }}>Planlanan Harcama</p>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-sub)' }}>{formatTRY(sapma.plannedToDate)}</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--color-muted)' }}>Gerçekleşen Harcama</p>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-sub)' }}>{formatTRY(actualToDate)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border-md)' }}>
            <span style={{ fontSize: 9.5, color: 'var(--color-muted-light)' }}>
              Sapma: {sapma.amount > 0 ? '+' : sapma.amount < 0 ? '−' : ''}%{Math.abs(sapma.pct)}
              {cpi?.cpi != null && ` · Maliyet Performans Endeksi (CPI): ${cpi.cpi.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
            <InfoTooltip
              color={durum.color}
              text={`Sapma = Gerçekleşen − Olması gereken (bugüne kadar planlanan ${formatTRY(sapma.plannedToDate)}). ${cpi?.ev ? `CPI = Kazanılan Değer (${formatTRY(cpi.ev)}) ÷ Gerçekleşen Harcama — 1'in üzeri bütçenin altında (verimli), 1'in altı üstünde demektir.` : ''}`}
            />
          </div>
        </div>
      </section>
    </>
  )
}
