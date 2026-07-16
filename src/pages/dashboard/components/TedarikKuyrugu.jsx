import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import Pager from '../../../components/ui/Pager'
import { normalizeStatus } from '../../../utils/satinAlma'

const PAGE_SIZE = 10
const DOC_BUCKET = 'ticket-ekleri'

const TH = { height: 26, boxSizing: 'border-box', padding: '0 12px', lineHeight: '26px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const TD = { height: 44, boxSizing: 'border-box', padding: '0 12px', fontSize: 12.5, color: 'var(--color-text-sub)', verticalAlign: 'middle' }
const inp = { width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }
const lbl = { fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }

const fmtDate = (date) => date ? new Date(date).toLocaleDateString('tr-TR') : '—'

function requestNo(request) {
  if (request.request_no || request.code) return request.request_no || request.code
  const year = request.created_at ? new Date(request.created_at).getFullYear() : new Date().getFullYear()
  const suffix = String(request.id || '').replace(/-/g, '').slice(-3).toUpperCase() || '001'
  return `SAT-${year}-${suffix}`
}

function requestTitle(request) {
  return request.title || request.material_name || request.description || 'Satın alma talebi'
}

function requesterName(request) {
  return request.profiles?.full_name || '—'
}

function toUserMessage(error) {
  const m = (error?.message || '').toLocaleLowerCase('tr-TR')
  if (m.includes('row-level security') || m.includes('permission')) return 'Bu işlem için yetkiniz yok.'
  return error?.message || 'Kaydedilemedi. Lütfen tekrar deneyin.'
}

function TedarikBilgisiModal({ request, onClose, onSaved }) {
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({
    supplier_id: request.supplier_id || '',
    purchase_date: request.purchase_date || new Date().toISOString().split('T')[0],
    delivery_date: request.delivery_date || '',
    received_by_name: request.received_by_name || '',
    approval_note: '',
  })

  useEffect(() => {
    supabase.from('suppliers').select('id, name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return
    setSavingSupplier(true)
    setErr('')
    const { data, error } = await supabase.from('suppliers').insert({ name: newSupplierName.trim() }).select('id, name').single()
    setSavingSupplier(false)
    if (error) { setErr(toUserMessage(error)); return }
    setSuppliers(list => [...list, data].sort((a, b) => a.name.localeCompare(b.name, 'tr-TR')))
    set('supplier_id', data.id)
    setNewSupplierName('')
    setShowNewSupplier(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.supplier_id || !form.purchase_date) return
    setSaving(true)
    setErr('')

    let delivery_document_url = request.delivery_document_url || null
    if (file) {
      setUploading(true)
      const path = `tedarik/${request.id}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from(DOC_BUCKET).upload(path, file)
      setUploading(false)
      if (uploadErr) { setErr(toUserMessage(uploadErr)); setSaving(false); return }
      delivery_document_url = path
    }

    const payload = {
      supplier_id: form.supplier_id,
      purchase_date: form.purchase_date,
      delivery_date: form.delivery_date || null,
      received_by_name: form.received_by_name.trim() || null,
      delivery_document_url,
      purchased_by: user.id,
    }
    if (form.approval_note.trim()) payload.approval_note = form.approval_note.trim()

    const { error } = await supabase
      .from('purchase_requests')
      .update(payload)
      .eq('id', request.id)
      .eq('project_id', request.project_id)

    setSaving(false)
    if (error) { setErr(toUserMessage(error)); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>Tedarik Bilgisi</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748B' }}>
          {requestTitle(request)} için tedarikçi ve satın alma bilgisini girin. Tedarikçi + satın alma tarihi kaydedilince talep otomatik "Satın Alındı" durumuna geçer.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Tedarikçi *</label>
            {!showNewSupplier ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <select required style={inp} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                  <option value="">Seçiniz</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewSupplier(true)}
                  style={{ background: '#EFF6FF', color: '#185FA5', border: 'none', borderRadius: 8, padding: '0 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  + Yeni
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inp} value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} placeholder="Tedarikçi adı" autoFocus />
                <button type="button" disabled={savingSupplier} onClick={handleAddSupplier}
                  style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: savingSupplier ? 0.7 : 1 }}>
                  {savingSupplier ? '…' : 'Ekle'}
                </button>
                <button type="button" onClick={() => { setShowNewSupplier(false); setNewSupplierName('') }}
                  style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 12px', fontSize: 12.5, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Vazgeç
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Satın Alma Tarihi *</label>
              <input required type="date" style={inp} value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Teslimat Tarihi</label>
              <input type="date" style={inp} value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Teslim Alan</label>
            <input style={inp} value={form.received_by_name} onChange={e => set('received_by_name', e.target.value)} placeholder="Sahada teslim alan kişi" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Teslimat Belgesi</label>
            <input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13, fontFamily: 'inherit' }} />
            {request.delivery_document_url && !file && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#6B7280' }}>Mevcut bir belge zaten yüklü — yeni dosya seçmezseniz korunur.</p>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Not</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 50 }} value={form.approval_note} onChange={e => set('approval_note', e.target.value)} placeholder="Opsiyonel" />
          </div>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              İptal
            </button>
            <button type="submit" disabled={saving || uploading} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (saving || uploading) ? 0.7 : 1 }}>
              {uploading ? 'Belge yükleniyor…' : saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TedarikKuyrugu({ projectId }) {
  const [tab, setTab] = useState('bekleyen')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(0)

  useEffect(() => { if (projectId) fetchData() }, [projectId])
  useEffect(() => { setPage(0) }, [tab, projectId])

  async function fetchData() {
    setLoading(true)
    setErrorMessage('')
    const { data, error } = await supabase
      .from('purchase_requests')
      .select('*, suppliers(name)')
      .eq('project_id', projectId)
      .in('status', ['onaylandi', 'satin_alindi'])
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('purchase_requests load error:', error)
      setErrorMessage('Talepler yüklenemedi.')
      setRequests([])
      setLoading(false)
      return
    }

    const rows = data || []
    const requestedByIds = [...new Set(rows.map(row => row.requested_by).filter(Boolean))]
    if (requestedByIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', requestedByIds)
      const profileById = new Map((profiles || []).map(p => [p.id, p]))
      setRequests(rows.map(row => ({ ...row, profiles: profileById.get(row.requested_by) || null })))
    } else {
      setRequests(rows)
    }
    setLoading(false)
  }

  if (!projectId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14, background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12 }}>
        Lütfen üstteki proje seçiciden bir proje seçin.
      </div>
    )
  }

  const filtered = requests.filter(r => normalizeStatus(r.status) === (tab === 'bekleyen' ? 'onaylandi' : 'satin_alindi'))
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const TABS = [
    { key: 'bekleyen', label: 'Tedarik Bekleyenler', count: requests.filter(r => normalizeStatus(r.status) === 'onaylandi').length },
    { key: 'tamamlanan', label: 'Tamamlanan', count: requests.filter(r => normalizeStatus(r.status) === 'satin_alindi').length },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--color-border-md)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', padding: '10px 22px',
            fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
            color: tab === t.key ? 'var(--color-primary)' : 'var(--color-muted)',
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t.label} <span style={{ marginLeft: 4, fontSize: 11.5, opacity: 0.75 }}>({t.count})</span>
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
        {errorMessage && (
          <div style={{ padding: '10px 20px', background: '#FEF2F2', color: '#991B1B', fontSize: 13, borderBottom: '1px solid #FECACA' }}>
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
            {tab === 'bekleyen' ? 'Tedarik bekleyen talep yok.' : 'Henüz tamamlanmış tedarik yok.'}
          </div>
        ) : (
          <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  {['TALEP NO', 'TALEP / MALZEME', 'OLUŞTURAN', 'TARİH', ...(tab === 'tamamlanan' ? ['TEDARİKÇİ', 'SATIN ALMA TARİHİ'] : []), 'İŞLEM'].map(h => (
                    <th key={h} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(request => (
                  <tr key={request.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ ...TD, color: 'var(--color-primary)', fontWeight: 700 }}>{requestNo(request)}</td>
                    <td style={{ ...TD, fontWeight: 700, color: 'var(--color-text)', minWidth: 180 }}>{requestTitle(request)}</td>
                    <td style={TD}>{requesterName(request)}</td>
                    <td style={TD}>{fmtDate(request.created_at)}</td>
                    {tab === 'tamamlanan' && (
                      <>
                        <td style={TD}>{request.suppliers?.name || '—'}</td>
                        <td style={TD}>{fmtDate(request.purchase_date)}</td>
                      </>
                    )}
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      <button onClick={() => setSelected(request)} style={{
                        background: tab === 'bekleyen' ? '#185FA5' : '#EFF6FF',
                        color: tab === 'bekleyen' ? '#fff' : '#185FA5',
                        border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        {tab === 'bekleyen' ? 'Tedarik Bilgisi Gir' : 'Düzenle'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '4px 14px 12px' }}>
            <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
          </>
        )}
      </div>

      {selected && (
        <TedarikBilgisiModal
          request={selected}
          onClose={() => setSelected(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  )
}
