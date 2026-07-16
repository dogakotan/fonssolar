import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { getAuthRedirectUrl } from '../../../lib/authRedirect'

const SIRKET_GENELI = ['admin', 'muhasebe']

const PROJE_BAZLI = [
  'santiye_sefi', 'muhendis', 'koordinator', 'proje_yoneticisi',
  'mekanik_sef', 'elektrik_sefi', 'enh_sorumlusu',
  'evrak_takip', 'evrak_takip_uzmani',
  'is_makinesi_operatoru', 'is_makinesi_operator_sefi',
  'isg_sorumlusu', 'kalite_kontrol_sefi',
  'lojistik_tedarik_sorumlusu', 'maliyet_kontrolcu',
  'operasyon_sorumlusu', 'proje_koordinatoru', 'proje_tasarim_sorumlusu',
]

// Dropdown'da gösterilecek benzersiz proje bazlı roller
const PROJE_BAZLI_SECENEK = [
  'santiye_sefi', 'muhendis', 'koordinator', 'proje_yoneticisi',
  'mekanik_sef', 'elektrik_sefi', 'enh_sorumlusu',
  'evrak_takip', 'is_makinesi_operatoru',
  'isg_sorumlusu', 'kalite_kontrol_sefi',
  'lojistik_tedarik_sorumlusu', 'maliyet_kontrolcu',
  'operasyon_sorumlusu', 'proje_koordinatoru', 'proje_tasarim_sorumlusu',
]

const ROL_ETIKET = {
  admin:                       'Yönetici',
  muhasebe:                    'Muhasebe',
  proje_yoneticisi:            'Proje Yöneticisi',
  santiye_sefi:                'Şantiye Şefi',
  muhendis:                    'Mühendis',
  koordinator:                 'Koordinatör',
  mekanik_sef:                 'Mekanik Şef',
  elektrik_sefi:               'Elektrik Şefi',
  enh_sorumlusu:               'ENH Sorumlusu',
  evrak_takip:                 'Evrak Takip Uzmanı',
  evrak_takip_uzmani:          'Evrak Takip Uzmanı',
  is_makinesi_operatoru:       'İş Makinesi Operatörü',
  is_makinesi_operator_sefi:   'İş Makinesi Op. Şefi',
  isg_sorumlusu:               'İSG Sorumlusu',
  kalite_kontrol_sefi:         'Kalite Kontrol Şefi',
  lojistik_tedarik_sorumlusu:  'Lojistik & Tedarik',
  maliyet_kontrolcu:           'Maliyet Kontrolcü',
  operasyon_sorumlusu:         'Operasyon Sorumlusu',
  proje_koordinatoru:          'Proje Koordinatörü',
  proje_tasarim_sorumlusu:     'Proje Tasarım Sor.',
}

const ROL_RENK = {
  admin:                       { bg: '#FEE2E2', color: '#991B1B' },
  muhasebe:                    { bg: '#FEF3C7', color: '#92400E' },
  proje_yoneticisi:            { bg: '#FCE7F3', color: '#9D174D' },
  santiye_sefi:                { bg: '#D1FAE5', color: '#065F46' },
  muhendis:                    { bg: '#EFF6FF', color: '#185FA5' },
  koordinator:                 { bg: '#F5F3FF', color: '#5B21B6' },
  mekanik_sef:                 { bg: '#FFF7ED', color: '#C2410C' },
  elektrik_sefi:               { bg: '#FEF9C3', color: '#854D0E' },
  enh_sorumlusu:               { bg: '#ECFDF5', color: '#047857' },
  evrak_takip:                 { bg: '#F0FDF4', color: '#166534' },
  evrak_takip_uzmani:          { bg: '#F0FDF4', color: '#166534' },
  is_makinesi_operatoru:       { bg: '#FFF7ED', color: '#9A3412' },
  is_makinesi_operator_sefi:   { bg: '#FFF7ED', color: '#9A3412' },
  isg_sorumlusu:               { bg: '#FEF2F2', color: '#B91C1C' },
  kalite_kontrol_sefi:         { bg: '#EEF2FF', color: '#3730A3' },
  lojistik_tedarik_sorumlusu:  { bg: '#F0F9FF', color: '#075985' },
  maliyet_kontrolcu:           { bg: '#FAFAF9', color: '#44403C' },
  operasyon_sorumlusu:         { bg: '#F8FAFC', color: '#1C1917' },
  proje_koordinatoru:          { bg: '#FDF2F8', color: '#9D174D' },
  proje_tasarim_sorumlusu:     { bg: '#F5F3FF', color: '#6D28D9' },
}

