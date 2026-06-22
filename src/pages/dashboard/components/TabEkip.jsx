import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { getProjects } from '../../../api'

// ─── Rol Konfigürasyonu ───────────────────────────────────────────────────────

const ROLE_CFG = {
  admin:                { label: 'Admin',                 color: '#DC2626', bg: '#FEE2E2' },
  proje_koordinatoru:   { label: 'Proje Koordinatörü',    color: '#003B8E', bg: '#DBEAFE' },
  proje_kurulum_sefi:   { label: 'Proje Kurulum Şefi',    color: '#0369a1', bg: '#E0F2FE' },
  santiye_sefi:         { label: 'Şantiye Şefi',          color: '#0F6E56', bg: '#D1FAE5' },
  mekanik_sef:          { label: 'Mekanik Şef',           color: '#0891B2', bg: '#ECFEFF' },
  elektrik_sefi:        { label: 'Elektrik Şefi',         color: '#7C3AED', bg: '#EDE9FE' },
  isg_sorumlusu:        { label: 'İSG Sorumlusu',         color: '#D97706', bg: '#FEF3C7' },
  kalite_kontrol_sefi:  { label: 'Kalite Kontrol Şefi',   color: '#B45309', bg: '#FEF9C3' },
  lojistik_tedarik:     { label: 'Lojistik & Tedarik',    color: '#9F1239', bg: '#FFE4E6' },
  enh_sorumlusu:        { label: 'ENH Sorumlusu',         color: '#0F766E', bg: '#CCFBF1' },
  operasyon_sorumlusu:  { label: 'Operasyon Sorumlusu',   color: '#4F46E5', bg: '#EEF2FF' },
  evrak_takip:          { label: 'Evrak Takip Uzmanı',    color: '#6D28D9', bg: '#F5F3FF' },
  maliyet_kontrolcu:    { label: 'Maliyet Kontrolcü',     color: '#065F46', bg: '#ECFDF5' },
  is_makinesi_sefi:     { label: 'İş Makinesi Şefi',      color: '#92400E', bg: '#FFFBEB' },
  muhasebe:             { label: 'Muhasebe',               color: '#6D28D9', bg: '#F5F3FF' },
  satin_alma_uzmani:    { label: 'Satın Alma Uzmanı',      color: '#0F766E', bg: '#CCFBF1' },
  proje_tasarim:        { label: 'Proje Tasarım Sorumlusu', color: '#1D4ED8', bg: '#EFF6FF' },
}

const ROLE_KEYS = Object.keys(ROLE_CFG)

const AVATAR_PALETTE = [
  '#003B8E', '#0F6E56', '#7C3AED', '#D97706',
  '#0369a1', '#059669', '#DC2626', '#0F766E',
  '#6D28D9', '#B45309', '#0891B2', '#4F46E5',
]

