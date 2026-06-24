import { useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import ProjeTabSatinAlmaStats from './ProjeTabSatinAlmaStats'
import ProjeTabTalepListesi from './ProjeTabTalepListesi'
import ProjeTabSaOnayKuyrugu from './ProjeTabSaOnayKuyrugu'
import ProjeTabFaturaKesilecekler from './ProjeTabFaturaKesilecekler'

export default function ProjeTabSatinAlma({ projectId, filterDate }) {
  const { isAdmin, isMuhasebe } = useAuth()
  const [tab, setTab] = useState('talepler')

  const TABS = [
    { key: 'talepler', label: 'Talepler' },
    ...(isAdmin ? [{ key: 'onay', label: 'Onay Kuyruğu' }] : []),
    ...(isAdmin || isMuhasebe ? [{ key: 'fatura_kesilecek', label: 'Fatura Kesilecekler' }] : []),
  ]

  return (
    <div>
      <ProjeTabSatinAlmaStats projectId={projectId} />
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #E5E7EB' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', padding: '10px 22px',
            fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
            color: tab === t.key ? '#185FA5' : '#6B7280',
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t.key ? '2px solid #185FA5' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'talepler'         && <ProjeTabTalepListesi projectId={projectId} filterDate={filterDate} />}
      {tab === 'onay'             && isAdmin && <ProjeTabSaOnayKuyrugu projectId={projectId} />}
      {tab === 'fatura_kesilecek' && (isAdmin || isMuhasebe) && <ProjeTabFaturaKesilecekler projectId={projectId} />}
    </div>
  )
}
