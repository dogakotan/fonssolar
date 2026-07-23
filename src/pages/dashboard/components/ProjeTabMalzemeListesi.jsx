import { useState } from 'react'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { buildMaterialListRows } from '../../../utils/satinAlma'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
import ProjeTabFaturaKesilecekler from './ProjeTabFaturaKesilecekler'
import ProjeTabRiskler from './ProjeTabRiskler'

const SECTIONS = [
  { key: 'malzeme', label: 'Malzeme Listesi' },
  { key: 'riskler', label: 'Riskler' },
]

// Malzeme Listesi ve Riskler tek sayfada iki alt-sekme — ikisi de aynı BOM/tedarik
// bağlamına ait (malzeme fazla talebi riski doğrudan buradaki listeden doğuyor).
// activeSection/onSectionChange kontrollüyse (ProjeDetay Genel Proje'deki Riskler
// kartından "riskler" alt-sekmesine deep-link yapabilsin diye) üst bileşenden gelir,
// yoksa yerel state'e düşer.
export default function ProjeTabMalzemeListesi({ projectId, filterDate, activeSection, onSectionChange, onGoTab }) {
  const [localSection, setLocalSection] = useState('malzeme')
  const section = activeSection ?? localSection
  const setSection = onSectionChange ?? setLocalSection

  const { data: overview, loading, refreshing, error, refetch } = useDashboardData(
    'get_satin_alma_overview',
    { p_project_id: projectId },
    { enabled: !!projectId }
  )

  const authorized = overview?.authorized ?? true
  const requests = overview?.requests || []
  const procurement = overview?.procurement_items || []
  const pendingChanges = overview?.pending_changes || []
  const dateBoundary = new Date((filterDate || new Date().toISOString().split('T')[0]) + 'T23:59:59')
  const requestsUntilDate = requests.filter(request => !request.created_at || new Date(request.created_at) <= dateBoundary)
  const rows = buildMaterialListRows(procurement, requestsUntilDate)

  if (!loading && !authorized) return <UnauthorizedScopeNotice />

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--color-border-md)' }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)} style={{
            background: 'none', border: 'none', padding: '10px 22px',
            fontSize: 14, fontWeight: section === s.key ? 600 : 400,
            color: section === s.key ? 'var(--color-primary)' : 'var(--color-muted)',
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: section === s.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'riskler' ? (
        <ProjeTabRiskler projectId={projectId} onGoTab={onGoTab} />
      ) : (
        <ProjeTabFaturaKesilecekler
          rows={rows}
          requests={requestsUntilDate}
          loading={loading}
          pendingChanges={pendingChanges}
          onPendingChanged={refetch}
          projectId={projectId}
        />
      )}
    </div>
  )
}
