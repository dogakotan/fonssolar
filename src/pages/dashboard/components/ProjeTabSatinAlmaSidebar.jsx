function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

const formatKur = (value) =>
  (value != null && !Number.isNaN(value))
    ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ₺'
    : '—'

function ColumnChart({ total, totalLabel, items }) {
  const maxBarHeight = 76

  return (
    <div className="sa-column-chart">
      <div className="sa-chart-total">
        <span>Toplam</span>
        <strong>{total} <small>{totalLabel}</small></strong>
      </div>
      <div className="sa-column-bars">
        {items.map(item => {
          const pct = percent(item.value, total)
          const barHeight = total > 0 ? Math.max(8, Math.round((pct / 100) * maxBarHeight)) : 6
          return (
            <div key={item.label} className="sa-column-item">
              <strong style={{ color: item.color }}>{item.value}</strong>
              <div className="sa-column-track">
                <span style={{ height: barHeight, background: item.color }} />
              </div>
              <small>{item.label}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RequestTypeChart({ dagilim }) {
  const total = dagilim.malzeme + dagilim.hizmet
  const materialPct = percent(dagilim.malzeme, total)
  const servicePct = total > 0 ? 100 - materialPct : 0

  return (
    <div className="sa-donut-wrap">
      <div
        className="sa-donut"
        style={{ background: total > 0 ? `conic-gradient(var(--color-primary) 0 ${materialPct}%, var(--color-success) ${materialPct}% 100%)` : 'var(--color-bg)' }}
      >
        <div>
          <strong>{total}</strong>
          <span>talep</span>
        </div>
      </div>
      <div className="sa-donut-legend">
        <span><i style={{ background: 'var(--color-primary)' }} /> Malzeme <strong>{dagilim.malzeme}</strong><small>%{materialPct}</small></span>
        <span><i style={{ background: 'var(--color-success)' }} /> Hizmet <strong>{dagilim.hizmet}</strong><small>%{servicePct}</small></span>
      </div>
    </div>
  )
}

export default function ProjeTabSatinAlmaSidebar({ tedarik, dagilim, doviz }) {
  const tedarikItems = [
    { label: 'Uygun', value: tedarik.ok, color: 'var(--color-success)' },
    { label: 'Riskli', value: tedarik.excess, color: 'var(--color-danger)' },
    { label: 'Listede Yok', value: tedarik.missing || 0, color: 'var(--color-warning)' },
  ]

  return (
    <>
      <section className="sa-panel-card">
        <p className="sa-eyebrow">Malzeme Tedarik</p>
        <ColumnChart total={tedarik.total} totalLabel="talep" items={tedarikItems} />
      </section>

      <section className="sa-panel-card">
        <p className="sa-eyebrow">Talep Dağılımı</p>
        <RequestTypeChart dagilim={dagilim} />
      </section>

      <section className="sa-panel-card sa-currency-card">
        <p className="sa-eyebrow">TCMB Satış Kurları</p>
        <div className="sa-currency-row">
          <span>$ Dolar / TRY</span>
          <strong>{formatKur(doviz.usd)}</strong>
        </div>
        <div className="sa-currency-row">
          <span>€ Euro / TRY</span>
          <strong>{formatKur(doviz.eur)}</strong>
        </div>
        <small>{doviz.date || 'Güncelleniyor…'}</small>
      </section>
    </>
  )
}
