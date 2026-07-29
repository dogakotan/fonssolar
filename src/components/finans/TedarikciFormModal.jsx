import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const initial = {
  name: '', tax_no: '', tax_office: '', supplier_type: 'malzeme_ekipman',
  currency: 'TRY', status: 'aktif', contact: '', phone: '', email: '',
  city: '', district: '', address: '', notes: '',
}

export default function TedarikciFormModal({ supplier = null, onClose, onSaved }) {
  const [form, setForm] = useState(() => supplier ? { ...initial, ...Object.fromEntries(Object.keys(initial).map(key => [key, supplier[key] ?? initial[key]])) } : initial)
  const [taxState, setTaxState] = useState('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sections, setSections] = useState({ company: true, contact: false, notes: false, checks: true, usage: false })
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const toggle = key => setSections(current => ({ ...current, [key]: !current[key] }))
  const requiredComplete = form.name.trim() && form.tax_no.trim() && form.tax_office.trim() && form.contact.trim() && form.phone.trim() && form.email.trim()

  async function checkTaxNo() {
    if (!form.tax_no.trim()) { setTaxState('idle'); return }
    setTaxState('checking')
    let query = supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('tax_no', form.tax_no.trim())
    if (supplier?.id) query = query.neq('id', supplier.id)
    const { count, error: queryError } = await query
    setTaxState(queryError ? 'idle' : count ? 'duplicate' : 'available')
  }

  async function submit(event, draft = false) {
    event.preventDefault()
    if (!draft && (!requiredComplete || taxState === 'duplicate')) return
    setSaving(true)
    setError('')
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]))
    payload.name = form.name.trim()
    payload.supplier_type = form.supplier_type
    payload.currency = form.currency
    payload.status = draft ? 'pasif' : form.status
    const { error: insertError } = supplier?.id
      ? await supabase.from('suppliers').update(payload).eq('id', supplier.id)
      : await supabase.from('suppliers').insert(payload)
    setSaving(false)
    if (insertError) {
      setError(insertError.code === '23505' ? 'Bu vergi numarasıyla kayıtlı bir tedarikçi bulunuyor.' : 'Tedarikçi kaydedilemedi. Alanları kontrol edip tekrar deneyin.')
      return
    }
    await onSaved?.()
    onClose()
  }

  return (
    <div className="supplier-form-backdrop">
      <form className="supplier-form" onSubmit={submit}>
        <header><div><small>Finans / Tedarikçiler / {supplier ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}</small><h2>{supplier ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi'}</h2><p>Fatura ve ödeme işlemlerinde kullanılacak tedarikçi kaydını {supplier ? 'güncelleyin' : 'oluşturun'}.</p></div><button type="button" onClick={onClose}><span className="desktop-close">×</span><span className="mobile-back">←</span></button></header>
        <div className="supplier-form-content">
          <main>
            <section className={sections.company ? 'section-open' : 'section-closed'}><button type="button" className="supplier-section-toggle" onClick={() => toggle('company')}><h3>Firma Bilgileri</h3><span>{sections.company ? '⌃' : '⌄'}</span></button><div className="supplier-section-body supplier-form-grid three">
              <label>Tedarikçi Unvanı *<input value={form.name} onChange={e => set('name', e.target.value)} /></label>
              <label>Vergi Numarası *<input value={form.tax_no} onChange={e => { set('tax_no', e.target.value.replace(/\D/g, '').slice(0, 11)); setTaxState('idle') }} onBlur={checkTaxNo} />{taxState === 'available' && <em className="ok">✓ Bu vergi numarası kullanılabilir.</em>}{taxState === 'duplicate' && <em className="bad">Bu vergi numarası zaten kayıtlı.</em>}</label>
              <label>Vergi Dairesi *<input value={form.tax_office} onChange={e => set('tax_office', e.target.value)} /></label>
              <label>Tedarikçi Türü *<select value={form.supplier_type} onChange={e => set('supplier_type', e.target.value)}><option value="malzeme_ekipman">Malzeme ve Ekipman</option><option value="hizmet">Hizmet</option><option value="nakliye">Nakliye</option><option value="diger">Diğer</option></select></label>
              <label>Para Birimi *<select value={form.currency} onChange={e => set('currency', e.target.value)}><option>TRY</option><option>USD</option><option>EUR</option></select></label>
              <label>Durum *<select value={form.status} onChange={e => set('status', e.target.value)}><option value="aktif">Aktif</option><option value="pasif">Pasif</option></select></label>
            </div></section>
            <section className={sections.contact ? 'section-open' : 'section-closed'}><button type="button" className="supplier-section-toggle" onClick={() => toggle('contact')}><h3>İletişim Bilgileri</h3><span>{sections.contact ? '⌃' : '⌄'}</span></button><div className="supplier-section-body supplier-form-grid three">
              <label>İlgili Kişi *<input value={form.contact} onChange={e => set('contact', e.target.value)} /></label>
              <label>Telefon *<input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} /></label>
              <label>E-posta *<input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></label>
              <label>İl<input value={form.city} onChange={e => set('city', e.target.value)} /></label>
              <label>İlçe<input value={form.district} onChange={e => set('district', e.target.value)} /></label>
              <label className="wide">Adres<textarea value={form.address} onChange={e => set('address', e.target.value)} /></label>
            </div></section>
            <section className={sections.notes ? 'section-open' : 'section-closed'}><button type="button" className="supplier-section-toggle" onClick={() => toggle('notes')}><h3>Notlar</h3><span>{sections.notes ? '⌃' : '⌄'}</span></button><div className="supplier-section-body"><label>Notlar<textarea placeholder="Tedarikçiyle ilgili şirket içi not ekleyin..." value={form.notes} onChange={e => set('notes', e.target.value)} /></label></div></section>
          </main>
          <aside>
            <section className={sections.checks ? 'section-open' : 'section-closed'}><button type="button" className="supplier-section-toggle" onClick={() => toggle('checks')}><h3>Kayıt Kontrolleri</h3><span>{sections.checks ? '⌃' : '⌄'}</span></button><div className="supplier-section-body supplier-form-checks"><p className={taxState === 'available' ? 'ok' : ''}>✓ Vergi numarası benzersiz</p><p className={requiredComplete ? 'ok' : ''}>✓ Zorunlu alanlar tamamlandı</p><p className="info">ⓘ Finansal bakiye bu ekrandan girilmez.<small>Fatura ve ödeme kayıtlarından otomatik oluşur.</small></p></div></section>
            <section className={sections.usage ? 'section-open' : 'section-closed'}><button type="button" className="supplier-section-toggle" onClick={() => toggle('usage')}><h3>Bu kayıt nerede kullanılacak?</h3><span>{sections.usage ? '⌃' : '⌄'}</span></button><div className="supplier-section-body supplier-form-usage"><p><i>▣</i><span><b>Satın Alma Talepleri</b><small>Tedarikçi, satın alma taleplerinde seçilebilir.</small></span></p><p><i>▤</i><span><b>Faturalar</b><small>Oluşturulacak faturalarda kullanılabilir.</small></span></p><p><i>₺</i><span><b>Ödeme Takibi</b><small>Ödeme kayıtlarında tedarikçi olarak görünür.</small></span></p><p><i>▧</i><span><b>Tedarikçi Raporları</b><small>Rapor ve analizlerde yer alır.</small></span></p></div></section>
          </aside>
        </div>
        {error && <p className="supplier-form-error">{error}</p>}
        <footer><button type="button" onClick={onClose}>İptal</button><span />{!supplier && <button type="button" className="draft" disabled={!form.name.trim() || saving} onClick={event => submit(event, true)}>Taslak Kaydet</button>}<button className="primary" disabled={!requiredComplete || taxState === 'duplicate' || saving}>{saving ? 'Kaydediliyor…' : supplier ? 'Değişiklikleri Kaydet' : 'Tedarikçiyi Oluştur'}</button></footer>
      </form>
    </div>
  )
}
