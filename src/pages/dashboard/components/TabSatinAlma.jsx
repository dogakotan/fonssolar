import { useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import SatinAlmaStats    from '../../../components/satin-alma/SatinAlmaStats'
import TalepListesi      from '../../../components/satin-alma/TalepListesi'
import SaOnayKuyrugu    from '../../../components/satin-alma/SaOnayKuyrugu'
import FaturaKesilecekler from '../../../components/satin-alma/FaturaKesilecekler'

const tabBtn = (active) => ({
  background: 'none', border: 'none', padding: '10px 22px',
  fontSize: 14, fontWeight: active ? 600 : 400,
  color: active ? '#185FA5' : '#6B7280',
  cursor: 'pointer', fontFamily: 'inherit',
  borderBottom: active ? '2px solid #185FA5' : '2px solid transparent',
  marginBottom: -2, transition: 'all 0.15s',
})

export default function TabSatinAlma() {
  const { isAdmin, isMuhasebe, role } = useAuth()
  const isSatinAlmaUzmani = role === 'satin_alma_uzmani'

  const [tab, setTab] = useState('talepler')

  const TABS = [
    { key: 'talepler', label: 'Talepler' },
    ...(isAdmin ? [{ key: 'onay', label: 'Onay Kuyruğu' }] : []),
    ...(isAdmin || isMuhasebe ? [{ key: 'fatura_kesilecek', label: 'Fatura Kesilecekler' }] : []),
  ]

  const showStats = isAdmin || isSatinAlmaUzmani

  return (
    <div>
      {/* İstatistik kartları — admin ve satın alma uzmanı için */}
      {showStats && <SatinAlmaStats />}

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #E5E7EB' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabBtn(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'talepler'          && <TalepListesi />}
      {tab === 'onay'              && isAdmin && <SaOnayKuyrugu />}
      {tab === 'fatura_kesilecek'  && (isAdmin || isMuhasebe) && <FaturaKesilecekler />}
    </div>
  )
}
