import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const URGENCY = {
  normal:    { bg: '#F3F4F6', color: '#374151', label: 'Normal' },
  acil:      { bg: '#FEF3C7', color: '#92400E', label: 'Acil' },
  'çok_acil': { bg: '#FEE2E2', color: '#991B1B', label: 'Çok Acil' },
}

const TH = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'
const fmt = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0)

function FaturaBaglaModal({ request, onClose, onLinked }) {
  const [invoices, setInvoices]             = useState([])
  const [selectedId, setSelectedId]         = useState('')
  const [loadingInv, setLoadingInv]         = useState(true)
  const [saving, setSaving]                 = useState(false)

  useEffect(() => {
    supabase
      .from('invoices')
      .select('id, invoice_no, amount, suppliers(name)')
      .order('invoice_date', { ascending: false })
      .then(({ data }) => { setInvoices(data || []); setLoadingInv(false) })
  }, [])

  async function handleLink() {
    setSaving(true)
    await supabase
      .from('purchase_requests')
      .update({
        status:     'fatura_kesildi',
        invoice_id: selectedId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)
    setSaving(false)
    onLinked()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>Fatura Bağla</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111827' }}>{request.title}</p>
            {request.projects?.name && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>{request.projects.name}</p>
            )}
          </div>

          {loadingInv ? (
            <p style={{ color: '#9CA3AF', fontSize: 13, margin: 0 }}>Faturalar yükleniyor…</p>
          ) : (
            <div>
              <label style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>
                Mevcut Fatura Seç (opsiyonel)
              </label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', color: '#374151' }}
              >
                <option value="">— Fatura seçmeden tamamla —</option>
                {invoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_no} — {inv.suppliers?.name || '?'} — {fmt(inv.amount)}
                  </option>
                ))}
              </select>
              {invoices.length === 0 && (
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: '6px 0 0' }}>
                  Sistemde fatura yok. Önce Faturalar sekmesinden ekleyin, veya boş bırakarak işaretleyin.
                </p>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            İptal
          </button>
          <button
            onClick={handleLink}
            disabled={saving}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {saving ? 'Kaydediliyor…' : 'Fatura Kesildi Olarak İşaretle'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FaturaKesilecekler() {
  const [requests, setRequests]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [linking, setLinking]             = useState(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_requests')
      .select('*, projects(name), purchase_request_items(unit_price, quantity, total_price)')
      .eq('status', 'onaylandı')
      .order('approved_at', { ascending: true })
    setRequests(data || [])
    setLoading(false)
  }

  const calcTotal = (items) =>
    items?.reduce((sum, i) => sum + (i.total_price ?? (i.quantity * (i.unit_price || 0))), 0) || 0

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Fatura Kesilecekler</h3>
        <span style={{ background: '#EFF6FF', color: '#185FA5', fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
          {requests.length} onaylı talep
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Yükleniyor…</div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#10B981', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
          Fatura kesilecek talep yok
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
              {['TALEP BAŞLIĞI', 'PROJİ', 'ACİLİYET', 'TOPLAM TUTAR', 'ONAY TARİHİ', 'İŞLEM'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.map(r => {
              const ub    = URGENCY[r.urgency] || URGENCY.normal
              const total = calcTotal(r.purchase_request_items)
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#111827' }}>{r.title}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>{r.projects?.name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: ub.bg, color: ub.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>{ub.label}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#185FA5' }}>{fmt(total)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>{fmtDate(r.approved_at)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => setLinking(r)}
                      style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Fatura Bağla
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {linking && (
        <FaturaBaglaModal
          request={linking}
          onClose={() => setLinking(null)}
          onLinked={() => { setLinking(null); fetchData() }}
        />
      )}
    </div>
  )
}
