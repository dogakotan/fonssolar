import { StatusDot } from '../../../../components/ui/Badge'
import { formatValue } from '../../../../lib/register/registerConfig'

// Tablo hücresi ve yan panel alanı için tek biçimlendirici. Durum/öncelik rozeti renk + metin (StatusDot).
export default function RegisterCell({ column, row, names }) {
  const value = row[column.key]
  if (column.type === 'status' || column.type === 'priority') {
    return value ? <StatusDot map={column.map || {}} value={value} /> : '—'
  }
  if (column.type === 'no') return <span className="register-no">{value || '—'}</span>
  if (column.type === 'code') {
    if (!value) return '—'
    const name = column.nameKey ? row[column.nameKey] : null
    return <span title={name || undefined}><span className="register-no">{value}</span>{name ? ` ${name}` : ''}</span>
  }
  if (column.type === 'money') {
    return value == null ? '—' : `${formatValue(column, value)} ${row.currency || ''}`.trim()
  }
  return formatValue(column, value, { names })
}
