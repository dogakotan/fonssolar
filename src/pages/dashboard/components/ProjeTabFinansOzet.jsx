import { remainingDaysLabel } from '../../../utils/finans'

const formatTRY = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

// "Genel Proje" sekmesindeki Proje Detayları kutusuyla birebir aynı sınıflar (.card,
// .project-overview-card, .project-card-title, .project-detail-columns, .project-detail-row) —
// aynı tema/boyut için stil tekrarı yerine doğrudan paylaşılan CSS kullanılıyor.
function Row({ label, value, color, loading }) {
  return (
    <div className="project-detail-row">
      <span>{label}</span>
      <strong style={color ? { color } : undefined}>{loading ? '…' : value}</strong>
    </div>
  )
}

export default function ProjeTabFinansOzet({ kpi, quickFacts, loading }) {
  const dayColor = kpi.remainingDays == null
    ? 'var(--color-muted)'
    : kpi.remainingDays < 0 ? 'var(--color-danger)' : kpi.remainingDays > 30 ? 'var(--color-success)' : 'var(--color-warning)'

  return (
    <div className="card project-overview-card" style={{ gridColumn: 'span 2' }}>
      <div className="project-card-title"><h3>Proje Özeti</h3></div>
      <div className="project-detail-columns">
        <div>
          <Row label="Toplam Bütçe" value={formatTRY(kpi.totalPlanned)} loading={loading} />
          <Row label="Gerçekleşen Harcama" value={formatTRY(kpi.totalActual)} color="var(--color-primary)" loading={loading} />
          <Row label="Kalan Bütçe" value={formatTRY(kpi.remainingBudget)} color={kpi.remainingBudget < 0 ? 'var(--color-danger)' : 'var(--color-success)'} loading={loading} />
          <Row label="Bu Ay Harcama" value={formatTRY(kpi.thisMonthActual)} loading={loading} />
        </div>
        <div>
          <Row label="Onay Bekleyen Fatura" value={quickFacts.pendingCount} color="var(--color-warning)" loading={loading} />
          <Row label="Onay Bekleyen Tutar" value={formatTRY(quickFacts.pendingAmount)} color="var(--color-warning)" loading={loading} />
          <Row label="Bütçesi Aşan Kalem" value={quickFacts.overBudgetCount} color={quickFacts.overBudgetCount > 0 ? 'var(--color-danger)' : 'var(--color-success)'} loading={loading} />
          <Row label="Kalan Proje Günü" value={remainingDaysLabel(kpi.remainingDays)} color={dayColor} loading={loading} />
        </div>
      </div>
    </div>
  )
}
