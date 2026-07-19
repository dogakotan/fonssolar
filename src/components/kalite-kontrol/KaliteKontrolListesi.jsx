import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { RESULT_META } from '../../utils/qualityInspection'
import Pager from '../ui/Pager'
import YeniDenetimModal from './YeniDenetimModal'
import DenetimDetayModal from './DenetimDetayModal'

const PAGE_SIZE = 10
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 24

const TH = { height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 12px', lineHeight: `${HEADER_HEIGHT}px`, textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const TD = { height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 12px', fontSize: 12.5, color: 'var(--color-text-sub)', verticalAlign: 'middle' }

const fmtDate = (date) =>
  date ? new Date(date).toLocaleDateString('tr-TR') : '—'

function ResultBadge({ result }) {
  const meta = RESULT_META[result] || RESULT_META.beklemede
  return (
    <span style={{ background: meta.bg, color: meta.color, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  )
}

// projectId yoksa (menü modu): tüm erişilebilir projelerin denetimleri, PROJE kolonu.
// projectId doluysa (proje modu): yalnız o proje (filterDate'e kadar).
export default function KaliteKontrolListesi({ projectId = null, filterDate = null, onGoToTicket }) {
  const { isAdmin, role } = useAuth()
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [page, setPage] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const canCreate = isAdmin || role === 'kalite_kontrol_sefi'

  useEffect(() => { fetchData() }, [projectId, filterDate])
  useEffect(() => { setPage(0) }, [projectId])

  async function fetchData() {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('get_quality_inspections_list', {
      p_project_id: projectId || null,
      p_filter_date: filterDate || null,
    })

    if (error || !data?.authorized) {
      console.error('quality_inspections load error:', error)
      setErrorMessage('Kalite denetimleri yüklenemedi.')
      setInspections([])
      setLoading(false)
      return
    }

    setInspections(data.inspections || [])
    setLoading(false)
  }

  const totalPages = Math.max(1, Math.ceil(inspections.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = inspections.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const headers = projectId
    ? ['TARİH', 'DENETÇİ', 'KATEGORİ', 'SONUÇ', 'BULGU']
    : ['TARİH', 'PROJE', 'DENETÇİ', 'KATEGORİ', 'SONUÇ', 'BULGU']

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Kalite Denetimleri</h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 7 }}>
          {inspections.length} denetim
        </span>

        {canCreate && (
          <button
            onClick={() => setShowNew(true)}
            style={{ marginLeft: 'auto', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            + Yeni Denetim
          </button>
        )}
      </div>

      {errorMessage && (
        <div style={{ padding: '10px 20px', background: '#FEF2F2', color: '#991B1B', fontSize: 13, borderBottom: '1px solid #FECACA' }}>
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>Yükleniyor…</div>
      ) : inspections.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
          {projectId ? 'Bu projeye ait kalite denetimi bulunmuyor.' : 'Hiç kalite denetimi bulunmuyor.'}
        </div>
      ) : (
        <>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: projectId ? 620 : 720 }}>
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(inspection => (
                <tr
                  key={inspection.id}
                  onClick={() => setSelectedId(inspection.id)}
                  style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                  onMouseEnter={event => { event.currentTarget.style.background = 'var(--color-bg)' }}
                  onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ ...TD, fontWeight: 600, color: 'var(--color-text)' }}>{fmtDate(inspection.inspection_date)}</td>
                  {!projectId && (
                    <td style={{ ...TD, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inspection.project_name || ''}>{inspection.project_name || '—'}</td>
                  )}
                  <td style={TD}>{inspection.inspector || '—'}</td>
                  <td style={TD}>{inspection.category || '—'}</td>
                  <td style={TD}><ResultBadge result={inspection.result} /></td>
                  <td style={TD}>
                    <span style={{ fontWeight: 700, color: inspection.open_count > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                      {inspection.open_count} açık
                    </span>
                    <span style={{ color: 'var(--color-muted)' }}> / {inspection.finding_count} toplam</span>
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

      {showNew && (
        <YeniDenetimModal
          defaultProjectId={projectId}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); fetchData() }}
        />
      )}
      {selectedId && (
        <DenetimDetayModal
          inspectionId={selectedId}
          onClose={() => { setSelectedId(null); fetchData() }}
          onGoToTicket={onGoToTicket}
        />
      )}
    </div>
  )
}
