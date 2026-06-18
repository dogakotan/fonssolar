'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // TODO: Supabase auth bağlantısı buraya gelecek
      // const { data, error } = await supabase.auth.signInWithPassword({
      //   email: username + '@fons.com',
      //   password,
      // })
      // if (error) throw error
      // router.push('/admin' | '/santiye' | '/satin-alma') — role bazlı yönlendirme
      await new Promise((r) => setTimeout(r, 800)) // placeholder
      setError('Supabase henüz bağlanmadı. .env.local dosyasını doldurun.')
    } catch {
      setError('Kullanıcı adı veya şifre hatalı.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4 py-8">
      {/* ── Arka plan görseli ── */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/images/solar-bg.jpg"
          alt="Fons Solar Güneş Enerjisi Santrali"
          fill
          className="object-cover"
          priority
          quality={90}
        />
        {/* Koyu overlay + hafif blur */}
        <div className="absolute inset-0 bg-slate-900/58" style={{ backdropFilter: 'blur(3px)' }} />
      </div>

      {/* ── Login kartı ── */}
      <div className="w-full max-w-[440px]">
        <div className="glass-card rounded-2xl px-8 py-10 md:px-10">

          {/* Logo & Başlık */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-[84px] h-[84px] rounded-2xl overflow-hidden shadow-xl ring-2 ring-white/10 mb-5">
              <Image
                src="/images/fons-logo.jpeg"
                alt="Fons Solar Logo"
                fill
                className="object-cover"
              />
            </div>
            <h1 className="text-white text-xl font-bold tracking-wide">Fons Solar</h1>
            <p className="text-white/55 text-[0.75rem] mt-1 tracking-widest uppercase">
              Proje Takip Sistemi
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* E-posta */}
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="E-posta adresinizi giriniz"
              required
              autoComplete="email"
              className="input-glass w-full rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/38"
            />

            {/* Şifre */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Şifrenizi giriniz"
                required
                autoComplete="current-password"
                className="input-glass w-full rounded-xl px-4 py-3 pr-11 text-white text-sm placeholder:text-white/38"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/75 transition-colors"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {/* Hata mesajı */}
            {error && (
              <div className="text-red-300 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl py-2.5 px-3">
                {error}
              </div>
            )}

            {/* Giriş butonu */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 bg-[#003B8E] hover:bg-[#002d70] active:bg-[#00236a]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         text-white font-semibold py-3 rounded-xl
                         transition-all duration-200 text-sm tracking-wide
                         shadow-lg shadow-blue-950/40"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerIcon />
                  Giriş yapılıyor...
                </span>
              ) : (
                'Giriş Yap'
              )}
            </button>
          </form>
        </div>

        {/* Alt copyright */}
        <p className="text-center text-white/25 text-xs mt-5 tracking-wide">
          © 2026 Fons Solar. Tüm hakları saklıdır.
        </p>
      </div>
    </main>
  )
}

/* ── İkonlar (inline SVG — harici bağımlılık yok) ── */

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