function getRenk(role_key)    { return ROL_RENK[role_key] || { bg: '#F3F4F6', color: '#374151' } }
function getRolEtiket(role_key) { return ROL_ETIKET[role_key] || (role_key || '—').replace(/_/g, ' ') }

async function callEdgeFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let msg = error.message || 'Sunucu hatası'
    if (error.context) {
      try {
        const errBody = await error.context.json()
        console.error('Edge function hata detayı:', name, errBody)
        if (errBody?.error) msg = errBody.error
        else if (errBody?.message) msg = errBody.message
      } catch {}
    }
    console.error('Edge function hatası:', name, error.status, msg)
    throw new Error(msg)
  }
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

function KullaniciModal({ user: editUser, projects, onClose, onSaved }) {
  const isNew   = !editUser
  const isPBazli = (rk) => PROJE_BAZLI.includes(rk)

  const [form, setForm] = useState({
    full_name:  editUser?.full_name  || '',
    email:      editUser?.email      || '',
    role_key:   editUser?.role_key   || 'muhendis',
    project_id: editUser?.project_id || '',
    password:   '',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleRolChange = (v) => {
    set('role_key', v)
    if (!isPBazli(v)) set('project_id', '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) return
    if (isNew && !form.password.trim()) { setErr('Şifre zorunludur.'); return }
    if (isNew && form.password.length < 6) { setErr('Şifre en az 6 karakter olmalıdır.'); return }
    setSaving(true)
    setErr('')
    try {
      const projId = isPBazli(form.role_key) ? (form.project_id || null) : null

      if (isNew) {
        const payload = {
          email:      form.email.trim(),
          password:   form.password,
          full_name:  form.full_name.trim(),
          role_key:   form.role_key,
          project_id: projId,
        }
        await callEdgeFn('create-user', payload)
        // project_id'yi doğrudan profiles'a yaz (edge fn desteklemese de çalışır)
        if (projId) {
          await supabase.from('profiles').update({ project_id: projId }).eq('email', form.email.trim())
        }
      } else {
        // Bu ekranda e-posta/şifre değiştirilmediği için Edge Function'a gerek yok.
        // Proje ve rol doğrudan profiles tablosundaki kullanıcı profiline kaydedilir.
        const { error: profileError } = await supabase.from('profiles').update({
          full_name:  form.full_name.trim(),
          role_key:   form.role_key,
          project_id: projId,
        }).eq('id', editUser.id)
        if (profileError) throw new Error(profileError.message)
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
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>
            {isNew ? 'Yeni Kullanıcı Ekle' : 'Kullanıcıyı Düzenle'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Ad Soyad *</label>
            <input style={INP} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Örn: Ahmet Yılmaz" required />
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
            <select style={INP} value={form.role_key} onChange={e => handleRolChange(e.target.value)}>
              <optgroup label="Şirket Geneli">
                {SIRKET_GENELI.map(r => <option key={r} value={r}>{ROL_ETIKET[r] || r}</option>)}
              </optgroup>
              <optgroup label="Proje Bazlı">
                {PROJE_BAZLI_SECENEK.map(r => <option key={r} value={r}>{ROL_ETIKET[r] || r}</option>)}
              </optgroup>
            </select>
          </div>

          {isPBazli(form.role_key) && (
            <div>
              <label style={LBL}>Proje</label>
              <select style={INP} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Proje seçin —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                Kullanıcı yalnızca seçilen projenin verilerini görür.
              </p>
            </div>
          )}

          {isNew && (
            <div>
              <label style={LBL}>Şifre *</label>
              <input
                type="password"
                style={INP}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="En az 6 karakter"
                minLength={6}
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
      const { error } = await supabase.auth.resetPasswordForEmail(targetUser.email, { redirectTo: getAuthRedirectUrl('/dashboard') })
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
  const [users,       setUsers]       = useState([])
  const [projects,    setProjects]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [rolFilter,   setRolFilter]   = useState('hepsi')
  const [projeFilter, setProjeFilter] = useState('hepsi')
  const [modal,       setModal]       = useState(null)
  const [editUser,    setEditUser]    = useState(null)
  const [resetUser,   setResetUser]   = useState(null)
  const [silUser,     setSilUser]     = useState(null)

  async function fetchData() {
    setLoading(true)
    const [{ data: u }, { data: p }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role_key, project_id, created_at').order('full_name'),
      supabase.from('projects').select('id, name').order('name'),
    ])
    setUsers(u || [])
    setProjects(p || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const projMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

  const filtered = users.filter(u => {
    const matchRol    = rolFilter   === 'hepsi' || u.role_key   === rolFilter
    const matchProje  = projeFilter === 'hepsi' || u.project_id === projeFilter
    const term        = search.toLowerCase()
    const matchSearch = !term ||
      (u.full_name || '').toLowerCase().includes(term) ||
      (u.email     || '').toLowerCase().includes(term)
    return matchRol && matchProje && matchSearch
  })

  const KPI = [
    { label: 'Toplam Kullanıcı', value: users.length,                                             color: '#185FA5' },
    { label: 'Yönetici',         value: users.filter(u => u.role_key === 'admin').length,          color: '#991B1B' },
    { label: 'Şirket Geneli',    value: users.filter(u => SIRKET_GENELI.includes(u.role_key)).length, color: '#92400E' },
    { label: 'Proje Bazlı',      value: users.filter(u => PROJE_BAZLI.includes(u.role_key)).length,  color: '#065F46' },
  ]

  const BTN = (bg, color) => ({
    background: bg, color, border: 'none', borderRadius: 6,
    padding: '5px 12px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI Kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        {KPI.map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>{k.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: k.color, margin: 0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Liste Kartı */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Ad veya e-posta ara…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 160, border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <select
            value={rolFilter}
            onChange={e => setRolFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', background: '#fff' }}
          >
            <option value="hepsi">Tüm Roller</option>
            <optgroup label="Şirket Geneli">
              {SIRKET_GENELI.map(r => <option key={r} value={r}>{ROL_ETIKET[r] || r}</option>)}
            </optgroup>
            <optgroup label="Proje Bazlı">
              {PROJE_BAZLI_SECENEK.map(r => <option key={r} value={r}>{ROL_ETIKET[r] || r}</option>)}
            </optgroup>
          </select>
          <select
            value={projeFilter}
            onChange={e => setProjeFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', background: '#fff' }}
          >
            <option value="hepsi">Tüm Projeler</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={() => { setEditUser(null); setModal('kullanici') }}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >
            + Kullanıcı Ekle
          </button>
        </div>

        {/* Liste */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Kullanıcı bulunamadı.</div>
        ) : filtered.map(u => {
          const renk   = getRenk(u.role_key)
          const isMe   = u.id === me?.id
          const projAdi = u.project_id ? projMap[u.project_id] : null

          return (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 20px', borderBottom: '1px solid #F3F4F6', flexWrap: 'wrap', position: 'relative',
            }}>
              {/* Avatar + İsim + Mail */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 200px', minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: renk.bg, color: renk.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>
                  {(u.full_name || u.email || '?')[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.full_name || '—'}
                    {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: '#185FA5', fontWeight: 500 }}>Hesabınız</span>}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.email || '—'}
                  </p>
                </div>
              </div>

              {/* Rol + Proje Rozetleri */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)', maxWidth: '36%', textAlign: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#64748B', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {getRolEtiket(u.role_key)}
                </span>
                {projAdi && (
                  <span style={{ color: '#94A3B8', fontSize: 12, whiteSpace: 'nowrap' }}>
                    · {projAdi}
                  </span>
                )}
                {PROJE_BAZLI.includes(u.role_key) && !projAdi && (
                  <span style={{ color: '#94A3B8', fontSize: 12, whiteSpace: 'nowrap' }}>
                    Proje Atanmadı
                  </span>
                )}
              </div>

              {/* İşlem Butonları */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => { setEditUser(u); setModal('kullanici') }} style={BTN('#EFF6FF', '#185FA5')}>
                  Düzenle
                </button>
                <button onClick={() => setResetUser(u)} style={BTN('#FEF3C7', '#92400E')}>
                  Şifre
                </button>
                {!isMe && (
                  <button onClick={() => setSilUser(u)} style={BTN('#FEE2E2', '#991B1B')}>
                    Sil
                  </button>
                )}
              </div>
            </div>
          )
        })}

        <div style={{ padding: '10px 20px', borderTop: '1px solid #E5E7EB', fontSize: 12, color: '#9CA3AF' }}>
          {filtered.length} kullanıcı gösteriliyor{filtered.length !== users.length ? ` (toplam ${users.length})` : ''}
        </div>
      </div>

      {modal === 'kullanici' && (
        <KullaniciModal
          user={editUser}
          projects={projects}
          onClose={() => { setModal(null); setEditUser(null) }}
          onSaved={fetchData}
        />
      )}
      {resetUser && <SifreSifirlaModal user={resetUser} onClose={() => setResetUser(null)} />}
      {silUser   && <SilModal user={silUser} onClose={() => setSilUser(null)} onDeleted={fetchData} />}
    </div>
  )
}
