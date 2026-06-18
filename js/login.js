/**
 * login.js — Giriş formu ve kimlik doğrulama
 * Supabase bağlantısı eklenince DEMO_USERS kaldırılır,
 * handleSubmit içindeki TODO bloğu açılır.
 */

// ─── Demo kullanıcılar (Supabase bağlanana kadar) ───
const DEMO_USERS = {
  'admin@fonssolar.com': {
    password: 'admin123',
    role: 'Yönetici',
    fullName: 'Admin Kullanıcı'
  }
}

// ─── Login formu mantığı ───
const Login = {

  handleSubmit(e) {
    e.preventDefault()

    const email    = document.getElementById('input-email').value.trim().toLowerCase()
    const password = document.getElementById('input-password').value
    const btn      = document.getElementById('login-btn')
    const errorEl  = document.getElementById('login-error')
    const card     = document.querySelector('.login-card')

    // Yükleniyor
    btn.disabled = true
    btn.innerHTML = `
      <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle style="opacity:.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path style="opacity:.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Giriş yapılıyor...`

    // TODO: Supabase auth buraya bağlanacak
    // const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    // if (error) { Login._showError(errorEl, card, btn); return }
    // const user = data.user — role bilgisi profiles tablosundan çekilecek

    setTimeout(() => {
      const user = DEMO_USERS[email]

      if (user && user.password === password) {
        errorEl.style.display = 'none'
        Dashboard.show({ email, ...user })
      } else {
        Login._showError(errorEl, card, btn)
      }
    }, 700)
  },

  togglePassword() {
    const input   = document.getElementById('input-password')
    const icon    = document.getElementById('eye-icon')
    const isHidden = input.type === 'password'

    input.type = isHidden ? 'text' : 'password'

    icon.innerHTML = isHidden
      ? /* EyeOff */ `
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
          <line x1="2" x2="22" y1="2" y2="22"/>`
      : /* Eye */ `
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
          <circle cx="12" cy="12" r="3"/>`

    document.getElementById('eye-btn').style.color = isHidden
      ? 'rgba(255,255,255,0.7)'
      : 'rgba(255,255,255,0.4)'
  },

  _showError(errorEl, card, btn) {
    errorEl.style.display = 'block'
    errorEl.textContent   = 'E-posta veya şifre hatalı.'

    // Kart sallama animasyonu
    card.classList.remove('shake')
    void card.offsetWidth             // reflow — animasyonu sıfırlar
    card.classList.add('shake')

    btn.disabled    = false
    btn.textContent = 'Giriş Yap'
  }
}

// ─── Çıkış (login.js'de olması mantıklı — auth işlemi) ───
const Auth = {
  logout() {
    App.currentUser = null
    App.showPage('login')

    // Formu temizle
    document.getElementById('login-form').reset()
    document.getElementById('login-error').style.display = 'none'
    document.getElementById('login-btn').disabled        = false
    document.getElementById('login-btn').textContent     = 'Giriş Yap'

    // Şifre alanını kapat
    document.getElementById('input-password').type = 'password'
  }
}
