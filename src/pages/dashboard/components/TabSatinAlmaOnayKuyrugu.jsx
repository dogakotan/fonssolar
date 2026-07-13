import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'

export default function TabSatinAlmaOnayKuyrugu({ onChanged, procurement, projectId, refreshKey }) {
  return (
    <TabSatinAlmaTalepListesi
      onChanged={onChanged}
      procurement={procurement}
      projectId={projectId}
      refreshKey={refreshKey}
      onlyPending
    />
  )
}
