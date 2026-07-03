const TH = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }
const TD = { padding: '11px 14px', fontSize: 13, color: 'var(--color-text-sub)' }

const formatQty = (value) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })

export default function ProjeTabFaturaKesilecekler({ rows = [], loading }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Malzeme Listesi</h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
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
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-md)' }}>
                {['MALZEME', 'PLANLANAN MİKTAR', 'PROJE İÇİN GÖNDERİLEN', 'GÖNDERİLMESİ GEREKEN'].map(h => <th key={h} style={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
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
      )}
    </div>
  )
}
