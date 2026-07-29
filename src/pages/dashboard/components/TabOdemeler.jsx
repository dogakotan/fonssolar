import { useState, useEffect } from 'react'
import { getProjects } from '../../../api'
import OdemeTakibi from '../../../components/finans/OdemeTakibi'
import TedarikciListesi from '../../../components/finans/TedarikciListesi'

const TABS = [
  { key: 'odemeler', label: 'Ödeme Takibi' },
  { key: 'tedarikciler', label: 'Tedarikçiler' },
]

// Yalnızca muhasebe rolüne özel üst-seviye sekme (roles.allowed_tabs/sidebar_items
// üzerinden) — Ödeme Takibi + Tedarikçiler önceden Finans'ın alt-sekmeleriydi,
// muhasebenin günlük işinin ağırlıklı kısmı bu ikisi olduğundan ayrı bir menü
// öğesine çıkarıldı (bkz. CLAUDE.md "Muhasebe & Finans modülü").
export default function TabOdemeler({ initialTab } = {}) {
  const [tab, setTab] = useState(initialTab && TABS.some(t => t.key === initialTab) ? initialTab : 'odemeler')
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')

  useEffect(() => {
    let alive = true
    getProjects().then(({ data }) => { if (alive) setProjects(data || []) })
    return () => { alive = false }
  }, [])

  return (
    <div>
      <div className="payment-top-bar">
        <div className="finans-genel-subtabs">
          {TABS.map(t => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
          <option value="">Tüm Projeler</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {tab === 'odemeler' && <OdemeTakibi projectId={selectedProjectId || null} />}
      {tab === 'tedarikciler' && <TedarikciListesi projectId={selectedProjectId} />}
    </div>
  )
}
