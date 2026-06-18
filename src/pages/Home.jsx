import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>Fons Solar GES</h1>
        <p style={{ color: '#64748b', marginTop: '.5rem' }}>Ana sayfa — geliştirme aşamasında</p>
        <button onClick={() => navigate('/dashboard')} style={{ marginTop: '1rem', background: '#003B8E', color: '#fff', border: 'none', padding: '.75rem 1.5rem', borderRadius: '.75rem', cursor: 'pointer', fontWeight: 600 }}>
          Dashboard'a Git
        </button>
      </div>
    </div>
  )
}
