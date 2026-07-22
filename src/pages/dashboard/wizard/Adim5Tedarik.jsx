import { useState } from 'react'
import { useAuth } from '../../../context/AuthContext'

const btnP = { padding: '0.5rem 1.1rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnS = { padding: '0.5rem 1.1rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }

export default function Adim5Tedarik({ result, onDone, onBack }) {
  const { role } = useAuth()
  const canComplete = role === 'proje_yoneticisi'
  const [confirmed, setConfirmed] = useState(result?.completed === true)
  const [error, setError] = useState(null)

  function handleSave() {
    if (!canComplete) {
      onDone({ skipped: true, completed: false, count: 0 })
      return
    }
    if (!confirmed) {
      setError('Devam etmek için tedarik ve teslimat sürecini tamamladığınızı onaylayın.')
      return
    }
    setError(null)
    onDone({ skipped: false, completed: true, count: 1 })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Tedarik ve Teslimat</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Faz 1 — manuel onay</span>
      </div>

      <div style={{ padding: '1.5rem' }}>
        <div style={{ padding: '1rem 1.125rem', border: '1px solid #dbeafe', borderRadius: 8, background: '#eff6ff', marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.35rem', color: '#1e3a8a', fontSize: 14, fontWeight: 700 }}>
            Bu süreç proje yöneticisi tarafından sistem dışında yürütülür.
          </p>
          <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.55 }}>
            Tedarikçi, sipariş ve teslimat tarihleri, durum ve not takibi Faz 2 kapsamındadır.
            Faz 1'de sistem yalnızca sürecin tamamlandığını kaydeder.
          </p>
        </div>

        {canComplete ? (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem 1.125rem', border: `1px solid ${confirmed ? '#86efac' : '#cbd5e1'}`, borderRadius: 8, background: confirmed ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
              style={{ width: 18, height: 18, marginTop: 1, accentColor: '#16a34a' }}
            />
            <span>
              <strong style={{ display: 'block', color: '#166534', fontSize: 14 }}>Tamamladım</strong>
              <span style={{ display: 'block', color: '#64748b', fontSize: 12.5, marginTop: 3 }}>
                Tedarik ve teslimat sürecinin tamamlandığını onaylıyorum.
              </span>
            </span>
          </label>
        ) : (
          <div style={{ padding: '0.875rem 1rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', color: '#64748b', fontSize: 13 }}>
            Bu onayı yalnızca proje yöneticisi verebilir. Bu adım sizin için kayıt oluşturmadan geçilecektir.
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginTop: '1rem', padding: '0.625rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ display: 'none' }}>
        <button type="button" style={btnS} onClick={onBack}>← Geri</button>
        <button type="button" data-wizard-submit="next" style={btnP} onClick={handleSave}>Devam →</button>
      </div>
    </div>
  )
}
