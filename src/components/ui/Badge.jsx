import { TONE } from './StatusBadge'

function humanize(value) {
  if (!value) return '—'
  const text = String(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1)
}

export default function Badge({ map, value, prefix }) {
  const entry = map[value] || { label: humanize(value), tone: 'muted' }
  const tone = TONE[entry.tone] || TONE.muted
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: tone.bg, color: tone.text, whiteSpace: 'nowrap', flexShrink: 0,
    }}>{prefix ? `${prefix}: ${entry.label}` : entry.label}</span>
  )
}
