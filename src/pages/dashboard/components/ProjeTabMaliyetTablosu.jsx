import { useState } from 'react'
import ExportButton from '../../../components/ui/ExportButton'
import CostBucketTable from './CostBucketTable'
import { durumMeta, CATEGORY_META } from '../../../utils/finans'

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)

const formatTRY = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatPct = (pct) => {
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : ''
  return `${sign}%${Math.abs(pct).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ProjeTabMaliyetTablosu({ costBuckets, loading }) {
  const [filter, setFilter] = useState('tumu')

  const totalPlanned = costBuckets?.totalPlanned || 0
  const totalActual = costBuckets?.totalActual || 0
  const totalSapma = costBuckets?.totalSapma || 0
  const totalPct = costBuckets?.totalPct || 0
  const buckets = (costBuckets?.buckets || []).map(b => ({ ...b, ...CATEGORY_META[b.key] }))
  const visibleBuckets = filter === 'tumu' ? buckets : buckets.filter(b => b.key === filter)
  const totalDurum = durumMeta(totalSapma)

  function getExportData() {
    const columns = ['Kalem', 'Kategori', 'Planlanan Tutar', 'Gerçekleşen Tutar', 'Sapma (₺)', 'Sapma (%)', 'Durum']
    const rows = []
    visibleBuckets.forEach(b => {
      const d = durumMeta(b.sapma)
      rows.push([b.label, `${b.lines.length} kalem`, formatTRY(b.planned), formatTRY(b.actual), formatTRY(b.sapma), formatPct(b.pct), d.label])
      b.lines.forEach(line => rows.push([`  ${line.name}`, line.category, formatTRY(toNumber(line.planned_amount)), '—', '—', '—', '—']))
    })
    rows.push(['TOPLAM', '', formatTRY(totalPlanned), formatTRY(totalActual), formatTRY(totalSapma), formatPct(totalPct), totalDurum.label])
    return { columns, rows }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <p style={{ color: 'var(--color-muted)', fontSize: 14 }}>Yükleniyor…</p>
    </div>
  )

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0, flex: 1 }}>Maliyet Tablosu</h3>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{
          padding: '7px 12px', borderRadius: 8, border: '1px solid var(--color-border-md)',
          fontSize: 13, color: 'var(--color-text-sub)', fontFamily: 'inherit', cursor: 'pointer', background: '#fff',
        }}>
          <option value="tumu">Tüm Kalemler</option>
          {Object.entries(CATEGORY_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
        <ExportButton title="Maliyet Tablosu" getData={getExportData} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <CostBucketTable
          buckets={visibleBuckets}
          totalPlanned={totalPlanned}
          totalActual={totalActual}
          totalSapma={totalSapma}
          totalPct={totalPct}
        />
      </div>
      <p style={{ margin: 0, padding: '10px 20px', fontSize: 11, color: 'var(--color-muted-light)', borderTop: '1px solid var(--color-border-md)' }}>
        Tutarlar KDV hariçtir. Faturalar bütçe kalemine değil kategoriye kaydedildiği için gerçekleşen tutar Malzeme/Hizmet/Diğer düzeyinde hesaplanır; alt kalemler yalnızca planlanan tutarı gösterir.
      </p>
    </div>
  )
}
