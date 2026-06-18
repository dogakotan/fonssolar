export default function ProgBar({ pct, color = 'var(--color-primary)' }) {
  return (
    <div className="prog-wrap">
      <div className="prog-bar">
        <div className="prog-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span>{pct}%</span>
    </div>
  )
}
