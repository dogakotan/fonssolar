const METRICS = [
  { key: 'pending', label: 'Onay Bekleyen', note: 'Yönetici onayı', color: 'var(--color-warning)' },
  { key: 'risky', label: 'Riskli Satın Alma', note: 'Planı aşan talep', color: 'var(--color-danger)' },
  { key: 'invoicePending', label: 'Fatura Bekleyen', note: 'Muhasebe süreci', color: 'var(--color-primary)' },
  { key: 'monthOpened', label: 'Bu Ay Açılan', note: 'Yeni talep', color: 'var(--color-success)' },
]

export default function ProjeTabSatinAlmaStats({ kpi, loading }) {
  return (
    <section className="sa-panel-card sa-summary-card">
      <p className="sa-eyebrow">Talep Durumu</p>
      <div className="sa-metric-grid">
        {METRICS.map(metric => (
          <div key={metric.key} className="sa-metric">
            <span className="sa-metric-label">{metric.label}</span>
            <strong style={{ color: metric.color }}>{loading ? '…' : kpi[metric.key]}</strong>
            <small>{metric.note}</small>
          </div>
        ))}
      </div>
    </section>
  )
}
