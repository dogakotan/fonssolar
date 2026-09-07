// Sağ altta kısa süreliğine görünen bildirim kutusu — TabProjeYonetimi.jsx'teki
// yerel toast'ın paylaşımlı hâli (bkz. src/hooks/useToast.js).
export default function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      padding: '0.75rem 1.25rem', borderRadius: 10, maxWidth: 380,
      background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#16a34a' : '#1e293b',
      color: '#fff', fontWeight: 600, fontSize: 13, whiteSpace: 'pre-line',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      zIndex: 9999,
    }}>
      {toast.msg}
    </div>
  )
}
