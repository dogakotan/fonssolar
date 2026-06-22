import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

const formatCurrency = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export default function ProjeTabMaliyetTablosu({ projectId }) {
  const [invoices,    setInvoices]    = useState([])
  const [budgetLines, setBudgetLines] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!projectId) return
    async function load() {
      const [invRes, budRes] = await Promise.all([
        supabase.from('invoices').select('*, suppliers(name)').eq('status', 'onaylandı').eq('project_id', projectId).order('invoice_date', { ascending: false }),
        supabase.from('budget_lines').select('*').eq('project_id', projectId).order('order_index', { ascending: true }),
      ])
      setInvoices(invRes.data || [])
      setBudgetLines(budRes.data || [])
      setLoading(false)
    }
    load()
  }, [projectId])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <p style={{ color: '#6B7280', fontSize: 14 }}>Yükleniyor…</p>
    </div>
  )

  const totalPlanned  = budgetLines.reduce((s, b) => s + (b.planned_amount || 0), 0)
  const totalActual   = invoices.reduce((s, i) => s + (i.total_amount || 0), 0)
  const totalVariance = totalPlanned - totalActual
  const avgSpendPct   = totalPlanned > 0 ? Math.round(totalActual / totalPlanned * 100) : 0
  const pColor = avgSpendPct < 70 ? '#10B981' : avgSpendPct < 90 ? '#F59E0B' : '#EF4444'

  const categories = [...new Set([
    ...budgetLines.map(b => b.category),
    ...invoices.map(i => i.category),
  ])].filter(Boolean)

  const catRows = categories.map(cat => {
    const planned = budgetLines.filter(b => b.category === cat).reduce((s, b) => s + (b.planned_amount || 0), 0)
    const actual  = invoices.filter(i => i.category === cat).reduce((s, i) => s + (i.total_amount || 0), 0)
    const kalan   = planned - actual
    const pct     = planned > 0 ? Math.round(actual / planned * 100) : 0
    return { cat, planned, actual, kalan, pct }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Planlanan Bütçe', value: formatCurrency(totalPlanned),  color: '#185FA5' },
          { label: 'Gerçekleşen',     value: formatCurrency(totalActual),   color: '#6B7280' },
          { label: 'Kalan Bütçe',     value: formatCurrency(totalVariance), color: totalVariance >= 0 ? '#10B981' : '#EF4444' },
          { label: 'Harcama Oranı',   value: `%${avgSpendPct}`,            color: pColor },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>{c.label}</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: c.color, margin: '0 0 8px' }}>{c.value}</p>
            {c.label === 'Harcama Oranı' && (
              <div style={{ background: '#E5E7EB', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, avgSpendPct)}%`, height: '100%', background: pColor, borderRadius: 4, transition: 'width 0.4s' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {catRows.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Kategori Bazlı Maliyet</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                {['KATEGORİ', 'PLANLANAN', 'GERÇEKLEŞEN', 'KALAN', 'KULLANIM %', 'DURUM'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catRows.map(r => {
                const sc = r.pct === 0 ? '#9CA3AF' : r.pct < 70 ? '#10B981' : r.pct < 90 ? '#F59E0B' : '#EF4444'
                const icon = r.pct === 0 ? '⚪' : r.pct < 70 ? '🟢' : r.pct < 90 ? '🟡' : '🔴'
                return (
                  <tr key={r.cat} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, color: '#111827', textTransform: 'capitalize' }}>{r.cat}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, color: '#111827' }}>{formatCurrency(r.planned)}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, color: '#111827' }}>{formatCurrency(r.actual)}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, color: r.kalan >= 0 ? '#10B981' : '#EF4444', fontWeight: 500 }}>{formatCurrency(r.kalan)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, background: '#E5E7EB', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, r.pct)}%`, height: '100%', background: sc, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: sc }}>%{r.pct}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 16 }}>{icon}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {invoices.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Onaylanmış Fatura Geçmişi</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                {['TARİH', 'FATURA NO', 'TEDARİKÇİ', 'KATEGORİ', 'TUTAR'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>{formatDate(inv.invoice_date)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, color: '#111827' }}>{inv.invoice_no || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: '#111827' }}>{inv.suppliers?.name || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280', textTransform: 'capitalize' }}>{inv.category || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#185FA5' }}>{formatCurrency(inv.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {catRows.length === 0 && invoices.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
          Bu proje için maliyet verisi bulunamadı.
        </div>
      )}
    </div>
  )
}
