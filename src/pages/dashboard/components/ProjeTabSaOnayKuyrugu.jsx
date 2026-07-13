import ProjeTabTalepListesi from './ProjeTabTalepListesi'

export default function ProjeTabSaOnayKuyrugu({ projectId, filterDate, onChanged, procurement, refreshKey }) {
  return (
    <ProjeTabTalepListesi
      projectId={projectId}
      filterDate={filterDate}
      onChanged={onChanged}
      procurement={procurement}
      refreshKey={refreshKey}
      onlyPending
    />
  )
}
