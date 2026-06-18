import { useNavigate } from 'react-router-dom'

export default function Register() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>Kayıt Ol</h1>
        <p style={{ color: '#64748b', marginTop: '.5rem' }}>Kayıt modülü geliştirme aşamasında</p>
        <button onClick={() => navigate('/login')} style={{ marginTop: '1rem', background: '#003B8E', color: '#fff', border: 'none', padding: '.75rem 1.5rem', borderRadius: '.75rem', cursor: 'pointer', fontWeight: 600 }}>
          Giriş Yap
        </button>
      </div>
    </div>
  )
}
