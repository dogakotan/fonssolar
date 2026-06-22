import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { getProjects } from '../../../api'

const formatCurrency = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const STATUS_BADGE = {
  bekliyor:           { bg: '#FEF3C7', color: '#92400E', label: 'Bekliyor' },
  muhasebe_onayında:  { bg: '#EFF6FF', color: '#185FA5', label: 'Muhasebe Onayında' },
  yönetici_onayında:  { bg: '#F5F3FF', color: '#5B21B6', label: 'Yönetici Onayında' },
  onaylandı:          { bg: '#D1FAE5', color: '#065F46', label: 'Onaylandı' },
  reddedildi:         { bg: '#FEE2E2', color: '#991B1B', label: 'Reddedildi' },
}

const PAGE_SIZE = 10

function FaturaEkleModal({ onClose, onSaved, defaultProjectId }) {
  const [form, setForm] = useState({
    supplier_id: '', project_id: defaultProjectId || '', invoice_no: '', invoice_date: '',
    due_date: '', amount: '', vat_rate: '20', category: 'malzeme', description: '',
  })
  const [suppliers, setSuppliers] = useState([])
  const [projects,  setProjects]  = useState([])
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('suppliers').select('id, name').order('name'),
      getProjects(),
    ]).then(([sRes, pRes]) => {
      setSuppliers(sRes.data || [])
      setProjects(pRes.data || [])
    })
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    const { data: newInv, error } = await supabase.from('invoices').insert({
      supplier_id:  form.supplier_id  || null,
      project_id:   form.project_id   || null,
      invoice_no:   form.invoice_no,
      invoice_date: form.invoice_date,
      due_date:     form.due_date     || null,
      amount:       parseFloat(form.amount) || 0,
      vat_rate:     parseInt(form.vat_rate),
      category:     form.category,
      description:  form.description  || null,
      status:       'bekliyor',
      source:       'manual',
    }).select().single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    if (newInv) {
      await supabase.from('invoice_approvals').insert({
        invoice_id: newInv.id, step: 1, step_label: 'Muhasebe Onayı', status: 'bekliyor',
      })
    }
    onSaved()
    onClose()
  }

  const inp = {
    width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px',
    fontSize: 14, color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  }
  const lbl = { fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>Yeni Fatura Ekle</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Tedarikçi</label>
              <select style={inp} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                <option value="">Seçiniz</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Proje</label>
              <select style={inp} value={form.project_id} onChange={e => set('project_id', e.target.value)} disabled={!!defaultProjectId}>
                <option value="">Seçiniz</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Fatura No *</label>
            <input required style={inp} value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)} placeholder="FAT-2026-001" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Fatura Tarihi *</label>
              <input required type="date" style={inp} value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Vade Tarihi</label>
              <input type="date" style={inp} value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Tutar — KDV Hariç (₺) *</label>
              <input required type="number" style={inp} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" min="0" step="0.01" />
            </div>
            <div>
              <label style={lbl}>KDV Oranı</label>
              <select style={inp} value={form.vat_rate} onChange={e => set('vat_rate', e.target.value)}>
                <option value="8">%8</option>
                <option value="10">%10</option>
                <option value="18">%18</option>
                <option value="20">%20</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Kategori</label>
            <select style={inp} value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="malzeme">Malzeme</option>
              <option value="hizmet">Hizmet</option>
              <option value="nakliye">Nakliye</option>
              <option value="ekipman">Ekipman</option>
              <option value="diğer">Diğer</option>
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Açıklama</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 72 }} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              İptal
            </button>
            <button type="submit" disabled={saving} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjeTabFaturaListesi({ projectId }) {
  const [invoices,     setInvoices]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [page,         setPage]         = useState(0)
  const [filterStatus, setFilterStatus] = useState('hepsi')
  const [showAdd,      setShowAdd]      = useState(false)

  async function fetchInvoices() {
    setLoading(true)
    const { data, error } = await supabase
      .from('invoices')
      .select('*, suppliers(name)')
      .eq('project_id', projectId)
      .order('invoice_date', { ascending: false })
    if (error) console.error('invoices fetch error:', error)
    setInvoices(data || [])
    setLoading(false)
  }

  useEffect(() => { if (projectId) fetchInvoices() }, [projectId])

  const filtered   = filterStatus === 'hepsi' ? invoices : invoices.filter(i => i.status === filterStatus)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const TH = ['FATURA NO', 'TEDARİKÇİ', 'KATEGORİ', 'FATURA TARİHİ', 'VADE TARİHİ', "TUTAR (KDV'SİZ)", "TOPLAM (KDV'Lİ)", 'DURUM']

  return (
    <>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Faturalar</h3>
            <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 12 }}>
              {invoices.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(0) }}
              style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <option value="hepsi">Tüm Durumlar</option>
              <option value="bekliyor">Bekliyor</option>
              <option value="muhasebe_onayında">Muhasebe Onayında</option>
              <option value="yönetici_onayında">Yönetici Onayında</option>
              <option value="onaylandı">Onaylandı</option>
              <option value="reddedildi">Reddedildi</option>
            </select>
            <button
              onClick={() => setShowAdd(true)}
              style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              + Fatura Ekle
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <p style={{ color: '#6B7280', fontSize: 14 }}>Yükleniyor…</p>
          </div>
        ) : paged.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>Fatura bulunamadı.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  {TH.map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(inv => {
                  const b = STATUS_BADGE[inv.status] || { bg: '#F3F4F6', color: '#111827', label: inv.status }
                  return (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#111827', fontWeight: 500 }}>{inv.invoice_no || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#111827' }}>{inv.suppliers?.name || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280', textTransform: 'capitalize' }}>{inv.category || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280' }}>{formatDate(inv.invoice_date)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280' }}>{formatDate(inv.due_date)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#111827' }}>{formatCurrency(inv.amount)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#111827', fontWeight: 600 }}>{formatCurrency(inv.total_amount)}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ background: b.bg, color: b.color, fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>{b.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 24px', borderTop: '1px solid #E5E7EB' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#D1D5DB' : '#6B7280', fontFamily: 'inherit' }}
            >
              ‹ Önceki
            </button>
            <span style={{ fontSize: 13, color: '#6B7280' }}>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: page >= totalPages - 1 ? 'default' : 'pointer', color: page >= totalPages - 1 ? '#D1D5DB' : '#6B7280', fontFamily: 'inherit' }}
            >
              Sonraki ›
            </button>
          </div>
        )}
      </div>

      {showAdd && <FaturaEkleModal onClose={() => setShowAdd(false)} onSaved={fetchInvoices} defaultProjectId={projectId} />}
    </>
  )
}
