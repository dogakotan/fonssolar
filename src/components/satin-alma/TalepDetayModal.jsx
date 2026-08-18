import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { riskBreakdownForItems, normalizeStatus, isAwaitingInvoice } from '../../utils/satinAlma'
import { requestNo } from '../../utils/purchaseRequestNo'
import FaturaOlusturModal from './FaturaOlusturModal'

const fmtQty = (value) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })

const fmtDate = (date) =>
  date ? new Date(date).toLocaleDateString('tr-TR') : '-'

const CARD = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14, minWidth: 0 }
const TITLE = { margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#0F172A' }
const LABEL = { margin: 0, fontSize: 11, color: '#64748B' }
const VALUE = { margin: '3px 0 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }

function requestType(req, items) {
  if (req.category === 'malzeme') return 'Malzeme'
  if (req.category === 'hizmet') return 'Hizmet'
  if (req.category === 'diger') return 'Diğer'
  const text = `${req.title || ''} ${(items || []).map(item => item.name).join(' ')}`.toLocaleLowerCase('tr-TR')
  return /hizmet|işçilik|iscilik|kiralama|nakliye/.test(text) ? 'Hizmet' : 'Malzeme'
}

function Step({ done, active, cancelled = false, label, last = false }) {
  const color = cancelled ? '#EF4444' : done ? '#22C55E' : active ? '#F59E0B' : '#CBD5E1'
  const ring = cancelled ? '#FEE2E2' : done ? '#DCFCE7' : active ? '#FEF3C7' : '#F1F5F9'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 8, position: 'relative' }}>
      {!last && <span style={{ position: 'absolute', left: 5, top: 16, bottom: -10, width: 1, background: '#E5E7EB' }} />}
      <span style={{ position: 'relative', zIndex: 1, width: 10, height: 10, borderRadius: '50%', background: color, marginTop: 4, boxShadow: `0 0 0 4px ${ring}` }} />
      <div>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: cancelled || done || active ? '#0F172A' : '#94A3B8' }}>{label}</p>
      </div>
    </div>
  )
}

