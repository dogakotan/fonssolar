import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'

export default function TabSatinAlmaOnayKuyrugu({ onChanged, procurement, projectId, filterDate, refreshKey }) {
  return (
    <TabSatinAlmaTalepListesi
      onChanged={onChanged}
      procurement={procurement}
      projectId={projectId}
      filterDate={filterDate}
      refreshKey={refreshKey}
      onlyPending
    />
  )
}