function getRoleCfg(roleKey) {
  return ROLE_CFG[roleKey] || { label: roleKey?.replace(/_/g, ' ') || 'Kullanıcı', color: '#64748B', bg: '#F1F5F9' }
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function avatarColor(name) {
  if (!name) return AVATAR_PALETTE[0]
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length]
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export default function TabEkip({ projectId }) {
  const { isAdmin, projectId: myProjectId } = useAuth()

  const [projects,    setProjects]    = useState([])
  const [members,     setMembers]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [selProject,  setSelProject]  = useState(projectId || myProjectId || '')
  const [showAdd,     setShowAdd]     = useState(false)
  const [editTarget,  setEditTarget]  = useState(null)

  // Admin: projeleri yükle
  useEffect(() => {
    if (!isAdmin) return
    getProjects().then(({ data }) => setProjects(data || []))
  }, [isAdmin])

  // Seçili proje dışarıdan değişince güncelle
  useEffect(() => {
    if (projectId) setSelProject(projectId)
  }, [projectId])

  // Ekip üyelerini yükle
  const loadMembers = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('profiles')
      .select('id, full_name, email, role_key, project_id')
      .order('full_name')

    if (selProject) {
      q = q.eq('project_id', selProject)
    } else if (!isAdmin) {
      q = myProjectId ? q.eq('project_id', myProjectId) : q
    }

    const { data } = await q
    setMembers(data || [])
    setLoading(false)
  }, [selProject, isAdmin, myProjectId])

  useEffect(() => { loadMembers() }, [loadMembers])

  async function handleRemove(profileId) {
    if (!confirm('Bu kişiyi projeden çıkarmak istediğinizden emin misiniz?')) return
    await supabase.from('profiles').update({ project_id: null }).eq('id', profileId)
    loadMembers()
  }

  // İstatistik hesapla
  const roleSummary = members.reduce((acc, m) => {
    const k = m.role_key || 'diger'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
  const topRoles = Object.entries(roleSummary).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const selProjectName = projects.find(p => p.id === selProject)?.name || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Üst Kontroller ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {isAdmin && (
          <select
            value={selProject}
            onChange={e => setSelProject(e.target.value)}
            style={selectStyle}
          >
            <option value=''>Tüm Ekip</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {!isAdmin && selProjectName && (
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primary)' }}>
            📍 {selProjectName}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {isAdmin && selProject && (
          <button onClick={() => setShowAdd(true)} style={btnPrimaryStyle}>
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span>
            Ekip Üyesi Ekle
          </button>
        )}
      </div>

      {/* ── İstatistik Satırı ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
        <StatCard num={members.length} label="Toplam Üye" color="var(--color-primary)" />
        {topRoles.map(([key, count]) => {
          const cfg = getRoleCfg(key)
          return <StatCard key={key} num={count} label={cfg.label} color={cfg.color} />
        })}
      </div>

      {/* ── Üye Kartları / Boş Durum ── */}
      {loading ? (
        <LoadingGrid />
      ) : members.length === 0 ? (
        <EmptyState isAdmin={isAdmin} selProject={selProject} onAdd={() => setShowAdd(true)} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: '1rem'
        }}>
          {members.map(m =>
            editTarget?.id === m.id
              ? (
                <EditCard
                  key={m.id}
                  member={m}
                  projects={projects}
                  onSave={async (id, updates) => {
                    await supabase.from('profiles').update(updates).eq('id', id)
                    setEditTarget(null)
                    loadMembers()
                  }}
                  onCancel={() => setEditTarget(null)}
                />
              ) : (
                <MemberCard
                  key={m.id}
                  member={m}
                  isAdmin={isAdmin}
                  projectName={projects.find(p => p.id === m.project_id)?.name}
                  onEdit={() => setEditTarget(m)}
                  onRemove={() => handleRemove(m.id)}
                />
              )
          )}
        </div>
      )}

      {/* ── Modal: Üye Ekle ── */}
      {showAdd && (
        <AddMemberModal
          currentProjectId={selProject}
          projectName={selProjectName}
          onAssign={async (profileId) => {
            await supabase.from('profiles').update({ project_id: selProject }).eq('id', profileId)
            setShowAdd(false)
            loadMembers()
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}

// ─── İstatistik Kartı ─────────────────────────────────────────────────────────

function StatCard({ num, label, color }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border-md)',
      borderRadius: '10px', padding: '1rem',
      textAlign: 'center',
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color, lineHeight: 1 }}>{num}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: '0.3rem', lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

// ─── Üye Kartı ────────────────────────────────────────────────────────────────

function MemberCard({ member, isAdmin, projectName, onEdit, onRemove }) {
  const cfg = getRoleCfg(member.role_key)
  const color = avatarColor(member.full_name)

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-md)',
        borderRadius: '12px', padding: '1.25rem',
        boxShadow: 'var(--shadow-card)',
        display: 'flex', flexDirection: 'column', gap: '0.875rem',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-card)'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Avatar + İsim + Rol */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <div style={{
          width: '50px', height: '50px', borderRadius: '50%',
          background: color, color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: '1rem', flexShrink: 0, letterSpacing: '0.5px',
          boxShadow: `0 2px 8px ${color}55`
        }}>
          {initials(member.full_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {member.full_name || 'İsimsiz Kullanıcı'}
          </div>
          <span style={{
            display: 'inline-block', marginTop: '0.25rem',
            background: cfg.bg, color: cfg.color,
            padding: '0.15rem 0.6rem', borderRadius: '999px',
            fontSize: '0.7rem', fontWeight: 700
          }}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Bilgi Satırları */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <InfoRow icon="✉️" text={member.email || '—'} />
        {projectName && <InfoRow icon="📍" text={projectName} />}
      </div>

      {/* Admin Butonları */}
      {isAdmin && (
        <div style={{
          display: 'flex', gap: '0.5rem',
          borderTop: '1px solid var(--color-border)',
          paddingTop: '0.75rem', marginTop: '0.125rem'
        }}>
          <button onClick={onEdit} style={btnSecondaryStyle}>Düzenle</button>
          <button onClick={onRemove} style={btnDangerStyle}>Projeden Çıkar</button>
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  )
}

// ─── Düzenleme Kartı ──────────────────────────────────────────────────────────

function EditCard({ member, projects, onSave, onCancel }) {
  const [fullName, setFullName] = useState(member.full_name || '')
  const [roleKey,  setRoleKey]  = useState(member.role_key || '')
  const [projId,   setProjId]   = useState(member.project_id || '')
  const [saving,   setSaving]   = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(member.id, {
      full_name: fullName.trim(),
      role_key: roleKey || null,
      project_id: projId || null,
    })
    setSaving(false)
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '2px solid var(--color-primary)',
      borderRadius: '12px', padding: '1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
        ✏️ Düzenleniyor: {member.email}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={labelStyle}>Ad Soyad</label>
        <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} placeholder="Ad Soyad" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={labelStyle}>Rol</label>
        <select value={roleKey} onChange={e => setRoleKey(e.target.value)} style={inputStyle}>
          <option value=''>Seçin…</option>
          {ROLE_KEYS.map(k => (
            <option key={k} value={k}>{ROLE_CFG[k].label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={labelStyle}>Proje</label>
        <select value={projId} onChange={e => setProjId(e.target.value)} style={inputStyle}>
          <option value=''>Proje atanmamış</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
        <button onClick={handleSave} disabled={saving} style={{ ...btnPrimaryStyle, flex: 1, justifyContent: 'center' }}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button onClick={onCancel} style={{ ...btnSecondaryStyle, flex: 1 }}>İptal</button>
      </div>
    </div>
  )
}

// ─── Üye Ekleme Modalı ────────────────────────────────────────────────────────

function AddMemberModal({ currentProjectId, projectName, onAssign, onClose }) {
  const [profiles,  setProfiles]  = useState([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [assigning, setAssigning] = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, role_key, project_id')
      .order('full_name')
      .then(({ data }) => {
        setProfiles(data || [])
        setLoading(false)
      })
  }, [])

  const candidates = profiles.filter(p => {
    if (p.project_id === currentProjectId) return false // zaten bu projede
    const q = search.toLowerCase()
    return !q || (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)
  })

  async function handleAssign(profileId) {
    setAssigning(profileId)
    await onAssign(profileId)
    setAssigning(null)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem'
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--color-surface)', borderRadius: '16px',
        padding: '1.5rem', width: '100%', maxWidth: '500px',
        maxHeight: '82vh', display: 'flex', flexDirection: 'column', gap: '1rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Başlık */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)' }}>
              Ekip Üyesi Ekle
            </h3>
            {projectName && (
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                📍 {projectName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--color-muted)', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Arama */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ad veya e-posta ile ara…"
          style={{ ...inputStyle, fontSize: '0.875rem' }}
          autoFocus
        />

        {/* Liste */}
        <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-muted)', fontSize: '0.875rem' }}>Yükleniyor…</div>
          ) : candidates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
              {profiles.length === 0 ? 'Eklenecek kullanıcı bulunamadı.' : 'Eşleşen kullanıcı yok.'}
            </div>
          ) : candidates.map(p => {
            const cfg = getRoleCfg(p.role_key)
            const clr = avatarColor(p.full_name)
            const isAssigning = assigning === p.id
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem', borderRadius: '8px',
                  border: '1px solid var(--color-border-md)',
                  background: 'var(--color-bg)',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  background: clr, color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '0.82rem', flexShrink: 0,
                }}>
                  {initials(p.full_name)}
                </div>

                {/* Bilgi */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>
                    {p.full_name || '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.email}
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                    {p.role_key && (
                      <span style={{ background: cfg.bg, color: cfg.color, padding: '0.05rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700 }}>
                        {cfg.label}
                      </span>
                    )}
                    {p.project_id && p.project_id !== currentProjectId && (
                      <span style={{ background: '#FEF3C7', color: '#92400E', padding: '0.05rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700 }}>
                        Başka projede
                      </span>
                    )}
                  </div>
                </div>

                {/* Ekle Butonu */}
                <button
                  onClick={() => handleAssign(p.id)}
                  disabled={!!assigning}
                  style={{
                    padding: '0.4rem 0.875rem',
                    background: isAssigning ? 'var(--color-muted)' : 'var(--color-primary)',
                    color: 'white', border: 'none', borderRadius: '6px',
                    fontSize: '0.78rem', cursor: assigning ? 'not-allowed' : 'pointer',
                    fontWeight: 700, flexShrink: 0
                  }}
                >
                  {isAssigning ? '…' : 'Ekle'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Boş Durum ────────────────────────────────────────────────────────────────

function EmptyState({ isAdmin, selProject, onAdd }) {
  return (
    <div style={{
      textAlign: 'center', padding: '4rem 2rem',
      background: 'var(--color-surface)', borderRadius: '12px',
      border: '1px solid var(--color-border-md)',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
      <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--color-text)' }}>
        {selProject ? 'Bu projede henüz ekip üyesi yok.' : 'Proje seçin'}
      </div>
      <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        {selProject
          ? 'Ekip üyelerini bu projeye atayabilirsiniz.'
          : 'Ekip üyelerini görmek için bir proje seçin.'}
      </div>
      {isAdmin && selProject && (
        <button onClick={onAdd} style={{ ...btnPrimaryStyle, margin: '0 auto' }}>
          + Ekip Üyesi Ekle
        </button>
      )}
    </div>
  )
}

// ─── Yükleme ──────────────────────────────────────────────────────────────────

function LoadingGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '1rem' }}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} style={{
          height: '160px', borderRadius: '12px',
          background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          border: '1px solid var(--color-border-md)',
        }} />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  )
}

// ─── Ortak Stiller ────────────────────────────────────────────────────────────

const inputStyle = {
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--color-border-md)',
  borderRadius: '7px',
  fontSize: '0.85rem',
  width: '100%',
  outline: 'none',
  fontFamily: 'inherit',
  color: 'var(--color-text)',
  background: 'white',
}

const labelStyle = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const btnPrimaryStyle = {
  display: 'flex', alignItems: 'center', gap: '0.4rem',
  padding: '0.5rem 1rem',
  background: 'var(--color-primary)', color: 'white',
  border: 'none', borderRadius: '8px',
  fontSize: '0.85rem', fontWeight: 700,
  cursor: 'pointer',
}

const btnSecondaryStyle = {
  flex: 1, padding: '0.4rem',
  border: '1px solid var(--color-border-md)',
  borderRadius: '6px', fontSize: '0.78rem',
  cursor: 'pointer', background: 'white',
  color: 'var(--color-text)', fontWeight: 500,
}

const btnDangerStyle = {
  flex: 1, padding: '0.4rem',
  border: '1px solid #FCA5A5',
  borderRadius: '6px', fontSize: '0.78rem',
  cursor: 'pointer', background: '#FFF5F5',
  color: '#DC2626', fontWeight: 500,
}

const selectStyle = {
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--color-border-md)',
  borderRadius: '8px', fontSize: '0.875rem',
  background: 'white', cursor: 'pointer',
  minWidth: '220px', color: 'var(--color-text)',
  fontFamily: 'inherit',
}
