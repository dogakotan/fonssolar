import { useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import ProjeTabFinansStats from './ProjeTabFinansStats'
import ProjeTabFaturaListesi from './ProjeTabFaturaListesi'
import ProjeTabOnayKuyrugu from './ProjeTabOnayKuyrugu'
import ProjeTabMaliyetTablosu from './ProjeTabMaliyetTablosu'

export default function ProjeTabFinans({ projectId, filterDate }) {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('faturalar')

  const TABS = [
    { key: 'faturalar', label: 'Faturalar' },
    { key: 'onay',      label: 'Onay Kuyruğu' },
    ...(isAdmin ? [{ key: 'maliyet', label: 'Maliyet Tablosu' }] : []),
  ]

  return (
    <div>
      <ProjeTabFinansStats projectId={projectId} filterDate={filterDate} />
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
      {tab === 'faturalar' && <ProjeTabFaturaListesi projectId={projectId} filterDate={filterDate} />}
      {tab === 'onay'      && <ProjeTabOnayKuyrugu projectId={projectId} filterDate={filterDate} />}
      {tab === 'maliyet'   && <ProjeTabMaliyetTablosu projectId={projectId} filterDate={filterDate} />}
    </div>
  )
}
