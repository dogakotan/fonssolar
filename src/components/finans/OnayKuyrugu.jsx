import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import OnayReddetActions from './OnayReddetActions'

const formatCurrency = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('tr-TR') : '—'

const TH_STYLE = {
  padding: '10px 20px', textAlign: 'left', fontSize: 11,
  fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px',
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: '28px 0', textAlign: 'center', color: '#10B981', fontSize: 13 }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
      {text}
    </div>
  )
}

function DetailPanel({ inv }) {
  const kdvTutar   = inv.vat_amount  ?? ((inv.amount || 0) * (inv.vat_rate || 20) / 100)
  const toplamTutar = inv.total_amount ?? ((inv.amount || 0) + kdvTutar)

  const items = [
    { label: 'Proje',       value: inv.projects?.name || '—' },
    { label: 'Kategori',    value: inv.category ? inv.category.charAt(0).toUpperCase() + inv.category.slice(1) : '—' },
    { label: 'Vade Tarihi', value: formatDate(inv.due_date) },
    { label: 'KDV Hariç',  value: formatCurrency(inv.amount) },
    { label: `KDV (%${inv.vat_rate || 20})`, value: formatCurrency(kdvTutar) },
    { label: 'Genel Toplam', value: formatCurrency(toplamTutar), bold: true, color: '#185FA5' },
  ]

  return (
    <tr>
      <td colSpan={6} style={{ padding: 0, background: '#F8FAFC', borderBottom: '2px solid #E5E7EB' }}>
        <div style={{ padding: '16px 24px', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Sol: kırılım */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '8px 28px' }}>
            {items.map(({ label, value, bold, color }) => (
              <div key={label}>
                <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
                <p style={{ fontSize: 13, fontWeight: bold ? 700 : 500, color: color || '#111827', margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Sağ: açıklama */}
          {inv.description && (
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Açıklama</p>
              <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.5 }}>{inv.description}</p>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

function InvoiceTable({ invoices, onActionDone, readonly }) {
  const [expanded, setExpanded] = useState(null)

  const toggle = (id) => setExpanded(e => e === id ? null : id)

  // Bu tablo yalnızca yönetici_onayında faturaları gösterir (bkz. fetchData filtresi) -
  // readonly modda tek olası durum bu, fallback aynı meta'yı verir.
  const statusMeta = (status) => ({
    yönetici_onayında: { bg: '#EFF6FF', color: '#185FA5', label: 'Yönetici Onayında' },
  })[status] || { bg: '#EFF6FF', color: '#185FA5', label: 'Yönetici Onayında' }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
          {['', 'FATURA NO', 'TEDARİKÇİ', 'TUTAR (KDV\'Lİ)', 'FATURA TARİHİ', readonly ? 'DURUM' : 'İŞLEM'].map(h => (
            <th key={h} style={TH_STYLE}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {invoices.map(inv => {
          const isOpen = expanded === inv.id
          return (
            <Fragment key={inv.id}>
              <tr
                style={{
                  borderBottom: isOpen ? 'none' : '1px solid #F3F4F6',
                  background: isOpen ? '#F8FAFC' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {/* Genişlet/kapat */}
                <td
                  onClick={() => toggle(inv.id)}
                  style={{ padding: '14px 8px 14px 20px', width: 28, color: '#9CA3AF', fontSize: 12, userSelect: 'none' }}
                >
                  {isOpen ? '▲' : '▼'}
                </td>
                <td
                  onClick={() => toggle(inv.id)}
                  style={{ padding: '14px 20px', fontSize: 13, fontWeight: 500, color: '#111827' }}
                >
                  {inv.invoice_no || '—'}
                </td>
                <td
                  onClick={() => toggle(inv.id)}
                  style={{ padding: '14px 20px', fontSize: 13, color: '#374151' }}
                >
                  {inv.suppliers?.name || '—'}
                </td>
                <td
                  onClick={() => toggle(inv.id)}
                  style={{ padding: '14px 20px', fontSize: 13, fontWeight: 700, color: '#185FA5' }}
                >
                  {formatCurrency(inv.total_amount)}
                </td>
                <td
                  onClick={() => toggle(inv.id)}
                  style={{ padding: '14px 20px', fontSize: 13, color: '#6B7280' }}
                >
                  {formatDate(inv.invoice_date)}
                </td>
                <td style={{ padding: '14px 20px' }} onClick={e => e.stopPropagation()}>
                  {readonly ? (
                    <span style={{ background: statusMeta(inv.status).bg, color: statusMeta(inv.status).color, fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>
                      {statusMeta(inv.status).label}
                    </span>
                  ) : (
                    <OnayReddetActions invoiceId={inv.id} onDone={onActionDone} />
                  )}
                </td>
              </tr>

              {/* Detay paneli */}
              {isOpen && <DetailPanel inv={inv} />}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function Section({ title, badge, badgeBg, badgeColor, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>{title}</h3>
        <span style={{ background: badgeBg, color: badgeColor, fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
          {badge}
        </span>
      </div>
      {children}
    </div>
  )
}

// Yalnız aktif olarak onay bekleyen faturaları gösterir. Onaylayıcı ("Yönetici")
// artık proje_yoneticisi — admin yalnızca gözetim/acil durum için aynı yetkiye sahip.
export default function OnayKuyrugu({ projectId = null }) {
  const { isAdmin, role } = useAuth()
  const canApprove = isAdmin || role === 'proje_yoneticisi'
  const [yoneticiKuyrugu, setYoneticiKuyrugu] = useState([])
  const [loading,         setLoading]         = useState(true)

  // Kuyruk proje ve rol kapsamı değişince yenilenir; render-başına oluşan
  // fetchData referansı dependency yapılırsa gereksiz istek döngüsü oluşur.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [projectId, canApprove])

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_invoice_approval_queue', { p_project_id: projectId || null })
    if (error || !data?.authorized) {
      console.error('invoice approval queue fetch error:', error)
      setYoneticiKuyrugu([])
      setLoading(false)
      return
    }

    setYoneticiKuyrugu((data.yonetici_kuyrugu || []).filter(inv =>
      inv.status === 'yönetici_onayında'
    ))
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <p style={{ color: '#6B7280', fontSize: 14 }}>Yükleniyor…</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <Section
        title={canApprove ? (projectId ? 'Fatura Onay Bekleyenler' : 'Yönetici Onay Kuyruğu') : 'Yönetici Onayında'}
        badge={`${yoneticiKuyrugu.length} fatura`}
        badgeBg="#EFF6FF" badgeColor="#185FA5"
      >
        {yoneticiKuyrugu.length === 0
          ? <EmptyState text={canApprove ? 'Onay bekleyen fatura yok' : 'Yönetici onayında fatura yok'} />
          : <InvoiceTable
              invoices={yoneticiKuyrugu}
              onActionDone={fetchData}
              readonly={!canApprove}
            />
        }
      </Section>

    </div>
  )
}
