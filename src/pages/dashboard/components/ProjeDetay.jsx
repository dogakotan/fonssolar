import { useState, useEffect, useMemo, useRef } from 'react'
import { getProjects, getWorkPackages } from '../../../api'
import { exportGunlukRaporPdf, exportGunlukRaporExcel } from '../../../utils/exportUtils'
import TicketListesi from '../../../components/tickets/TicketListesi'
import ProjeTabSatinAlma from './ProjeTabSatinAlma'
import ProjeTabFinans from './ProjeTabFinans'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import TabIsPlan from './TabIsPlan'
import ProjectOverviewDashboard from './ProjectOverviewDashboard'
import DailyReportList from '../../DailyReportList'

// ── Periyot yardımcıları ──────────────────────────────────────────────────────
const PERIODS = [
  { key: 'gunluk', label: 'Günlük' },
  { key: 'haftalik', label: 'Haftalık' },
  { key: 'aylik',    label: 'Aylık'   },
]


// ── Halka (Donut) Grafik ──────────────────────────────────────────────────────
// ── Günlük İş Kartı (kompakt, load-more) ────────────────────────────────────
// ── Ekip Listesi ─────────────────────────────────────────────────────────────
const EKIP_ROLE_CFG = {
  admin:               { label: 'Admin',                 color: '#DC2626', bg: '#FEE2E2' },
  proje_koordinatoru:  { label: 'Proje Koordinatörü',    color: '#003B8E', bg: '#DBEAFE' },
  proje_kurulum_sefi:  { label: 'Proje Kurulum Şefi',    color: '#0369a1', bg: '#E0F2FE' },
  santiye_sefi:        { label: 'Şantiye Şefi',          color: '#0F6E56', bg: '#D1FAE5' },
  mekanik_sef:         { label: 'Mekanik Şef',           color: '#0891B2', bg: '#ECFEFF' },
  elektrik_sefi:       { label: 'Elektrik Şefi',         color: '#7C3AED', bg: '#EDE9FE' },
  isg_sorumlusu:       { label: 'İSG Sorumlusu',         color: '#D97706', bg: '#FEF3C7' },
  kalite_kontrol_sefi: { label: 'Kalite Kontrol Şefi',   color: '#B45309', bg: '#FEF9C3' },
  lojistik_tedarik:    { label: 'Lojistik & Tedarik',    color: '#9F1239', bg: '#FFE4E6' },
  enh_sorumlusu:       { label: 'ENH Sorumlusu',         color: '#0F766E', bg: '#CCFBF1' },
  operasyon_sorumlusu: { label: 'Operasyon Sorumlusu',   color: '#4F46E5', bg: '#EEF2FF' },
  evrak_takip:         { label: 'Evrak Takip Uzmanı',    color: '#6D28D9', bg: '#F5F3FF' },
  maliyet_kontrolcu:   { label: 'Maliyet Kontrolcü',     color: '#065F46', bg: '#ECFDF5' },
  muhasebe:             { label: 'Muhasebe',                color: '#6D28D9', bg: '#F5F3FF' },
  satin_alma_uzmani:    { label: 'Satın Alma Uzmanı',       color: '#0F766E', bg: '#CCFBF1' },
  is_makinesi_operator: { label: 'İş Makinesi Op. Şefi',   color: '#EA580C', bg: '#FFEDD5' },
  proje_tasarim_sorumlusu: { label: 'Proje Tasarım Sorum.', color: '#0891B2', bg: '#CFFAFE' },
}
const AVATAR_RENKLER = ['#003B8E','#0F6E56','#7C3AED','#D97706','#0369a1','#059669','#DC2626','#0F766E','#6D28D9','#B45309']
function ekipAvatarRenk(name) { return AVATAR_RENKLER[(name?.charCodeAt(0) || 0) % AVATAR_RENKLER.length] }
function ekipInitials(name) { return name?.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?' }
function ekipRolCfg(k) { return EKIP_ROLE_CFG[k] || { label: k?.replace(/_/g, ' ') || 'Kullanıcı', color: '#64748B', bg: '#F1F5F9' } }

function EkipListesi({ projectId }) {
  const { isAdmin } = useAuth()
  const [members,     setMembers]     = useState([])
  const [allProfiles, setAllProfiles] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [assigning,   setAssigning]   = useState(null)
  const [modalTab,    setModalTab]    = useState('assign')
  const [search,      setSearch]      = useState('')
  const [newForm,     setNewForm]     = useState({ full_name: '', role_key: '', email: '' })
  const [creating,    setCreating]    = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role_key, project_id')
      .eq('project_id', projectId)
      .order('full_name')
    setMembers(data || [])
    setLoading(false)
  }

  useEffect(() => { if (projectId) load() }, [projectId])

  async function openModal() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role_key, project_id')
      .order('full_name')
    setAllProfiles(data || [])
    setModalTab('assign')
    setSearch('')
    setNewForm({ full_name: '', role_key: '', email: '' })
    setShowModal(true)
  }

  async function assign(profileId) {
    setAssigning(profileId)
    await supabase.from('profiles').update({ project_id: projectId }).eq('id', profileId)
    setAssigning(null)
    setShowModal(false)
    load()
  }

  async function createAndAssign() {
    if (!newForm.full_name.trim() || !newForm.role_key) return
    setCreating(true)
    const { error } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(),
      full_name: newForm.full_name.trim(),
      role_key: newForm.role_key,
      email: newForm.email.trim() || null,
      project_id: projectId,
    })
    if (!error) {
      setShowModal(false)
      setNewForm({ full_name: '', role_key: '', email: '' })
      load()
    }
    setCreating(false)
  }

  async function remove(profileId) {
    if (!confirm('Bu kişiyi projeden çıkarmak istediğinizden emin misiniz?')) return
    await supabase.from('profiles').update({ project_id: null }).eq('id', profileId)
    load()
  }

  const candidates = allProfiles.filter(p => p.project_id !== projectId)
  const filteredCandidates = search.trim()
    ? candidates.filter(p =>
        (p.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.email || '').toLowerCase().includes(search.toLowerCase())
      )
    : candidates

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  return (
    <div className="card">
      {/* Başlık */}
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Proje Ekibi</h3>
          <span style={{ background: '#EFF6FF', color: '#003B8E', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
            {members.length} kişi
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={openModal}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#003B8E', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ekip Üyesi Ekle
          </button>
        )}
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Yükleniyor…</div>
      ) : members.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
          Bu projeye henüz ekip üyesi atanmamış.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>Ad Soyad</th>
                <th>Rol</th>
                <th>E-posta</th>
                {isAdmin && <th style={{ width: 90 }}>İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const cfg = ekipRolCfg(m.role_key)
                const clr = ekipAvatarRenk(m.full_name)
                return (
                  <tr key={m.id}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: clr, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                        {ekipInitials(m.full_name)}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{m.full_name || '—'}</span>
                    </td>
                    <td>
                      <span style={{ background: cfg.bg, color: cfg.color, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.email || '—'}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => remove(m.id)}
                          style={{ border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 12px', background: '#FFF5F5', color: '#DC2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Çıkar
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

            {/* Modal Başlık + Sekmeler */}
            <div style={{ padding: '1.25rem 1.5rem 0', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Ekip Üyesi Ekle</h3>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 18, lineHeight: 1, padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit' }}
                >✕</button>
              </div>
              <div style={{ display: 'flex' }}>
                {[['assign', 'Mevcut Üye Ata'], ['new', 'Yeni Üye Oluştur']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setModalTab(key)}
                    style={{
                      border: 'none', background: 'none', padding: '0.5rem 1rem',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      borderBottom: modalTab === key ? '2px solid #003B8E' : '2px solid transparent',
                      color: modalTab === key ? '#003B8E' : 'var(--color-muted)',
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Modal Gövde */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              {modalTab === 'assign' ? (
                <>
                  <input
                    type="text"
                    placeholder="İsim veya e-posta ara…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ ...inputStyle, marginBottom: '0.75rem' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {filteredCandidates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-muted)', fontSize: 13 }}>
                        {search ? 'Arama sonucu bulunamadı.' : 'Eklenecek kullanıcı bulunamadı.'}
                      </div>
                    ) : filteredCandidates.map(p => {
                      const cfg = ekipRolCfg(p.role_key)
                      const clr = ekipAvatarRenk(p.full_name)
                      const isBusy = assigning === p.id
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', borderRadius: 8, border: '1px solid var(--color-border-md)', background: 'var(--color-bg)' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: clr, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                            {ekipInitials(p.full_name)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.full_name || '—'}</div>
                            {p.email && <div style={{ fontSize: 11, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>}
                            <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                              {p.role_key && <span style={{ background: cfg.bg, color: cfg.color, padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{cfg.label}</span>}
                              {p.project_id && p.project_id !== projectId && <span style={{ background: '#FEF3C7', color: '#92400E', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>Başka projede</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => assign(p.id)}
                            disabled={!!assigning}
                            style={{ padding: '5px 14px', background: isBusy ? '#94A3B8' : '#003B8E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: assigning ? 'not-allowed' : 'pointer', flexShrink: 0, fontFamily: 'inherit' }}
                          >
                            {isBusy ? '…' : 'Ekle'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Ad Soyad <span style={{ color: '#DC2626' }}>*</span></label>
                    <input
                      type="text"
                      placeholder="Ahmet Yılmaz"
                      value={newForm.full_name}
                      onChange={e => setNewForm(f => ({ ...f, full_name: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Rol <span style={{ color: '#DC2626' }}>*</span></label>
                    <select
                      value={newForm.role_key}
                      onChange={e => setNewForm(f => ({ ...f, role_key: e.target.value }))}
                      style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}
                    >
                      <option value="">— Rol seçin —</option>
                      {Object.entries(EKIP_ROLE_CFG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
                      E-posta <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: 11 }}>(opsiyonel)</span>
                    </label>
                    <input
                      type="email"
                      placeholder="ahmet@fonssolar.com"
                      value={newForm.email}
                      onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <button
                    onClick={createAndAssign}
                    disabled={!newForm.full_name.trim() || !newForm.role_key || creating}
                    style={{
                      padding: '10px', color: '#fff', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 700, fontFamily: 'inherit', marginTop: 4,
                      background: (!newForm.full_name.trim() || !newForm.role_key || creating) ? '#94A3B8' : '#003B8E',
                      cursor: (!newForm.full_name.trim() || !newForm.role_key || creating) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {creating ? 'Oluşturuluyor…' : 'Üye Oluştur ve Ekle'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stil sabitleri ─────────────────────────────────────────────────────────────
const tabBtn = {
  padding: '6px 14px', borderRadius: 7, border: '1px solid var(--color-border)',
  background: 'transparent', color: 'var(--color-text)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
}
const tabBtnActive = {
  ...tabBtn, background: 'var(--color-primary)', color: '#fff',
  borderColor: 'var(--color-primary)', fontWeight: 600,
}
const periodBtn = {
  padding: '5px 14px', borderRadius: 20, border: '1px solid var(--color-border)',
  background: '#fff', color: 'var(--color-muted)', fontSize: 12, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
}
const periodBtnActive = {
  ...periodBtn, background: 'var(--color-primary)', color: '#fff',
  borderColor: 'var(--color-primary)',
}
const periodNavBtn = {
  padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: '#fff', color: 'var(--color-text)', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4,
}
const periodSegment = {
  display: 'flex', gap: 4, padding: 3, border: '1px solid var(--color-border)',
  borderRadius: 999, background: '#fff',
}
const periodSegmentInCalendar = {
  ...periodSegment,
  marginBottom: 12,
  width: '100%',
  boxSizing: 'border-box',
  justifyContent: 'space-between',
}
const periodSegmentBtn = {
  padding: '5px 10px', borderRadius: 999, border: 'none', background: 'transparent',
  color: 'var(--color-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', lineHeight: 1,
}
const periodSegmentActive = {
  ...periodSegmentBtn, background: 'var(--color-primary)', color: '#fff',
}
const calendarBtn = {
  width: 32, height: 32, borderRadius: 9, border: '1px solid var(--color-border)',
  background: '#fff', color: 'var(--color-muted)', display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}
const calendarPopover = {
  position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 500,
  width: 224, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 12,
  boxShadow: '0 14px 34px rgba(15,23,42,.14)', padding: 12,
}
const calendarHeader = {
  display: 'grid', gridTemplateColumns: '28px 1fr 28px', alignItems: 'center',
  gap: 5, marginBottom: 10, color: '#0f172a', fontSize: 12, textTransform: 'capitalize',
}
const calendarNav = {
  border: 'none', background: '#fff', color: '#0f172a', fontSize: 17,
  lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
}
const calendarWeekdays = {
  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
  color: '#0f172a', fontSize: 10, fontWeight: 800, textAlign: 'center', marginBottom: 5,
}
const calendarGrid = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }
const calendarDay = {
  height: 24, border: 'none', borderRadius: 6, background: 'transparent',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}
const calendarDayActive = { background: '#2563EB', outline: '3px solid #0f172a', outlineOffset: -2 }
const calendarFooter = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8 }
const calendarLink = { border: 'none', background: 'transparent', color: '#2563EB', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const backBtn = {
  padding: '6px 12px', borderRadius: 7, border: '1px solid var(--color-border)',
  background: 'transparent', color: 'var(--color-muted)', fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
  gap: '0.3rem', transition: 'all 0.15s',
}

function todayStr() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseLocalDate(value) {
  const [year, month, day] = String(value || todayStr()).split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function toDateStr(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, Math.min(date.getDate(), 28))
}

function startOfWeek(date) {
  const day = date.getDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}

function endOfWeek(date) {
  return addDays(startOfWeek(date), 6)
}

function getPeriodLabel(dateStr, mode = 'gunluk') {
  const d = parseLocalDate(dateStr)
  if (mode === 'haftalik') {
    return `${startOfWeek(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} - ${endOfWeek(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}`
  }
  if (mode === 'aylik') {
    return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  }
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function buildCalendarDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = addDays(first, -offset)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

// ── Ana Bileşen ───────────────────────────────────────────────────────────────
export default function ProjeDetay({ projectId, projectName, onBack, selectedDate, setSelectedDate }) {
  const [tab, setTab]                = useState('genel')

  const [project, setProject]        = useState(null)
  const [wps, setWPs]                = useState([])
  const [progressSummary, setProgressSummary] = useState(null)
  const [filterMode, setFilterMode]  = useState('gunluk')   // 'gunluk' | 'haftalik' | 'aylik'
  const [loading, setLoading]        = useState(true)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [filterDate, setFilterDate]  = useState(todayStr())
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = parseLocalDate(todayStr())
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const exportRef = useRef(null)
  const calendarRef = useRef(null)
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])

  useEffect(() => {
    function handleOut(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false)
      if (calendarRef.current && !calendarRef.current.contains(e.target)) setShowCalendar(false)
    }
    if (showExportMenu || showCalendar) document.addEventListener('mousedown', handleOut)
    return () => document.removeEventListener('mousedown', handleOut)
  }, [showExportMenu, showCalendar])

  function navPrev() {
    setFilterDate(prev => {
      const d = parseLocalDate(prev)
      const next = filterMode === 'aylik'
        ? addMonths(d, -1)
        : addDays(d, filterMode === 'haftalik' ? -7 : -1)
      setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1))
      return toDateStr(next)
    })
  }

  function navNext() {
    setFilterDate(prev => {
      const d = parseLocalDate(prev)
      const next = filterMode === 'aylik'
        ? addMonths(d, 1)
        : addDays(d, filterMode === 'haftalik' ? 7 : 1)
      setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1))
      return toDateStr(next)
    })
  }

  function handleFilter(mode) {
    setFilterMode(mode)
  }

  function selectCalendarDay(day) {
    setFilterDate(toDateStr(day))
    setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1))
    setShowCalendar(false)
  }

  function jumpToday() {
    const today = parseLocalDate(todayStr())
    setFilterDate(toDateStr(today))
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setShowCalendar(false)
  }

  async function handleExport(type, period = 'gunluk') {
    setShowExportMenu(false)

    const [{ data: dr }, { data: latestDr }] = await Promise.all([
      supabase
        .from('daily_reports')
        .select('id')
        .eq('project_id', projectId)
        .eq('report_date', filterDate)
        .maybeSingle(),
      supabase
        .from('daily_reports')
        .select('id')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const reportRow = dr || latestDr

    let personelData = null
    let ilerlemeData = []
    let doneTasks    = []
    let plannedTasks = []

    if (reportRow) {
      const rid = reportRow.id
      const [persRes, machRes, taskRes, pdRes] = await Promise.all([
        supabase.from('personnel_log_entries').select('shift, department, count').eq('report_id', rid),
        supabase.from('machinery_logs').select('machine_type, count').eq('report_id', rid),
        supabase.from('daily_tasks').select('type, description').eq('report_id', rid).order('order_index'),
        supabase.from('progress_daily').select('qty_added, progress_items(name, category, target_qty, unit, total_progress)').eq('report_id', rid),
      ])

      const SHIFT_KEY = { 'mühendis': 'muhendis', 'usta': 'usta', 'işçi': 'isci' }
      const MACH_KEY  = { 'vinç': 'vinc', 'traktör': 'traktor' }

      const p = {}
      ;(persRes.data || []).forEach(r => {
        const sk = SHIFT_KEY[r.shift] || r.shift
        p[`${r.department}_${sk}`] = r.count
      })
      ;(machRes.data || []).forEach(m => {
        p[MACH_KEY[m.machine_type] || m.machine_type] = m.count
      })
      if (Object.keys(p).length) personelData = p

      const tasks = taskRes.data || []
      doneTasks    = tasks.filter(t => t.type === 'tamamlandı').map(t => t.description)
      plannedTasks = tasks.filter(t => t.type === 'planlandı').map(t => t.description)

      ilerlemeData = (pdRes.data || []).map(r => {
        const item = r.progress_items || {}
        const pct  = item.target_qty > 0
          ? Math.round((item.total_progress || 0) / item.target_qty * 100)
          : 0
        return {
          work_item:        item.name,
          category:         item.category,
          quantity:         item.target_qty,
          unit:             item.unit,
          daily_progress:   r.qty_added,
          total_progress:   item.total_progress,
          progress_percent: pct,
        }
      })
    }

    const opts = {
      selectedDate: new Date(filterDate + 'T00:00:00'),
      projectName,
      doneTasks,
      plannedTasks,
    }

    if (period !== 'gunluk') {
      const title = period === 'haftalik' ? 'Haftalık Proje Raporu' : 'Aylık Proje Raporu'
      const columns = ['Alan', 'Değer']
      const rows = [
        ['Proje', project?.name || projectName || projectId],
        ['Seçili Tarih', new Date(filterDate + 'T00:00:00').toLocaleDateString('tr-TR')],
        ['İş Paketi', wps.length],
        ['Ortalama İlerleme', `%${progressSummary?.actual_progress_pct ?? (wps.length ? Math.round(wps.reduce((s, w) => s + (w.progress || 0), 0) / wps.length) : 0)}`],
        ['Not', 'Haftalık/aylık export altyapısı hazır; detay sorguları rapor backendine bağlanabilir.'],
      ]
      if (type === 'pdf') {
        const { exportToPdf } = await import('../../../utils/exportUtils')
        exportToPdf(title, period, columns, rows, { projectName: project?.name || projectName })
      } else {
        const { exportToExcel } = await import('../../../utils/exportUtils')
        exportToExcel(title, period, columns, rows)
      }
      return
    }

    if (type === 'pdf') {
      exportGunlukRaporPdf(project, wps, ilerlemeData, personelData, opts)
    } else {
      exportGunlukRaporExcel(project, wps, ilerlemeData, personelData, opts)
    }
  }


  useEffect(() => {
    if (!projectId) return
    Promise.all([
      getProjects(),
      getWorkPackages(projectId),
      supabase.from('vw_project_progress_summary').select('*').eq('project_id', projectId).maybeSingle(),
    ]).then(([{ data: pData }, { data: wData }, summaryRes]) => {
      setProject(pData?.find(p => p.id === projectId) || null)
      setProgressSummary(summaryRes.data || null)

      const seen = new Set()
      const deduped = (wData || []).filter(w => {
        const key = (w.name || w.title || '').trim().toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setWPs(deduped)
      setLoading(false)
    })
  }, [projectId])

  return (
    <div>
      {/* Eylem çubuğu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap', rowGap: '0.5rem' }}>
        <button onClick={onBack} style={backBtn}>← Projelere Dön</button>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button onClick={() => setTab('genel')} style={tab === 'genel' ? tabBtnActive : tabBtn}>
            Genel Proje
          </button>
          <button onClick={() => setTab('gantt')} style={tab === 'gantt' ? tabBtnActive : tabBtn}>
            İş Planı
          </button>
          <button onClick={() => setTab('satin-alma')} style={tab === 'satin-alma' ? tabBtnActive : tabBtn}>
            Satın Alma
          </button>
          <button onClick={() => setTab('finans')} style={tab === 'finans' ? tabBtnActive : tabBtn}>
            Finans
          </button>
          <button onClick={() => setTab('tickets')} style={tab === 'tickets' ? tabBtnActive : tabBtn}>
            Ticket
          </button>
          <button onClick={() => setTab('raporlar')} style={tab === 'raporlar' ? tabBtnActive : tabBtn}>
            Raporlar
          </button>
          <button onClick={() => setTab('ekip')} style={tab === 'ekip' ? tabBtnActive : tabBtn}>
            Ekip
          </button>
        </div>

        {/* ── Sağ grup: Tarih Navigasyon + Dışa Aktar ── */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div ref={calendarRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCalendar(v => !v)} style={calendarBtn} title="Takvim">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
            <button onClick={navPrev} style={periodNavBtn}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', minWidth: 122, textAlign: 'center', padding: '0 2px', whiteSpace: 'nowrap' }}>
              {getPeriodLabel(filterDate, filterMode)}
            </span>
            <button onClick={navNext} style={periodNavBtn}>›</button>

            {showCalendar && (
              <div style={calendarPopover}>
                <div style={periodSegmentInCalendar}>
                  {PERIODS.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleFilter(p.key)}
                      style={filterMode === p.key ? periodSegmentActive : periodSegmentBtn}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div style={calendarHeader}>
                  <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} style={calendarNav}>↑</button>
                  <strong>{calendarMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</strong>
                  <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} style={calendarNav}>↓</button>
                </div>
                <div style={calendarWeekdays}>
                  {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'].map(day => <span key={day}>{day}</span>)}
                </div>
                <div style={calendarGrid}>
                  {calendarDays.map(day => {
                    const dayText = toDateStr(day)
                    const selected = dayText === filterDate
                    const inMonth = day.getMonth() === calendarMonth.getMonth()
                    return (
                      <button
                        key={dayText}
                        type="button"
                        onClick={() => selectCalendarDay(day)}
                        style={{
                          ...calendarDay,
                          ...(selected ? calendarDayActive : {}),
                          color: selected ? '#fff' : inMonth ? '#0f172a' : '#94a3b8',
                        }}
                      >
                        {day.getDate()}
                      </button>
                    )
                  })}
                </div>
                <div style={calendarFooter}>
                  <button type="button" onClick={() => setShowCalendar(false)} style={calendarLink}>Kapat</button>
                  <button type="button" onClick={jumpToday} style={calendarLink}>Bugün</button>
                </div>
              </div>
            )}
          </div>

          {/* Dışa Aktar — İş Planı sade görünümünde gizli */}
          {!['tickets', 'satin-alma', 'finans', 'gantt', 'raporlar'].includes(tab) && (
            <div ref={exportRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportMenu(v => !v)}
                disabled={!wps.length}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px',
                  background: '#fff',
                  color: !wps.length ? '#9ca3af' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 13, fontWeight: 500,
                  cursor: !wps.length ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  transition: 'background 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (wps.length) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Dışa Aktar
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {showExportMenu && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
                  background: '#fff', border: '1px solid var(--color-border)',
                  borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,.10)',
                  padding: '0.875rem', minWidth: 220,
                }}>
                  <div style={{ marginBottom: '0.625rem', padding: '6px 10px', background: '#FEF3C7', borderRadius: 6, fontSize: 11, color: '#92400E', fontWeight: 600 }}>
                    {getPeriodLabel(filterDate, filterMode)} raporu
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem' }}>
                    Rapor Seçenekleri
                  </p>
                  <div style={{ display: 'grid', gap: '0.35rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
                    {[
                      ['pdf', 'gunluk', 'Günlük PDF raporu'],
                      ['excel', 'gunluk', 'Günlük Excel raporu'],
                      ['pdf', 'haftalik', 'Haftalık PDF raporu'],
                      ['excel', 'haftalik', 'Haftalık Excel raporu'],
                      ['pdf', 'aylik', 'Aylık PDF raporu'],
                      ['excel', 'aylik', 'Aylık Excel raporu'],
                    ].filter(([, period]) => period === filterMode).map(([type, period, label]) => (
                      <button
                        key={`${period}-${type}`}
                        onClick={() => handleExport(type, period)}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: '#fff', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {tab === 'ekip' ? (
        <EkipListesi projectId={projectId} />
      ) : tab === 'tickets' ? (
        <TicketListesi projectId={projectId} filterDate={filterDate} />
      ) : tab === 'satin-alma' ? (
        <ProjeTabSatinAlma projectId={projectId} filterDate={filterDate} />
      ) : tab === 'finans' ? (
        <ProjeTabFinans projectId={projectId} filterDate={filterDate} />
      ) : tab === 'raporlar' ? (
        <DailyReportList projectId={projectId} title="Günlük Raporlar" showHeader={false} />
      ) : tab === 'genel' ? (
        <ProjectOverviewDashboard
          project={project}
          projectId={projectId}
          tasks={wps}
          filterDate={filterDate}
          reportPeriod={filterMode === 'haftalik' ? 'weekly' : filterMode === 'aylik' ? 'monthly' : 'daily'}
          onGoTab={setTab}
          progressSummary={progressSummary}
        />
      ) : (
        <TabIsPlan projectId={projectId} filterDate={filterDate} />
      )}
    </div>
  )
}
