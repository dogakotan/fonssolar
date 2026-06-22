import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, supabase } from '../lib/supabase'
import './Login.css'

const RESET_REDIRECT = 'https://fonssolar-dq9j5zmfj-fons-solar.vercel.app/dashboard'

export default function Login() {
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  const [mode, setMode]                 = useState('login')
  const [resetEmail, setResetEmail]     = useState('')
  const [resetSent, setResetSent]       = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetErr, setResetErr]         = useState('')

  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error: authError } = await signIn(email, password)
      if (authError) throw authError
      if (data.user) navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'E-posta veya şifre hatalı.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    setResetLoading(true)
    setResetErr('')
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: RESET_REDIRECT,
      })
      if (resetError) throw resetError
      setResetSent(true)
    } catch (err) {
      setResetErr(err.message || 'Bir hata oluştu, lütfen tekrar deneyin.')
    } finally {
      setResetLoading(false)
    }
  }

  if (mode === 'reset') {
    return (
      <div className="login-page">
        <div className="login-overlay" />
        <div className="login-wrap">
          <div className="login-card">
            <div className="login-logo">
              <img src="/images/fons-logo.jpeg" alt="Fons Solar" />
            </div>
            <div className="login-title">
              <h1>Fons Solar</h1>
              <span>Şifre Sıfırlama</span>
            </div>

            {resetSent ? (
              <div style={{ textAlign: 'center', padding: '4px 0 16px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
                <p style={{ color: '#065F46', fontWeight: 600, marginBottom: 6 }}>E-posta Gönderildi</p>
                <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                  <strong>{resetEmail}</strong> adresine şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.
                </p>
                <button
                  onClick={() => { setMode('login'); setResetSent(false); setResetEmail('') }}
                  className="login-btn"
                >
                  Giriş Sayfasına Dön
                </button>
              </div>
            ) : (
              <form className="login-form" onSubmit={handleReset}>
                <p style={{ color: '#6B7280', fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>
                  Kayıtlı e-posta adresinizi girin. Şifre sıfırlama bağlantısı göndereceğiz.
                </p>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="E-posta adresinizi giriniz"
                  autoComplete="email"
                  required
                />
                {resetErr && <p className="login-error">{resetErr}</p>}
                <button type="submit" className="login-btn" disabled={resetLoading}>
                  {resetLoading ? <><Spinner /> Gönderiliyor...</> : 'Sıfırlama Bağlantısı Gönder'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setResetErr('') }}
                    style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}
                  >
                    ← Geri Dön
                  </button>
                </div>
              </form>
            )}
          </div>
          <p className="login-copyright">© 2026 Fons Solar. Tüm hakları saklıdır.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-overlay" />

      <div className="login-wrap">
        <div className={`login-card ${error ? 'shake' : ''}`}>

          <div className="login-logo">
            <img src="/images/fons-logo.jpeg" alt="Fons Solar" />
          </div>

          <div className="login-title">
            <h1>Fons Solar</h1>
            <span>Proje Takip Sistemi</span>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="E-posta adresinizi giriniz"
              autoComplete="email"
              required
            />

            <div className="pw-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Şifrenizi giriniz"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPassword(v => !v)}
                aria-label="Şifreyi göster/gizle"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <><Spinner /> Giriş yapılıyor...</> : 'Giriş Yap'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setMode('reset'); setError('') }}
                style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Şifremi Unuttum
              </button>
            </div>
          </form>
        </div>

        <p className="login-copyright">© 2026 Fons Solar. Tüm hakları saklıdır.</p>
      </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
      <line x1="2" x2="22" y1="2" y2="22"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ display: 'inline-block' }}>
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}
