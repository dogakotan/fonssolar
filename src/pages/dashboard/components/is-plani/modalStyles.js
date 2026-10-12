// İş Planı / Proje Ayarları modallarının ortak stilleri ve seçim sınırı (Faz 1 Adım 5).
export const MAX_SELECTION = 500 // Karar 54

export const modalStyles = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 16 },
  box: { width: 'min(760px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 14, boxShadow: '0 24px 70px rgba(15,23,42,.28)', overflow: 'hidden' },
  head: { padding: '14px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', gap: 12 },
  body: { padding: 18, display: 'grid', gap: 12, overflowY: 'auto' },
  foot: { padding: '12px 18px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  label: { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)' },
  input: { border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13, background: '#fff', color: 'var(--color-text)' },
  btn: { border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '8px 14px', background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13 },
  btnP: { border: 'none', borderRadius: 8, padding: '8px 14px', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit', fontSize: 13 },
  btnD: { border: 'none', borderRadius: 8, padding: '8px 14px', background: 'var(--color-danger)', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit', fontSize: 13 },
  err: { margin: 0, padding: '8px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 12.5, fontWeight: 600, whiteSpace: 'pre-wrap' },
  warn: { margin: 0, padding: '8px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12.5 },
  info: { margin: 0, fontSize: 12, color: 'var(--color-muted)' },
  th: { textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted)', padding: '6px 8px', borderBottom: '1px solid var(--color-border-md)', background: 'var(--color-bg)', position: 'sticky', top: 0 },
  td: { fontSize: 12, padding: '6px 8px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' },
}
