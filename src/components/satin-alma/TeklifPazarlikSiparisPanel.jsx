import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { withSignedStorageUrls } from '../../utils/storageUrls'
import { toUserMessage } from '../../utils/errors'

const CARD = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14, minWidth: 0 }
const TITLE = { margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#0F172A' }
const LABEL = { margin: 0, fontSize: 11, color: '#64748B' }
const INPUT = { border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }
const BTN_PRIMARY = { background: '#16A34A', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }
const BTN_DANGER = { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }
const BTN_GHOST = { background: 'transparent', color: '#64748B', border: '1px solid #D1D5DB', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }

const money = (amount, currency) =>
  `${Number(amount || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency || 'TRY'}`

const fmtDate = (date) => (date ? new Date(date).toLocaleDateString('tr-TR') : '—')

function offerLabel(offer, suppliers) {
  if (offer.supplier_id) return suppliers.find(s => s.id === offer.supplier_id)?.name || 'Tedarikçi'
  return offer.supplier_name_freetext || 'Tedarikçi'
}

// Satın alma talebinin yeni 3 aşamalı sürecinde (teklif_toplama/pazarlik_onay_bekliyor/
// pazarlik/siparis) TalepDetayModal'ın içine gömülen aşama-özel aksiyon paneli. Eski
// akıştaki Onayla/Reddet/Tamamlandı bölümünün (canAct) YERİNE değil, YANINA — status bu
// dört değerden biriyken canReview/canComplete zaten false olduğundan o bölüm hiç
// render edilmiyor, çakışma yok.
export default function TeklifPazarlikSiparisPanel({ request, status, onUpdated }) {
  const { role, isAdmin } = useAuth()
  const [offers, setOffers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loadingOffers, setLoadingOffers] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelNote, setCancelNote] = useState('')

  const isProjectManager = role === 'proje_yoneticisi'
  const canCancel = isProjectManager || isAdmin

  useEffect(() => {
    supabase.from('suppliers').select('id, name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [])

  useEffect(() => {
    let alive = true
    setLoadingOffers(true)
    withSignedStorageUrls('teklif-ekleri', request.offers || []).then(rows => {
      if (alive) { setOffers(rows); setLoadingOffers(false) }
    })
    return () => { alive = false }
  }, [request.offers])

  async function refresh() {
    await onUpdated?.()
  }

  async function cancelRequest() {
    setError('')
    if (!cancelNote.trim()) { setError('İptal için açıklama girmelisiniz.'); return }
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('cancel_purchase_request_negotiation_flow', {
      p_request_id: request.id,
      p_note: cancelNote.trim(),
    })
    setSaving(false)
    if (rpcError) { setError(toUserMessage(rpcError)); return }
    setCancelOpen(false)
    setCancelNote('')
    onUpdated?.()
  }

  return (
    <section style={CARD}>
      <h3 style={TITLE}>Teklif / Pazarlık / Sipariş Süreci</h3>
      {error && <div style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      {status === 'teklif_toplama' && (
        <TeklifToplamaSection
          request={request}
          offers={offers}
          suppliers={suppliers}
          loadingOffers={loadingOffers}
          isProjectManager={isProjectManager}
          isAdmin={isAdmin}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          onChanged={refresh}
        />
      )}

      {status === 'pazarlik_onay_bekliyor' && (
        <PazarlikOnayiSection
          request={request}
          offers={offers}
          suppliers={suppliers}
          isAdmin={isAdmin}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          onChanged={refresh}
        />
      )}

      {status === 'pazarlik' && (
        <PazarlikSection
          request={request}
          offers={offers}
          suppliers={suppliers}
          isProjectManager={isProjectManager}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          onChanged={refresh}
        />
      )}

      {status === 'siparis' && (
        <SiparisSection
          request={request}
          offers={offers}
          suppliers={suppliers}
          isProjectManager={isProjectManager}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          onChanged={refresh}
        />
      )}

      {canCancel && (
        <div style={{ borderTop: '1px solid #E5E7EB', marginTop: 12, paddingTop: 10 }}>
          {cancelOpen ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <textarea
                value={cancelNote}
                onChange={event => setCancelNote(event.target.value)}
                placeholder="İptal gerekçesi (zorunlu)"
                style={{ ...INPUT, height: 56, resize: 'none' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => { setCancelOpen(false); setCancelNote('') }} disabled={saving} style={{ ...BTN_GHOST, opacity: saving ? 0.7 : 1 }}>
                  Vazgeç
                </button>
                <button type="button" onClick={cancelRequest} disabled={saving || !cancelNote.trim()} style={{ ...BTN_DANGER, opacity: (saving || !cancelNote.trim()) ? 0.6 : 1, cursor: !cancelNote.trim() ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'İptal ediliyor…' : 'İptali Onayla'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setCancelOpen(true)} style={BTN_DANGER}>
                İptal Et
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function OfferList({ offers, suppliers, loadingOffers, onDelete, deletable, selectable, selectedId, onSelect }) {
  if (loadingOffers) return <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Teklifler yükleniyor…</p>
  if (offers.length === 0) return <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Henüz teklif eklenmedi.</p>

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {offers.map(offer => (
        <label
          key={offer.id}
          style={{
            display: 'grid', gridTemplateColumns: selectable ? '18px 1fr auto' : '1fr auto',
            alignItems: 'center', gap: 10, background: '#F8FAFC', border: `1px solid ${selectable && selectedId === offer.id ? '#16A34A' : '#E5E7EB'}`,
            borderRadius: 8, padding: '8px 10px', cursor: selectable ? 'pointer' : 'default',
          }}
        >
          {selectable && (
            <input type="radio" name="selected-offer" checked={selectedId === offer.id} onChange={() => onSelect(offer.id)} />
          )}
          <div>
            <strong style={{ fontSize: 12.5, color: '#0F172A' }}>{offerLabel(offer, suppliers)}</strong>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
              {money(offer.amount, offer.currency)}
              {offer.valid_until ? ` · Geçerlilik: ${fmtDate(offer.valid_until)}` : ''}
              {offer.notes ? ` · ${offer.notes}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
            {offer.signed_url && (
              <a href={offer.signed_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#5B21B6', fontWeight: 700 }}>Dosya</a>
            )}
            {deletable && (
              <button
                type="button"
                onClick={event => { event.preventDefault(); onDelete(offer.id) }}
                style={{ border: 'none', background: 'none', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Sil
              </button>
            )}
          </div>
        </label>
      ))}
    </div>
  )
}

function TeklifToplamaSection({ request, offers, suppliers, loadingOffers, isProjectManager, isAdmin, saving, setSaving, setError, onChanged }) {
  const [supplierId, setSupplierId] = useState('')
  const [supplierFreetext, setSupplierFreetext] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('TRY')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [lowOfferConfirmOpen, setLowOfferConfirmOpen] = useState(false)

  const canManage = isProjectManager || isAdmin

  async function addOffer() {
    setError('')
    const parsedAmount = Number(String(amount).replace(',', '.'))
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('Teklif tutarını girin.')
      return
    }
    if (!supplierId && !supplierFreetext.trim()) {
      setError('Tedarikçi seçin veya tedarikçi adı yazın.')
      return
    }

    setSaving(true)
    let storagePath = null
    if (file) {
      const path = `${request.id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('teklif-ekleri').upload(path, file)
      if (uploadError) {
        setSaving(false)
        setError('Dosya yüklenemedi: ' + (uploadError.message || ''))
        return
      }
      storagePath = path
    }

    const { error: rpcError } = await supabase.rpc('add_purchase_offer', {
      p_request_id: request.id,
      p_supplier_id: supplierId || null,
      p_supplier_name_freetext: supplierFreetext.trim() || null,
      p_amount: parsedAmount,
      p_currency: currency,
      p_valid_until: validUntil || null,
      p_notes: notes.trim() || null,
      p_storage_path: storagePath,
    })
    setSaving(false)
    if (rpcError) {
      setError(toUserMessage(rpcError))
      return
    }
    setSupplierId(''); setSupplierFreetext(''); setAmount(''); setValidUntil(''); setNotes(''); setFile(null)
    onChanged()
  }

  async function deleteOffer(offerId) {
    setError('')
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('delete_purchase_offer', { p_offer_id: offerId })
    setSaving(false)
    if (rpcError) { setError(toUserMessage(rpcError)); return }
    onChanged()
  }

  async function doSubmitForNegotiation() {
    setError('')
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('submit_purchase_request_for_negotiation', { p_request_id: request.id })
    setSaving(false)
    setLowOfferConfirmOpen(false)
    if (rpcError) { setError(toUserMessage(rpcError)); return }
    onChanged()
  }

  // Tarayıcının native window.confirm()'ü yerine (kullanıcı isteğiyle — "uyarı
  // siteden gelsin, webden gelmesin") sitenin kendi temasında satır-içi bir
  // uyarı kutusu açılır, FaturaDetayModal.jsx'teki "Faturayı İptal Et"
  // onayıyla aynı desen.
  function submitForNegotiation() {
    setError('')
    if (offers.length < 3) {
      setLowOfferConfirmOpen(true)
      return
    }
    doSubmitForNegotiation()
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <p style={{ ...LABEL, marginBottom: 6, fontWeight: 700 }}>Yüklenen Teklifler ({offers.length})</p>
        <OfferList offers={offers} suppliers={suppliers} loadingOffers={loadingOffers} deletable={canManage} onDelete={deleteOffer} />
      </div>

      {canManage && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select value={supplierId} onChange={event => { setSupplierId(event.target.value); if (event.target.value) setSupplierFreetext('') }} style={INPUT}>
              <option value="">Tedarikçi seçin…</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="text" placeholder="veya tedarikçi adı yazın" value={supplierFreetext} onChange={event => { setSupplierFreetext(event.target.value); if (event.target.value) setSupplierId('') }} style={INPUT} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: 8 }}>
            <input type="number" min="0" step="any" placeholder="Tutar" value={amount} onChange={event => setAmount(event.target.value)} style={INPUT} />
            <select value={currency} onChange={event => setCurrency(event.target.value)} style={INPUT}>
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            <input type="date" value={validUntil} onChange={event => setValidUntil(event.target.value)} style={INPUT} title="Geçerlilik tarihi" />
          </div>
          <input type="text" placeholder="Not (opsiyonel)" value={notes} onChange={event => setNotes(event.target.value)} style={INPUT} />
          <input type="file" onChange={event => setFile(event.target.files?.[0] || null)} style={{ fontSize: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={addOffer} disabled={saving} style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Kaydediliyor…' : '+ Teklif Ekle'}
            </button>
          </div>
        </>
      )}

      {isProjectManager && (
        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
          {lowOfferConfirmOpen ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px' }}>
                ⚠ Yalnızca {offers.length} teklif yüklediniz (önerilen en az 3). Yine de pazarlık onayına göndermek istiyor musunuz?
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setLowOfferConfirmOpen(false)} disabled={saving} style={{ ...BTN_GHOST, opacity: saving ? 0.7 : 1 }}>
                  Vazgeç
                </button>
                <button type="button" onClick={doSubmitForNegotiation} disabled={saving} style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Gönderiliyor…' : 'Yine de Gönder'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={submitForNegotiation} disabled={saving} style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Gönderiliyor…' : 'Pazarlığa Gönder'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PazarlikOnayiSection({ request, offers, suppliers, isAdmin, saving, setSaving, setError, onChanged }) {
  const [note, setNote] = useState('')

  async function review(approve) {
    setError('')
    if (!approve && !note.trim()) {
      setError('Red için açıklama girmelisiniz.')
      return
    }
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('review_purchase_request_negotiation_gate', {
      p_request_id: request.id,
      p_approve: approve,
      p_note: note.trim() || null,
    })
    setSaving(false)
    if (rpcError) { setError(toUserMessage(rpcError)); return }
    onChanged()
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <p style={{ ...LABEL, marginBottom: 6, fontWeight: 700 }}>Yüklenen Teklifler ({offers.length})</p>
        <OfferList offers={offers} suppliers={suppliers} loadingOffers={false} deletable={false} />
      </div>

      {isAdmin ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <textarea
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Red notu... (yalnızca red için zorunlu)"
            style={{ ...INPUT, height: 60, resize: 'none' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => review(false)} disabled={saving} style={{ ...BTN_DANGER, opacity: saving ? 0.7 : 1 }}>Reddet</button>
            <button type="button" onClick={() => review(true)} disabled={saving} style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }}>Onayla</button>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>Yönetici onayı bekleniyor.</p>
      )}
    </div>
  )
}

function PazarlikSection({ request, offers, suppliers, isProjectManager, saving, setSaving, setError, onChanged }) {
  const [selectedOfferId, setSelectedOfferId] = useState(request.selected_offer_id || '')
  const [amount, setAmount] = useState(request.negotiated_amount ?? '')
  const [currency, setCurrency] = useState(request.negotiated_currency || 'TRY')
  const [notes, setNotes] = useState(request.negotiation_notes || '')

  async function save() {
    setError('')
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('save_purchase_request_negotiation', {
      p_request_id: request.id,
      p_selected_offer_id: selectedOfferId || null,
      p_negotiated_amount: amount === '' ? null : Number(String(amount).replace(',', '.')),
      p_negotiated_currency: currency,
      p_negotiation_notes: notes.trim() || null,
    })
    setSaving(false)
    if (rpcError) { setError(toUserMessage(rpcError)); return }
    onChanged()
  }

  async function advance() {
    setError('')
    if (!selectedOfferId) {
      setError('Siparişe geçmeden önce kazanan teklifi seçip kaydedin.')
      return
    }
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('advance_purchase_request_to_order', { p_request_id: request.id })
    setSaving(false)
    if (rpcError) { setError(toUserMessage(rpcError)); return }
    onChanged()
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <p style={{ ...LABEL, marginBottom: 6, fontWeight: 700 }}>Kazanan Teklifi Seçin</p>
        <OfferList offers={offers} suppliers={suppliers} loadingOffers={false} deletable={false} selectable={isProjectManager} selectedId={selectedOfferId} onSelect={setSelectedOfferId} />
      </div>

      {isProjectManager && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
            <input type="number" min="0" step="any" placeholder="Nihai pazarlık tutarı" value={amount} onChange={event => setAmount(event.target.value)} style={INPUT} />
            <select value={currency} onChange={event => setCurrency(event.target.value)} style={INPUT}>
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Pazarlık notu (opsiyonel)" style={{ ...INPUT, height: 60, resize: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={save} disabled={saving} style={{ ...BTN_GHOST, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button type="button" onClick={advance} disabled={saving || !selectedOfferId} style={{ ...BTN_PRIMARY, opacity: (saving || !selectedOfferId) ? 0.6 : 1, cursor: !selectedOfferId ? 'not-allowed' : 'pointer' }}>
              Siparişe Geç
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SiparisSection({ request, offers, suppliers, isProjectManager, saving, setSaving, setError, onChanged }) {
  const item = (request.items || [])[0] || {}
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [unitPrice, setUnitPrice] = useState(item.unit_price ?? '')
  const [orderDate, setOrderDate] = useState(request.order_date || new Date().toISOString().slice(0, 10))
  const [supplierId, setSupplierId] = useState(request.supplier_id || '')
  const [deliveryStatus, setDeliveryStatus] = useState('tam')
  const [deliveryNote, setDeliveryNote] = useState('')

  const hasOrderInfo = Number(item.unit_price || 0) > 0
  const deliveryNoteMissing = deliveryStatus !== 'tam' && !deliveryNote.trim()

  async function save() {
    setError('')
    const qty = Number(String(quantity).replace(',', '.'))
    const price = Number(String(unitPrice).replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) { setError('Miktar sıfırdan büyük olmalıdır.'); return }
    if (!Number.isFinite(price) || price < 0) { setError('Birim fiyat sıfır veya daha büyük olmalıdır.'); return }

    setSaving(true)
    const { error: rpcError } = await supabase.rpc('save_purchase_request_order', {
      p_request_id: request.id,
      p_quantity: qty,
      p_unit_price: price,
      p_order_date: orderDate || null,
      p_supplier_id: supplierId || null,
    })
    setSaving(false)
    if (rpcError) { setError(toUserMessage(rpcError)); return }
    onChanged()
  }

  async function completeDelivery() {
    setError('')
    if (deliveryNoteMissing) { setError('Eksik veya hasarlı teslimatta açıklama zorunludur.'); return }
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('complete_purchase_request_delivery', {
      p_request_id: request.id,
      p_delivery_status: deliveryStatus,
      p_delivery_note: deliveryNote.trim() || null,
    })
    setSaving(false)
    if (rpcError) { setError(toUserMessage(rpcError)); return }
    onChanged()
  }

  if (!isProjectManager) {
    return <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>Sipariş proje yöneticisi tarafından yürütülüyor.</p>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: '#64748B' }}>
          Miktar ({item.unit || 'Adet'})
          <input type="number" min="0" step="any" value={quantity} onChange={event => setQuantity(event.target.value)} style={INPUT} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: '#64748B' }}>
          Birim Fiyat
          <input type="number" min="0" step="any" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} style={INPUT} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: '#64748B' }}>
          Sipariş Tarihi
          <input type="date" value={orderDate} onChange={event => setOrderDate(event.target.value)} style={INPUT} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: '#64748B' }}>
          Tedarikçi
          <select value={supplierId} onChange={event => setSupplierId(event.target.value)} style={INPUT}>
            <option value="">Tedarikçisiz devam et</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {hasOrderInfo && (
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8 }}>
          <select
            value={deliveryStatus}
            onChange={event => { setDeliveryStatus(event.target.value); if (event.target.value === 'tam') setDeliveryNote('') }}
            style={INPUT}
          >
            <option value="tam">Teslimat: Tam</option>
            <option value="eksik">Teslimat: Eksik</option>
            <option value="hasarli">Teslimat: Hasarlı</option>
          </select>
          {deliveryStatus !== 'tam' && (
            <input
              type="text"
              value={deliveryNote}
              onChange={event => setDeliveryNote(event.target.value)}
              placeholder="Eksik/hasarlı teslimat açıklaması (zorunlu)"
              style={INPUT}
            />
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={save} disabled={saving} style={{ ...BTN_GHOST, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={completeDelivery}
          disabled={saving || !hasOrderInfo || deliveryNoteMissing}
          title={!hasOrderInfo ? 'Önce sipariş bilgisini kaydedin' : deliveryNoteMissing ? 'Eksik/hasarlı teslimatta açıklama zorunlu' : ''}
          style={{ ...BTN_PRIMARY, opacity: (saving || !hasOrderInfo || deliveryNoteMissing) ? 0.6 : 1, cursor: (!hasOrderInfo || deliveryNoteMissing) ? 'not-allowed' : 'pointer' }}
        >
          Teslim Alındı — Tamamla
        </button>
      </div>
    </div>
  )
}
