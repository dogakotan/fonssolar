import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function YetkisizPage() {
  const navigate = useNavigate()
  const { role } = useAuth()

  function handleGeri() {
    navigate('/dashboard')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', background: '#F8F9FA',
    }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 10px' }}>
        Erişim Yetkiniz Yok
      </h1>
      <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 28px', textAlign: 'center', maxWidth: 320 }}>
        Bu sayfayı görüntülemek için gerekli izniniz bulunmuyor.
      </p>
      <button
        onClick={handleGeri}
        style={{
          background: '#185FA5', color: '#fff', border: 'none',
          borderRadius: 8, padding: '10px 28px', fontSize: 14,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Ana Sayfaya Dön
      </button>
    </div>
  )
}