const emptyMap = new Map()
export default function TalepDetayModal({ request, talepId, materialPlan = emptyMap, requestedTotals = emptyMap, siteChiefView = false, onClose }) {
  const { isAdmin, isMuhasebe, role, user } = useAuth()
  const [data, setData] = useState(request || null)
  const [items, setItems] = useState(request?.items || [])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showFaturaModal, setShowFaturaModal] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [suppliers, setSuppliers] = useState([])

  useEffect(() => {
    async function load() {
      const id = request?.id || talepId
      if (!id) return
      const { data, error } = await supabase.rpc('get_purchase_request_detail', { p_id: id })
      const req = data?.authorized ? data.request : null

      if (!error && req) {
        setData({ ...request, ...req })
        setItems(req.items || request?.items || [])
      }
    }
    load()
  }, [request, talepId])

  const req = data || request || {}
  const status = normalizeStatus(req.status)
  const canReview = isAdmin && status === 'bekliyor'
  const canComplete = role === 'proje_yoneticisi' && status === 'onaylandi'
  const canAct = canReview || canComplete

  useEffect(() => {
    if (!canComplete) return
    supabase.from('suppliers').select('id, name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [canComplete])
  const breakdown = riskBreakdownForItems(items, materialPlan, requestedTotals)
  const description = req.description || req.request_note || req.notes || '-'
  const requester = req.requester_name || req.requested_by_name || req.created_by_name || '—'
  const type = requestType(req, items)
  // fatura_onay_bekliyor'da fatura zaten oluşturulmuş (yalnızca yönetici onayı
  // bekleniyor) — "Fatura Bekleniyor" adımını hâlâ aktif göstermek yanlış,
  // o adım tamamlanmış sayılır ve son adım ("Fatura Kesildi") aktif olur.
  const invoiceCreated = ['fatura_onay_bekliyor', 'faturasi_kesildi'].includes(status)
  const invoiceDone = status === 'faturasi_kesildi'
  const invoiceActive = ['satin_alindi', 'fatura_bekliyor'].includes(status)
  // 'iptal' yalnızca proje yöneticisinin tedarik adımındaki "İptal Et"iyle
  // 'onaylandi'dan geçilir — o noktaya ulaşan bir talep yönetici onayını zaten
  // almış demektir, bu yüzden approvalDone'a da dahil (onay adımı kırmızı değil
  // yeşil kalmalı, iptal edilen adım tedarik adımıdır).
  const approvalDone = ['onaylandi', 'satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi', 'iptal'].includes(status)
  const procurementActive = status === 'onaylandi'
  const procurementDone = ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi'].includes(status)
  const isRejected = status === 'red_edildi'
  const isProcurementCancelled = status === 'iptal'
  const isCancelled = isRejected || isProcurementCancelled
  const siteChiefProcessing = status === 'onaylandi'
  const siteChiefComplete = ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor', 'faturasi_kesildi'].includes(status)
  const canInvoice = (isAdmin || isMuhasebe) && isAwaitingInvoice(req)

  async function updateStatus(nextStatus, supplierIdArg) {
    setSaving(true)
    setErrorMessage('')

    if (nextStatus === 'satin_alindi') {
      const { error } = await supabase.rpc('complete_project_manager_purchase_request', {
        p_request_id: req.id,
        p_supplier_id: supplierIdArg || null,
      })
      setSaving(false)
      if (error) {
        console.error('project manager purchase completion error:', error)
        setErrorMessage(error.message || 'Talep tamamlanamadı.')
        return
      }
      onClose()
      return
    }

    const payload = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    }
    if (canReview) {
      payload.approved_by = user?.id || null
      payload.approved_at = new Date().toISOString()
    }
    const combinedNote = [req.notes, note].filter(Boolean).join('\n')
    if (combinedNote) payload.notes = combinedNote

    // canReview yalnızca normalize edilmiş status==='bekliyor' iken true olur, ki bu
    // gerçek DB değeri talep_olusturuldu/fiyat_girildi/onay_bekliyor'dan biri anlamına
    // gelir (bkz. utils/satinAlma.js normalizeStatus) — 'bekliyor' DB'de asla yazılmaz
    // (purchase_requests_status_check bunu reddeder), bu yüzden ham req.status'u
    // iyimser-kilit ön-koşulu olarak kullanıyoruz.
    const expectedStatus = canReview ? req.status : 'onaylandi'
    const { data: updatedRequest, error } = await supabase
      .from('purchase_requests')
      .update(payload)
      .eq('id', req.id)
      .eq('status', expectedStatus)
      .select('id')
      .maybeSingle()
    setSaving(false)
    if (error || !updatedRequest) {
      console.error('purchase request update error:', error)
      setErrorMessage(error?.message || 'Talep artık bu işlem için uygun değil. Listeyi yenileyip tekrar deneyin.')
      return
    }
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-request-dialog-title"
        style={{ width: 'min(680px, calc(100vw - 36px))', background: '#F8FAFC', borderRadius: 12, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)', overflow: 'hidden' }}
      >
        <header style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="purchase-request-dialog-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Satın Alma Talebi</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{requestNo(req)} · {req.title || req.material_name || 'Satın alma talebi'}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#64748B', fontSize: 24, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </header>

        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          {errorMessage && <div style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>{errorMessage}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <section style={CARD}>
              <h3 style={TITLE}>Talep Bilgileri</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={LABEL}>Talep / Malzeme</p>
                  <p style={{ ...VALUE, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{req.title || req.material_name || '-'}</p>
                </div>
                <div><p style={LABEL}>Talep Türü</p><p style={VALUE}>{type}</p></div>
                <div><p style={LABEL}>Talep Tarihi</p><p style={VALUE}>{fmtDate(req.request_date || req.created_at)}</p></div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={LABEL}>Oluşturan</p>
                  <p style={{ ...VALUE, lineHeight: 1.35 }}>{requester}</p>
                </div>
              </div>
            </section>

            <section style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
              <h3 style={TITLE}>{siteChiefView ? 'İşlem Süreci' : 'Onay Süreci'}</h3>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-evenly', gap: 10 }}>
                {siteChiefView ? (
                  <>
                    <Step done label="Talep Oluşturuldu" />
                    <Step
                      active={siteChiefProcessing}
                      done={siteChiefProcessing || siteChiefComplete}
                      cancelled={isCancelled}
                      label={isCancelled ? 'İşlem İptal Edildi' : 'İşleme Alındı'}
                    />
                    <Step done={siteChiefComplete} label="İşlem Tamamlandı" last />
                  </>
                ) : (
                  <>
                <Step
                  done
                  label="Talep Oluşturuldu"
                />
                <Step
                  active={status === 'bekliyor'}
                  done={approvalDone}
                  cancelled={isRejected}
                  label={isRejected ? 'Yönetici Onayı Reddedildi' : approvalDone ? 'Yönetici Onayı Alındı' : 'Yönetici Onayı Bekliyor'}
                />
                <Step
                  active={procurementActive}
                  done={procurementDone}
                  cancelled={isProcurementCancelled}
                  label={isProcurementCancelled ? 'Tedarik İptal Edildi' : 'Proje Yöneticisinde'}
                />
                <Step
                  active={invoiceActive}
                  done={invoiceCreated}
                  label="Fatura Bekleniyor"
                />
                <Step
                  active={status === 'fatura_onay_bekliyor'}
                  done={invoiceDone}
                  label="Fatura Kesildi"
                  last
                />
                  </>
                )}
              </div>
            </section>
          </div>

          {type === 'Malzeme' && !isMuhasebe && (
          <section style={CARD}>
            <h3 style={TITLE}>Malzeme Miktar Kontrol</h3>
            {breakdown.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>Kalem girilmemiş; miktar kontrolü yapılamıyor.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {breakdown.map((row, index) => {
                  const notTracked = type === 'Malzeme' && row.planned <= 0
                  return (
                    <div key={`${row.name}-${index}`} style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <strong style={{ fontSize: 12.5, color: '#0F172A' }}>{row.name || 'Kalem'}</strong>
                        <span style={{
                          background: notTracked ? '#FEF3C7' : row.risky ? '#FEE2E2' : '#DCFCE7',
                          color: notTracked ? '#92400E' : row.risky ? '#DC2626' : '#16A34A',
                          fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                        }}>
                          {notTracked ? 'Listede Yok' : row.risky ? 'Riskli' : 'Uygun'}
                        </span>
                      </div>
                      {notTracked ? (
                        <p style={{ margin: 0, fontSize: 11.5, color: '#92400E', lineHeight: 1.4 }}>
                          ⚠ Bu malzeme proje malzeme listesinde (BOM) bulunmuyor, risk hesaplanamadı.
                        </p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                          <div><p style={LABEL}>Bu Talepte</p><p style={VALUE}>{fmtQty(row.quantity)} {row.unit}</p></div>
                          <div><p style={LABEL}>Planlanan (BOM)</p><p style={VALUE}>{row.planned > 0 ? `${fmtQty(row.planned)} ${row.unit}` : '—'}</p></div>
                          <div><p style={LABEL}>Toplam İstenen</p><p style={VALUE}>{fmtQty(row.totalRequested)} {row.unit}</p></div>
                          <div>
                            <p style={LABEL}>Aşım</p>
                            <p style={{ ...VALUE, color: row.excess > 0 ? '#DC2626' : '#16A34A' }}>
                              {row.excess > 0 ? `+${fmtQty(row.excess)}` : '0'} {row.unit}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
          )}

          <section style={CARD}>
            <h3 style={TITLE}>Açıklama</h3>
            <div style={{ display: 'grid', gridTemplateColumns: canAct ? '1fr 1fr' : '1fr', gap: 10 }}>
              <p style={{ margin: 0, minHeight: 46, maxHeight: 70, overflow: 'hidden', fontSize: 12.5, lineHeight: 1.45, color: '#334155', whiteSpace: 'pre-wrap' }}>{description}</p>
              {canAct && (
                <textarea
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder={canReview ? 'Onay/red notu... (red için zorunlu)' : 'İptal gerekçesi... (iptal için zorunlu)'}
                  style={{ width: '100%', height: 64, resize: 'none', boxSizing: 'border-box', border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12.5, outline: 'none' }}
                />
              )}
            </div>
          </section>

          {canAct && (
            <section style={{ ...CARD, padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: canComplete ? '1fr 150px 120px 120px' : '1fr 120px 120px', gap: 10, alignItems: 'center' }}>
                <span style={{ color: '#64748B', fontSize: 12.5 }}>
                  {canReview ? 'Yönetici kararını bu talep üzerinden verebilir.' : 'Proje yöneticisi işlemi tamamlayabilir veya talebi reddedebilir.'}
                </span>
                {canComplete && (
                  <select
                    value={supplierId}
                    onChange={event => setSupplierId(event.target.value)}
                    style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', width: '100%' }}
                  >
                    <option value="">Tedarikçisiz devam et</option>
                    {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                )}
                <button onClick={() => updateStatus(canReview ? 'reddedildi' : 'iptal')} disabled={saving || !note.trim()} style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: (saving || !note.trim()) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (saving || !note.trim()) ? 0.6 : 1 }}>Reddet</button>
                <button onClick={() => updateStatus(canReview ? 'onaylandi' : 'satin_alindi', supplierId)} disabled={saving} style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Kaydediliyor…' : canReview ? 'Onayla' : 'Tamamlandı'}
                </button>
              </div>
            </section>
          )}

          {canInvoice && (
            <section style={{ ...CARD, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>Proje yöneticisi işlemi tamamladı, henüz faturası kesilmedi.</p>
              <button onClick={() => setShowFaturaModal(true)} style={{ background: '#5B21B6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Fatura Oluştur
              </button>
            </section>
          )}
        </div>
      </div>

      {showFaturaModal && (
        <FaturaOlusturModal
          request={req}
          onClose={() => setShowFaturaModal(false)}
          onSaved={() => { setShowFaturaModal(false); onClose() }}
        />
      )}
    </div>
  )
}
