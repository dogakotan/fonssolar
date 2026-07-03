const CARD = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-md)',
  borderTop: '3px solid var(--color-primary)',
  borderRadius: 10,
  padding: '12px 16px',
  minHeight: 118,
  boxSizing: 'border-box',
  overflow: 'hidden',
  boxShadow: 'var(--shadow-card)',
}

export default function ProjeTabSatinAlmaStats({ kpi, loading }) {
  const cards = [
    { label: 'Onay Bekleyen', value: kpi.pending, color: 'var(--color-warning)' },
    { label: 'Riskli Satın Alma', value: kpi.risky, color: 'var(--color-danger)' },
    { label: 'Fatura Bekleyen', value: kpi.invoicePending, color: 'var(--color-primary)' },
    { label: 'Bu Ay Açılan Talep', value: kpi.monthOpened, color: 'var(--color-success)' },
  ]
  return (
    <section className="sa-card" style={CARD}>
      <div style={{ display: 'grid', gap: 9, height: '100%', alignContent: 'center' }}>
        {cards.map(card => (
          <div key={card.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border-md)', borderRadius: 9, padding: '8px 12px' }}>
            <span style={{ minWidth: 0, color: 'var(--color-text-sub)', fontSize: 13.5, fontWeight: 700 }}>
              {card.label}
            </span>
            <strong style={{ fontSize: 18, color: card.color, fontWeight: 800 }}>{loading ? '…' : card.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
