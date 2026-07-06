import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

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

// Küçük "i" ikonu — üstüne gelince metriğin nasıl hesaplandığını açıklayan bir balon gösterir.
function InfoTooltip({ text, color }) {
  const [show, setShow] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--color-muted-light)',
        color: 'var(--color-muted-light)', fontSize: 8.5, fontWeight: 700, fontStyle: 'italic',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0,
      }}>i</span>
      {show && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 'calc(100% + 8px)', transform: 'translateX(-50%)',
          width: 200, background: '#fff', border: `1px solid ${color}`, borderRadius: 10, padding: '9px 11px',
          boxShadow: '0 14px 28px rgba(15,23,42,0.14)', fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-sub)',
          fontWeight: 500, textAlign: 'left', zIndex: 30, whiteSpace: 'normal',
        }}>
          {text}
        </div>
      )}
    </span>
  )
}

// Satın Alma sekmesindeki donut ile aynı görsel dil — burada değişken sayıda dilim (malzeme/işçilik/diğer)
// destekliyor. centerValue verilirse ortada büyük puntoyla gösterilir (ör. bütçe kullanım yüzdesi).
function PercentDonut({ total, totalLabel, centerValue, items, size = 88, thickness = 15 }) {
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
              <strong style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1 }}>{centerValue}</strong>
            )}
            <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{totalLabel}</span>
          </div>
        </div>
        {hovered && arcs.filter(arc => arc.label === hovered).map(arc => (
          <div key={arc.label} style={{
            position: 'absolute', left: '50%', top: 'calc(100% + 10px)', transform: 'translateX(-50%)', zIndex: 20, width: 148,
            background: '#fff', border: `1px solid ${arc.color}`, borderRadius: 10, padding: '8px 11px',
            boxShadow: '0 14px 28px rgba(15,23,42,0.14)', fontSize: 12, whiteSpace: 'nowrap',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-sub)', fontWeight: 700 }}><StatusDot color={arc.color} /> {arc.label}</span>
              <strong style={{ color: arc.color, fontWeight: 800 }}>{formatTRY(arc.value)} · %{arc.pct}</strong>
            </div>
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
  padding: '11px 14px',
  boxSizing: 'border-box',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
}

const sectionBody = { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }

const sectionTitle = {
  margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted-light)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}

const sectionDivider = { height: 1, background: 'var(--color-border-md)', margin: '7px 0' }

export default function ProjeTabFinansSidebar({ kpi, curve, dagilim, sapma, cpi, loading }) {
  const dagilimTotal = dagilim.reduce((s, item) => s + item.value, 0)
  const usageItems = [
    { label: 'Gerçekleşen Harcama', value: Math.max(0, kpi.totalActual), color: 'var(--color-primary)' },
    { label: 'Kalan Bütçe', value: Math.max(0, kpi.remainingBudget), color: 'var(--color-border-md)' },
  ]
  const usageTotal = usageItems.reduce((s, item) => s + item.value, 0)
  const sapmaColor = sapma.amount > 0 ? 'var(--color-danger)' : sapma.amount < 0 ? 'var(--color-success)' : 'var(--color-muted)'
  const sapmaSign = sapma.amount > 0 ? '+' : sapma.amount < 0 ? '−' : ''
  const actualToDate = sapma.plannedToDate + sapma.amount
  const cpiColor = cpi?.cpi == null ? 'var(--color-muted)' : cpi.cpi >= 1 ? 'var(--color-success)' : 'var(--color-danger)'
  const cpiNote = cpi?.cpi == null ? 'Fiziksel ilerleme verisi yok' : cpi.cpi >= 1 ? 'Yapılan işe göre bütçenin altında' : 'Yapılan işe göre bütçenin üstünde'

  return (
    <>
      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-primary)', order: 1 }}>
        <h3 style={sectionTitle}>Bütçe Kullanımı</h3>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PercentDonut total={usageTotal} totalLabel="Bütçe Kullanımı" centerValue={`%${kpi.usagePct}`} items={usageItems} />
            <div style={{ display: 'grid', gap: 7 }}>
              {usageItems.map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot color={item.color} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-sub)' }}>{item.label}</p>
                    <p style={{ margin: 0, fontSize: 9.5, color: 'var(--color-muted)' }}>
                      {formatTRY(item.value)} · %{percent(item.value, usageTotal)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-success)', order: 3 }}>
        <h3 style={sectionTitle}>Harcama Dağılımı</h3>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <PercentDonut total={dagilimTotal} totalLabel="harcama" items={dagilim} />
            <div style={{ display: 'grid', gap: 7 }}>
              {dagilim.map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot color={item.color} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-sub)' }}>{item.label}</p>
                    <p style={{ margin: 0, fontSize: 9.5, color: 'var(--color-muted)' }}>
                      {formatTRY(item.value)} · %{percent(item.value, dagilimTotal)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-primary)', order: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={sectionTitle}>Planlanan vs Gerçekleşen</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}><StatusDot color="#3b82f6" /> Planlanan</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 600, color: 'var(--color-muted)' }}><StatusDot color="#22c55e" /> Gerçekleşen</span>
          </div>
        </div>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          {loading || curve.length === 0 ? (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-muted-light)', textAlign: 'center' }}>
              {loading ? '…' : 'Proje tarihleri veya bütçesi tanımlı değil.'}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={curve} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 8.5 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 8.5 }} tickFormatter={formatTRYShort} width={40} />
                <Tooltip formatter={(value) => formatTRY(value)} labelStyle={{ fontSize: 10.5 }} contentStyle={{ fontSize: 10.5 }} />
                <Line type="monotone" dataKey="planned" stroke="#3b82f6" dot={false} strokeWidth={2} name="Planlanan" />
                <Line type="monotone" dataKey="actual" stroke="#22c55e" dot={{ r: 3 }} strokeWidth={2} name="Gerçekleşen" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="sa-card" style={{ ...sectionBase, borderTop: `3px solid ${sapmaColor}`, order: 5 }}>
        <h3 style={sectionTitle}>Sapma &amp; Maliyet Performansı</h3>
        <div style={sectionDivider} />
        <div style={{ ...sectionBody, gap: 7 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-muted-light)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Sapma</span>
              <InfoTooltip
                color={sapmaColor}
                text={`Bugüne kadar olması gereken: ${formatTRY(sapma.plannedToDate)}. Gerçekleşen: ${formatTRY(actualToDate)}. Sapma = Gerçekleşen − Olması gereken. Pozitif = bütçe aşımı, negatif = bütçenin altında.`}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, marginTop: 2 }}>
              <strong style={{ fontSize: 16, fontWeight: 800, color: sapmaColor }}>
                {loading ? '…' : `${sapmaSign}%${Math.abs(sapma.pct)}`}
              </strong>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: sapmaColor }}>
                {loading ? '' : `${sapmaSign}${formatTRY(Math.abs(sapma.amount))}`}
              </span>
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--color-border-md)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-muted-light)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>CPI</span>
              <InfoTooltip
                color={cpiColor}
                text={`Maliyet Performans Endeksi = Kazanılan Değer ÷ Gerçekleşen Harcama.${cpi?.ev ? ` Kazanılan Değer: ${formatTRY(cpi.ev)}.` : ''} 1'in üzeri = yapılan işe göre bütçenin altında (verimli); 1'in altı = üstünde.`}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, marginTop: 2 }}>
              <strong style={{ fontSize: 16, fontWeight: 800, color: cpiColor }}>
                {loading ? '…' : cpi?.cpi == null ? '—' : cpi.cpi.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: cpiColor }}>
                {loading ? '' : cpiNote}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
