import { useState, useEffect } from 'react'
import Pager from '../../../components/ui/Pager'

const PAGE_SIZE = 10
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 24

const TH = { height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 14px', lineHeight: `${HEADER_HEIGHT}px`, textAlign: 'left', fontSize: 9.5, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', verticalAlign: 'middle' }
const TD = { height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 14px', fontSize: 13, color: 'var(--color-text-sub)', verticalAlign: 'middle' }

const formatQty = (value) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })

export default function ProjeTabFaturaKesilecekler({ rows = [], loading }) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => { setPage(0) }, [rows.length])

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Malzeme Listesi</h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20 }}>
          {rows.length} kalem
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
          Bu projeye ait malzeme listesi henüz eklenmemiş.
        </div>
      ) : (
        <>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                {['MALZEME', 'PLANLANAN MİKTAR', 'PROJE İÇİN GÖNDERİLEN', 'GÖNDERİLMESİ GEREKEN'].map(h => (
                  <th key={h} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => (
                <tr key={row.id || row.material} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...TD, fontWeight: 600, color: 'var(--color-text)' }}>{row.material}</td>
                  <td style={TD}>{formatQty(row.planned)} {row.unit}</td>
                  <td style={{ ...TD, fontWeight: 600, color: 'var(--color-success)' }}>{formatQty(row.sent)} {row.unit}</td>
                  <td style={{ ...TD, fontWeight: 700, color: row.required > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                    {formatQty(row.required)} {row.unit}
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
  )
}
