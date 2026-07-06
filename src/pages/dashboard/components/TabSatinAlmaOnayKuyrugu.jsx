import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'

export default function TabSatinAlmaOnayKuyrugu({ onChanged, procurement, projectId }) {
  return (
    <TabSatinAlmaTalepListesi
      onChanged={onChanged}
      procurement={procurement}
      projectId={projectId}
      onlyPending
    />
  )
}
