import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { toUserMessage } from '../../utils/errors'
import { TONE, INVOICE_STATUS } from '../ui/StatusBadge'
import OnayReddetActions from './OnayReddetActions'
import FaturaFormModal from './FaturaFormModal'
import OdemeEkleModal, { formatPaymentCurrency, PAYMENT_METHOD_LABELS, paymentErrorMessage } from './OdemeEkleModal'

const formatCurrency = (amount, currency = 'TRY') =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0)

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

function statusMeta(status) {
  const entry = INVOICE_STATUS[status] || { label: status || '—', tone: 'muted' }
  const tone = TONE[entry.tone] || TONE.muted
  return { bg: tone.bg, color: tone.text, label: entry.label }
}

const sectionLabel = {
  fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase',
  letterSpacing: '0.5px', margin: '0 0 12px',
}
const infoLabel = { fontSize: 10.5, color: 'var(--color-muted-light)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.3px' }
const infoValue = { fontSize: 13, fontWeight: 500, color: 'var(--color-text)', margin: 0 }
const card = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px' }

function OdemeIptalModal({ payment, userId, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleCancel() {
    if (!reason.trim()) return
    setSaving(true)
    setErr('')
    const { error } = await supabase.from('invoice_payments').update({
      is_cancelled: true, cancelled_at: new Date().toISOString(),
      cancelled_by: userId, cancel_reason: reason.trim(),
    }).eq('id', payment.id).eq('is_cancelled', false)
    setSaving(false)
    if (error) { setErr(paymentErrorMessage(error)); return }
    await onSaved()
    onClose()
  }

  return (
    <div className="payment-modal-backdrop">
      <div className="payment-modal" role="dialog" aria-modal="true">
        <h3 style={{ margin: '0 0 8px' }}>Ödemeyi İptal Et</h3>
        <p style={{ color: 'var(--color-muted)', fontSize: 12.5 }}>Kayıt silinmeyecek; iptal sebebiyle birlikte geçmişte görünmeye devam edecek.</p>
        <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="İptal sebebi *" style={{ width: '100%', minHeight: 90, border: '1px solid var(--color-border-md)', borderRadius: 8, padding: 10, fontFamily: 'inherit' }} />
        {err && <p style={{ color: '#DC2626', fontSize: 12.5 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="payment-secondary-btn" onClick={onClose}>Vazgeç</button>
          <button className="payment-primary-btn" style={{ background: '#DC2626' }} disabled={saving || !reason.trim()} onClick={handleCancel}>{saving ? 'İptal ediliyor…' : 'İptal Et'}</button>
        </div>
      </div>
    </div>
  )
}

// Fatura Detayı — tek adımlı onay süreci (Yönetici), Satın Alma Kontrolü,
// Bağlı Talebin Kalemleri, rol+statü bazlı aksiyonlar. Reddedilen fatura
// artık nihai (kurtarma yok) — yalnızca düzeltme_bekliyor akışı düzenlenip
// yeniden gönderilebilir.
export default function FaturaDetayModal({ invoice, onClose, onChanged }) {
  const { isAdmin, isMuhasebe, role, user } = useAuth()
  const canApprove = isAdmin || role === 'proje_yoneticisi'
  const [linkedRequest, setLinkedRequest] = useState(null)
  const [requestItems, setRequestItems] = useState([])
  const [projectName, setProjectName] = useState(invoice?.projects?.name || null)
  const [creatorName, setCreatorName] = useState(invoice?.creator?.full_name || null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelErr, setCancelErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [showOdemeGir, setShowOdemeGir] = useState(false)
  const [payments, setPayments] = useState([])
  const [currentInvoice, setCurrentInvoice] = useState(invoice)
  const [cancelPayment, setCancelPayment] = useState(null)

  async function fetchPaymentData() {
    if (!invoice?.id) return
    const [invoiceResult, paymentResult] = await Promise.all([
      supabase.from('invoices').select('*, suppliers(name), projects(name), purchase_requests!invoices_purchase_request_id_fkey(title)').eq('id', invoice.id).maybeSingle(),
      supabase.from('invoice_payments').select('*, creator:profiles!invoice_payments_created_by_fkey(full_name)').eq('invoice_id', invoice.id).order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
    ])
    if (invoiceResult.data) setCurrentInvoice(invoiceResult.data)
    if (paymentResult.data) setPayments(paymentResult.data)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPaymentData() }, [invoice?.id])

  useEffect(() => {
    if (!invoice?.project_id || invoice?.projects?.name) return
    supabase.from('projects').select('name').eq('id', invoice.project_id).maybeSingle()
      .then(({ data }) => setProjectName(data?.name || null))
  }, [invoice])

  useEffect(() => {
    // get_invoices_list zaten 'creator' alanını gömüyor (bkz. RPC); bu yalnızca
    // bildirimlerden deep-link ile açılan (RPC'siz, doğrudan tablo select'i
    // kullanan) durum için bir fallback — profiles RLS (admin OR auth.uid()=id)
    // gereği yalnızca admin/kendi faturasını görüntüleyen kullanıcı için çalışır.
    if (invoice?.creator?.full_name || !invoice?.created_by) return
    supabase.from('profiles').select('full_name').eq('id', invoice.created_by).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setCreatorName(data.full_name) })
  }, [invoice])

  useEffect(() => {
    if (!invoice?.purchase_request_id) { setLinkedRequest(null); setRequestItems([]); return }
    supabase
      .from('purchase_requests')
      .select('id, title, estimated_amount_incl_vat, project_id')
      .eq('id', invoice.purchase_request_id)
      .maybeSingle()
      .then(({ data }) => setLinkedRequest(data || null))
    supabase
      .from('purchase_request_items')
      .select('id, name, quantity, unit, unit_price, total_price')
      .eq('request_id', invoice.purchase_request_id)
      .then(({ data }) => setRequestItems(data || []))
  }, [invoice])

  if (!invoice) return null

  const effectiveInvoice = currentInvoice || invoice
  const st = statusMeta(effectiveInvoice.status)
  // İptal Et: yönetici onayından geçmiş (onaylandı/odeme_bekliyor) bir faturayı
  // yalnızca admin geri alabilir — çoğu onaylı fatura artık odeme_bekliyor'da
  // bekliyor (ödeme takipsiz olanlar doğrudan onaylandı'da kapanıyor).
  const canCancel = isAdmin && (invoice.status === 'onaylandı' || invoice.status === 'odeme_bekliyor')
  const canApproveHere = canApprove && invoice.status === 'yönetici_onayında'
  const canEditDuzeltme = isMuhasebe && invoice.status === 'duzeltme_bekliyor'
  const paymentStage = ['odeme_bekliyor', 'kismen_odendi', 'ödendi'].includes(effectiveInvoice.status)
  const canGirOdeme = (isMuhasebe || isAdmin) && ['odeme_bekliyor', 'kismen_odendi'].includes(effectiveInvoice.status)
  const activePayments = payments.filter(payment => !payment.is_cancelled)
  const lastPaymentDate = activePayments[0]?.payment_date
  const total = Number(effectiveInvoice.total_amount) || 0
  const paid = Number(effectiveInvoice.paid_amount) || 0
  const progress = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0

  async function handleCancel() {
    setCancelSaving(true)
    setCancelErr('')
    const { error } = await supabase.from('invoices').update({ status: 'reddedildi' }).eq('id', invoice.id)
    setCancelSaving(false)
    if (error) { setCancelErr(toUserMessage(error)); return }
    onChanged?.()
    onClose()
  }

  if (editing) {
    return (
      <FaturaFormModal
        invoice={invoice}
        onClose={() => setEditing(false)}
        onSaved={() => { onChanged?.(); onClose() }}
      />
    )
  }

  return (
    <div className="invoice-detail-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div className="invoice-detail-modal" style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 32, width: 760, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="invoice-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--color-muted-light)' }}>
              Faturalar / <span style={{ color: 'var(--color-text-sub)', fontWeight: 600 }}>{invoice.invoice_no || '—'}</span>
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{invoice.invoice_no || '—'}</h3>
              <span style={{ background: st.bg, color: st.color, fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>{st.label}</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--color-muted-light)' }}>
              {creatorName
                ? `${formatDate(invoice.invoice_date)} tarihinde ${creatorName} tarafından oluşturuldu`
                : `${formatDate(invoice.invoice_date)} tarihinde oluşturuldu`}
            </p>
          </div>
          <div className="invoice-detail-header-actions">
            {(canEditDuzeltme || (isMuhasebe && invoice.status === 'taslak')) && (
              <button className="invoice-detail-edit" onClick={() => setEditing(true)}>Düzenle</button>
            )}
            <button className="invoice-detail-close" onClick={onClose} aria-label="Kapat">✕</button>
          </div>
        </div>

        {/* Üst kartlar */}
        <div className="invoice-detail-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 22 }}>
          {[
            ['⚙', 'Genel Toplam', formatCurrency(invoice.total_amount, invoice.currency)],
            ['📄', 'KDV Hariç', formatCurrency(invoice.amount, invoice.currency)],
            ['📅', 'Vade Tarihi', formatDate(invoice.due_date)],
            ['📎', 'Bağlı Talep', linkedRequest?.title || '—'],
          ].map(([icon, k, v]) => (
            <div className="invoice-detail-kpi" key={k} style={card}>
              <p style={{ ...infoLabel, display: 'flex', alignItems: 'center', gap: 5 }}><span>{icon}</span>{k}</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</p>
            </div>
          ))}
        </div>

        <div className={`invoice-detail-grid${linkedRequest ? '' : ' invoice-detail-grid-single'}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Sol sütun: Fatura Bilgileri + Kalemler */}
          <div className="invoice-detail-column invoice-detail-column-main">
            <p style={sectionLabel}>Fatura Bilgileri</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                ['Tedarikçi', invoice.suppliers?.name || '—'],
                ['Proje', projectName || '—'],
                ['Fatura Türü', invoice.category || '—'],
                ['Fatura Tarihi', formatDate(invoice.invoice_date)],
                ['KDV Oranı', `%${invoice.vat_rate || 0}`],
                ['KDV Tutarı', formatCurrency(invoice.vat_amount, invoice.currency)],
              ].map(([k, v]) => (
                <div key={k}>
                  <p style={infoLabel}>{k}</p>
                  <p style={{ ...infoValue, textTransform: k === 'Fatura Türü' ? 'capitalize' : 'none' }}>{v}</p>
                </div>
              ))}
            </div>
            {invoice.description && (
              <div style={{ ...card, marginBottom: 16 }}>
                <p style={infoLabel}>Açıklama</p>
                <p style={{ ...infoValue, fontWeight: 400 }}>{invoice.description}</p>
              </div>
            )}

            {requestItems.length > 0 && (
              <div>
                <p style={sectionLabel}>Bağlı Talebin Kalemleri</p>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)' }}>
                        {['Kalem', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Kalem' ? 'left' : 'right', fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {requestItems.map(item => (
                        <tr key={item.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--color-text)' }}>{item.name}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-sub)' }}>{item.quantity}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-sub)' }}>{item.unit || '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-sub)' }}>{formatCurrency(item.unit_price)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text)', fontWeight: 600 }}>{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Sağ sütun: Satın Alma Kontrolü (yalnızca bağlı bir talep varsa render edilir) */}
          {linkedRequest && (
          <div className="invoice-detail-column invoice-detail-column-side">
              <div style={{ marginBottom: 20 }}>
                <p style={sectionLabel}>Satın Alma Kontrolü</p>
                {(() => {
                  const projectOk = linkedRequest.project_id === invoice.project_id
                  const estimate = Number(linkedRequest.estimated_amount_incl_vat) || 0
                  // linkedRequest her zaman TRY (satın alma talebinde para birimi seçimi yok) —
                  // fatura USD/EUR olabileceğinden karşılaştırma total_amount_try (TRY karşılığı) ile yapılır.
                  const total = Number(invoice.total_amount_try ?? invoice.total_amount) || 0
                  const withinTolerance = estimate === 0 || total <= estimate * 1.1
                  const checkRow = (ok, okText, badText) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: ok ? 'var(--color-success-text)' : 'var(--color-warning-text)' }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, background: ok ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                      }}>{ok ? '✓' : '⚠'}</span>
                      {ok ? okText : badText}
                    </div>
                  )
                  return (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {checkRow(true, 'Tedarikçi eşleşti', '')}
                      {checkRow(projectOk, 'Proje eşleşti', 'Proje eşleşmiyor')}
                      {checkRow(withinTolerance, 'Tutar talep sınırında', `Tutar tahminin ${formatCurrency(total - estimate)} üzerinde`)}
                      <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 12.5, color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', marginTop: 2 }}>
                        Satın alma talebini görüntüle →
                      </a>
                    </div>
                  )
                })()}
              </div>
          </div>
          )}
        </div>

        {paymentStage && (
          <section className="invoice-detail-payment" style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--color-border-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <p style={{ ...sectionLabel, margin: 0 }}>Ödeme Bilgileri</p>
              {canGirOdeme && <button className="payment-primary-btn" onClick={() => setShowOdemeGir(true)}>+ Ödeme Ekle</button>}
            </div>
            <div className="payment-detail-summary">
              <div><small>Fatura Toplamı</small><b>{formatPaymentCurrency(total, effectiveInvoice.currency)}</b></div>
              <div><small>Ödenen Toplam</small><b>{formatPaymentCurrency(paid, effectiveInvoice.currency)}</b></div>
              <div><small>Kalan Tutar</small><b>{formatPaymentCurrency(effectiveInvoice.remaining_amount, effectiveInvoice.currency)}</b></div>
              <div><small>Vade Tarihi</small><b>{formatDate(effectiveInvoice.due_date)}</b></div>
              <div><small>Son Ödeme</small><b>{formatDate(lastPaymentDate)}</b></div>
              <div><small>Durum</small><b>{statusMeta(effectiveInvoice.status).label}</b></div>
            </div>
            <div style={{ margin: '10px 0 14px' }}>
              <div style={{ height: 9, borderRadius: 20, background: 'var(--color-border)', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? '#16A34A' : 'var(--color-primary)', borderRadius: 20 }} /></div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-sub)' }}>%{progress.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ödendi — {formatPaymentCurrency(paid, effectiveInvoice.currency)} / {formatPaymentCurrency(total, effectiveInvoice.currency)}</p>
            </div>
            {payments.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-muted)' }}>Henüz ödeme kaydı yok.</p>
            ) : (
              <div className="payment-history-wrap">
                <table className="payment-history-table">
                  <thead><tr><th>Tarih</th><th>Ödenen Tutar</th><th>Yöntem</th><th>Referans No</th><th>Ekleyen</th><th /></tr></thead>
                  <tbody>
                    {payments.map(payment => (
                      <tr key={payment.id} className={payment.is_cancelled ? 'cancelled' : ''}>
                        <td>{formatDate(payment.payment_date)}</td>
                        <td>{formatPaymentCurrency(payment.amount, payment.currency)}</td>
                        <td>{PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method || '—'}</td>
                        <td>{payment.reference_no || '—'}</td>
                        <td>{payment.creator?.full_name || '—'}</td>
                        <td>{payment.is_cancelled
                          ? <small>İptal edildi — {payment.cancel_reason}</small>
                          : (isAdmin || isMuhasebe) && <button className="payment-link-btn danger" onClick={() => setCancelPayment(payment)}>İptal Et</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan="6">Toplam ödenen: <b>{formatPaymentCurrency(paid, effectiveInvoice.currency)}</b> — Kalan: <b>{formatPaymentCurrency(effectiveInvoice.remaining_amount, effectiveInvoice.currency)}</b></td></tr></tfoot>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Aksiyonlar */}
        {canApproveHere && (
          <div className="invoice-detail-approval-actions" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--color-border-md)' }}>
            <OnayReddetActions invoiceId={invoice.id} layout="full" onDone={() => { onChanged?.(); onClose() }} />
          </div>
        )}

        {canEditDuzeltme && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--color-border-md)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--color-text-sub)', background: 'var(--color-bg)', borderRadius: 8, padding: '9px 12px' }}>
              Yönetici bu faturada düzeltme istedi. Düzenleyip tekrar gönderebilirsiniz.
            </p>
            <button onClick={() => setEditing(true)} style={{ background: 'var(--color-primary)', color: '#fff', border: 0, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Düzenle
            </button>
          </div>
        )}

        {canCancel && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--color-border-md)' }}>
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Faturayı İptal Et
              </button>
            ) : (
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)', borderRadius: 8, padding: '8px 12px' }}>
                  ⚠ Bu fatura onaylanmış. İptal edilirse maliyet kaydı geri alınır ve fatura reddedildi durumuna döner.
                </p>
                {cancelErr && <p style={{ color: 'var(--color-danger-text)', fontSize: 13, marginBottom: 10 }}>{cancelErr}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowCancelConfirm(false)} style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Vazgeç
                  </button>
                  <button onClick={handleCancel} disabled={cancelSaving} style={{ background: 'var(--color-danger-text)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: cancelSaving ? 0.7 : 1 }}>
                    {cancelSaving ? 'İptal ediliyor…' : 'Evet, İptal Et'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showOdemeGir && (
        <OdemeEkleModal invoice={effectiveInvoice} onClose={() => setShowOdemeGir(false)} onSaved={async () => { await fetchPaymentData(); onChanged?.() }} />
      )}
      {cancelPayment && <OdemeIptalModal payment={cancelPayment} userId={user?.id} onClose={() => setCancelPayment(null)} onSaved={async () => { await fetchPaymentData(); onChanged?.() }} />}
    </div>
  )
}
