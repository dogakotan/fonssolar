import ProjeTabTalepListesi from './ProjeTabTalepListesi'

export default function ProjeTabSaOnayKuyrugu({ projectId, onChanged, procurement }) {
  return (
    <ProjeTabTalepListesi
      projectId={projectId}
      onChanged={onChanged}
      procurement={procurement}
      onlyPending
    />
  )
}
