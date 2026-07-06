import ProjeTabTalepListesi from './ProjeTabTalepListesi'

export default function ProjeTabSaOnayKuyrugu({ projectId, filterDate, onChanged, procurement }) {
  return (
    <ProjeTabTalepListesi
      projectId={projectId}
      filterDate={filterDate}
      onChanged={onChanged}
      procurement={procurement}
      onlyPending
    />
  )
}
