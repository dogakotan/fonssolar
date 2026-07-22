import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './Login.css'

export default function HesapOlustur() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    const hashError = new URLSearchParams(window.location.hash.slice(1)).get('error_description')
    if (hashError) setError(decodeURIComponent(hashError.replace(/\+/g, ' ')))

    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(Boolean(session))
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 8) { setError('Şifre en az 8 karakter olmalıdır.'); return }
    if (password !== confirmation) { setError('Şifreler eşleşmiyor.'); return }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    await supabase.auth.signOut()
    setCompleted(true)
    setSaving(false)
  }

  return (
    <div className="login-page">
      <div className="login-overlay" />
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo"><img src="/images/fons-logo.jpeg" alt="Fons Solar" /></div>
          <div className="login-title"><h1>Fons Solar</h1><span>Hesabınızı Etkinleştirin</span></div>

          {completed ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#166534', fontWeight: 600 }}>Şifreniz oluşturuldu.</p>
              <button className="login-btn" onClick={() => window.location.assign('/login')}>Giriş Yap</button>
            </div>
          ) : ready ? (
            <form className="login-form" onSubmit={handleSubmit}>
              <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6 }}>Hesabınıza giriş yaparken kullanacağınız şifreyi belirleyin.</p>
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Yeni şifre (en az 8 karakter)" autoComplete="new-password" required minLength={8} />
              <input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Yeni şifre tekrar" autoComplete="new-password" required minLength={8} />
              {error && <p className="login-error">{error}</p>}
              <button className="login-btn" type="submit" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Şifremi Oluştur'}</button>
            </form>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p className="login-error">{error || 'Davet bağlantısı geçersiz, süresi dolmuş veya daha önce kullanılmış.'}</p>
              <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6 }}>Yeni bir davet bağlantısı için yöneticinizle iletişime geçin.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
