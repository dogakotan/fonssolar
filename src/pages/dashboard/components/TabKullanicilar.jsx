import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'

const PROJE_BAZLI   = ['santiye_sefi', 'muhendis', 'koordinator']
const SIRKET_GENELI = ['admin', 'muhasebe', 'satin_alma_uzmani']
const TUM_ROLLER    = [...SIRKET_GENELI, ...PROJE_BAZLI]

const ROL_ETIKET = {
  admin:             'Yönetici',
  muhasebe:          'Muhasebe',
  santiye_sefi:      'Şantiye Şefi',
  muhendis:          'Mühendis',
  koordinator:       'Koordinatör',
  satin_alma_uzmani: 'Satın Alma Uzmanı',
}

const ROL_RENK = {
  admin:             { bg: '#FEE2E2', color: '#991B1B' },
  muhasebe:          { bg: '#FEF3C7', color: '#92400E' },
  santiye_sefi:      { bg: '#D1FAE5', color: '#065F46' },
  muhendis:          { bg: '#EFF6FF', color: '#185FA5' },
  koordinator:       { bg: '#F5F3FF', color: '#5B21B6' },
  satin_alma_uzmani: { bg: '#FCE7F3', color: '#9D174D' },
}

const RESET_REDIRECT = 'https://fonssolar-dq9j5zmfj-fons-solar.vercel.app/dashboard'

async function callEdgeFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message || 'Sunucu hatası')
  if (data?.error) throw new Error(data.error)
  return data
}

async function callManageFn(action, userId, payload = {}) {
  return callEdgeFn('manage-user', { action, userId, ...payload })
}

const INP = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 12px',
  fontSize: 14, color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}
const LBL = { fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }

