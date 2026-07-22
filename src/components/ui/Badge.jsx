import { TONE } from './StatusBadge'

export default function Badge({ map, value }) {
  const entry = map[value] || { label: value || '—', tone: 'muted' }
  const tone = TONE[entry.tone] || TONE.muted
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: tone.bg, color: tone.text, whiteSpace: 'nowrap', flexShrink: 0,
    }}>{entry.label}</span>
  )
}
