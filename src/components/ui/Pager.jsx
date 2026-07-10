const PAGER_BTN = {
  background: 'var(--color-border)', border: 'none', borderRadius: '50%',
  width: 28, height: 28, fontSize: 14, fontWeight: 700, color: 'var(--color-text-sub)',
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// Liste kartlarının boyu sayfa değişince zıplamasın diye kompakt "‹ 2/3 ›" stilinde sayfalama.
export default function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 10 }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        style={{ ...PAGER_BTN, opacity: page === 0 ? 0.35 : 1 }}
      >‹</button>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{page + 1} / {totalPages}</span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{ ...PAGER_BTN, opacity: page >= totalPages - 1 ? 0.35 : 1 }}
      >›</button>
    </div>
  )
}