function KullaniciModal({ user: editUser, onClose, onSaved }) {
  const isNew = !editUser
  const [form, setForm] = useState({
    full_name: editUser?.full_name || '',
    email:     editUser?.email     || '',
    role_key:  editUser?.role_key  || 'muhendis',
    password:  '',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) return
    if (isNew && !form.password.trim()) { setErr('Şifre zorunludur.'); return }
    setSaving(true)
    setErr('')
    try {
      if (isNew) {
        await callEdgeFn('create-user', {
          email:     form.email.trim(),
          password:  form.password,
          full_name: form.full_name.trim(),
          role_key:  form.role_key,
        })
      } else {
        await callManageFn('update', editUser.id, {
          full_name: form.full_name.trim(),
          role_key:  form.role_key,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>
            {isNew ? 'Yeni Kullanıcı Ekle' : 'Kullanıcıyı Düzenle'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Ad Soyad *</label>
            <input
              style={INP}
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Örn: Ahmet Yılmaz"
              required
            />
          </div>

          <div>
            <label style={LBL}>E-posta *</label>
            <input
              type="email"
              style={{ ...INP, background: isNew ? '#fff' : '#F9FAFB', color: isNew ? '#111827' : '#6B7280' }}
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="kullanici@fonssolar.com"
              disabled={!isNew}
              required
            />
          </div>

          <div>
            <label style={LBL}>Rol</label>
            <select style={INP} value={form.role_key} onChange={e => set('role_key', e.target.value)}>
              <optgroup label="Şirket Geneli">
                {SIRKET_GENELI.map(r => <option key={r} value={r}>{ROL_ETIKET[r]}</option>)}
              </optgroup>
              <optgroup label="Proje Bazlı">
                {PROJE_BAZLI.map(r => <option key={r} value={r}>{ROL_ETIKET[r]}</option>)}
              </optgroup>
            </select>
          </div>

          {isNew && (
            <div>
              <label style={LBL}>Şifre *</label>
              <input
                type="password"
                style={INP}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="En az 8 karakter"
                minLength={8}
                required
              />
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                Kullanıcı ilk girişte şifresini değiştirebilir.
              </p>
            </div>
          )}

          {err && <p style={{ color: '#EF4444', fontSize: 13, margin: 0 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
              İptal
            </button>
            <button type="submit" disabled={saving}
              style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Kaydediliyor…' : isNew ? 'Kullanıcı Oluştur' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SifreSifirlaModal({ user: targetUser, onClose }) {
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')

  async function handleReset() {
    setLoading(true)
    setErr('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetUser.email, {
        redirectTo: RESET_REDIRECT,
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setErr(err.message || 'Bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 32 }}>
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
            <p style={{ color: '#065F46', fontWeight: 600, marginBottom: 6, fontSize: 16 }}>Bağlantı Gönderildi</p>
            <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              <strong>{targetUser.email}</strong> adresine şifre sıfırlama bağlantısı gönderildi.
            </p>
            <button onClick={onClose}
              style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              Tamam
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600, color: '#111827' }}>Şifre Sıfırlama</h3>
            <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              <strong>{targetUser.full_name || targetUser.email}</strong> kullanıcısına şifre sıfırlama e-postası gönderilecek.
            </p>
            {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose}
                style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                İptal
              </button>
              <button onClick={handleReset} disabled={loading}
                style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Gönderiliyor…' : 'E-posta Gönder'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SilModal({ user: targetUser, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState('')

  async function handleDelete() {
    setLoading(true)
    setErr('')
    try {
      await callManageFn('delete', targetUser.id)
      onDeleted()
      onClose()
    } catch (err) {
      setErr(err.message || 'Silme işlemi başarısız.')
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 32 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600, color: '#111827' }}>Kullanıcıyı Sil</h3>
        <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>
          <strong>{targetUser.full_name || targetUser.email}</strong> kullanıcısı kalıcı olarak silinecek.
        </p>
        <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 20 }}>Bu işlem geri alınamaz.</p>
        {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            İptal
          </button>
          <button onClick={handleDelete} disabled={loading}
            style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Siliniyor…' : 'Evet, Sil'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TabKullanicilar() {
  const { user: me } = useAuth()
  const [users,     setUsers]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [rolFilter, setRolFilter] = useState('hepsi')
  const [modal,     setModal]     = useState(null)
  const [editUser,  setEditUser]  = useState(null)
  const [resetUser, setResetUser] = useState(null)
  const [silUser,   setSilUser]   = useState(null)

  async function fetchUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role_key, created_at')
      .order('full_name', { ascending: true })
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const filtered = users.filter(u => {
    const matchRol    = rolFilter === 'hepsi' || u.role_key === rolFilter
    const term        = search.toLowerCase()
    const matchSearch = !term ||
      (u.full_name || '').toLowerCase().includes(term) ||
      (u.email     || '').toLowerCase().includes(term)
    return matchRol && matchSearch
  })

  const totalKullanici = users.length
  const adminSayisi    = users.filter(u => u.role_key === 'admin').length
  const projeBazli     = users.filter(u => PROJE_BAZLI.includes(u.role_key)).length
  const sirketGeneli   = users.filter(u => SIRKET_GENELI.includes(u.role_key)).length

  const KPI = [
    { label: 'Toplam Kullanıcı', value: totalKullanici, color: '#185FA5' },
    { label: 'Yönetici',         value: adminSayisi,    color: '#991B1B' },
    { label: 'Şirket Geneli',    value: sirketGeneli,   color: '#92400E' },
    { label: 'Proje Bazlı',      value: projeBazli,     color: '#065F46' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI Kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {KPI.map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>{k.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: k.color, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tablo */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Ad veya e-posta ara…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180, border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <select
            value={rolFilter}
            onChange={e => setRolFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', background: 'transparent' }}
          >
            <option value="hepsi">Tüm Roller</option>
            <optgroup label="Şirket Geneli">
              {SIRKET_GENELI.map(r => <option key={r} value={r}>{ROL_ETIKET[r]}</option>)}
            </optgroup>
            <optgroup label="Proje Bazlı">
              {PROJE_BAZLI.map(r => <option key={r} value={r}>{ROL_ETIKET[r]}</option>)}
            </optgroup>
          </select>
          <button
            onClick={() => { setEditUser(null); setModal('kullanici') }}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >
            + Kullanıcı Ekle
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Kullanıcı bulunamadı.</div>
        ) : (
          <>
            {/* Masaüstü Tablo */}
            <div style={{ overflowX: 'auto', display: 'none' }} className="desktop-table">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                    {['AD SOYAD', 'E-POSTA', 'ROL', 'KATEGORİ', 'İŞLEMLER'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => {
                    const renk = ROL_RENK[u.role_key] || { bg: '#F3F4F6', color: '#374151' }
                    const isMe = u.id === me?.id
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: renk.bg, color: renk.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                              {(u.full_name || u.email || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#111827' }}>{u.full_name || '—'}</p>
                              {isMe && <span style={{ fontSize: 11, color: '#185FA5', fontWeight: 500 }}>Hesabınız</span>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280' }}>{u.email || '—'}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ background: renk.bg, color: renk.color, fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>
                            {ROL_ETIKET[u.role_key] || u.role_key || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: '#6B7280' }}>
                          {PROJE_BAZLI.includes(u.role_key) ? 'Proje Bazlı' : SIRKET_GENELI.includes(u.role_key) ? 'Şirket Geneli' : '—'}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setEditUser(u); setModal('kullanici') }}
                              style={{ background: '#EFF6FF', color: '#185FA5', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Düzenle
                            </button>
                            <button onClick={() => setResetUser(u)}
                              style={{ background: '#FEF3C7', color: '#92400E', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Şifre
                            </button>
                            {!isMe && (
                              <button onClick={() => setSilUser(u)}
                                style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                                Sil
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Kart Listesi (tüm ekranlarda — overflow ile yönetiliyor) */}
            <div>
              {filtered.map(u => {
                const renk = ROL_RENK[u.role_key] || { bg: '#F3F4F6', color: '#374151' }
                const isMe = u.id === me?.id
                return (
                  <div key={u.id} style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: renk.bg, color: renk.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                          {(u.full_name || u.email || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#111827' }}>
                            {u.full_name || '—'}
                            {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: '#185FA5', fontWeight: 500 }}>Hesabınız</span>}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || '—'}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ background: renk.bg, color: renk.color, fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {ROL_ETIKET[u.role_key] || u.role_key || '—'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button onClick={() => { setEditUser(u); setModal('kullanici') }}
                        style={{ flex: 1, background: '#EFF6FF', color: '#185FA5', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Düzenle
                      </button>
                      <button onClick={() => setResetUser(u)}
                        style={{ flex: 1, background: '#FEF3C7', color: '#92400E', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Şifre Sıfırla
                      </button>
                      {!isMe && (
                        <button onClick={() => setSilUser(u)}
                          style={{ flex: 1, background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Sil
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div style={{ padding: '10px 20px', borderTop: '1px solid #E5E7EB', fontSize: 12, color: '#9CA3AF' }}>
          {filtered.length} kullanıcı gösteriliyor{filtered.length !== users.length ? ` (toplam ${users.length})` : ''}
        </div>
      </div>

      {modal === 'kullanici' && (
        <KullaniciModal
          user={editUser}
          onClose={() => { setModal(null); setEditUser(null) }}
          onSaved={fetchUsers}
        />
      )}
      {resetUser && (
        <SifreSifirlaModal
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
      {silUser && (
        <SilModal
          user={silUser}
          onClose={() => setSilUser(null)}
          onDeleted={fetchUsers}
        />
      )}
    </div>
  )
}
