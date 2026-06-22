import { useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import FinansStats     from '../../../components/finans/FinansStats'
import FaturaListesi   from '../../../components/finans/FaturaListesi'
import OnayKuyrugu    from '../../../components/finans/OnayKuyrugu'
import MaliyetTablosu from '../../../components/finans/MaliyetTablosu'

export default function TabFinans() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('faturalar')

  const TABS = [
    { key: 'faturalar', label: 'Faturalar' },
    { key: 'onay',      label: 'Onay Kuyruğu' },
    ...(isAdmin ? [{ key: 'maliyet', label: 'Maliyet Tablosu' }] : []),
  ]

  return (
    <div>
      <FinansStats />

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #E5E7EB' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', padding: '10px 22px',
              fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#185FA5' : '#6B7280',
              cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: tab === t.key ? '2px solid #185FA5' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'faturalar' && <FaturaListesi />}
      {tab === 'onay'      && <OnayKuyrugu />}
      {tab === 'maliyet'   && <MaliyetTablosu />}
    </div>
  )
}
