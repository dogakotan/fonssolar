import { useState } from 'react'
import WbsAlanlar from './WbsAlanlar'

// ProjeDetay › Proje Ayarları (Karar 58, 13.10.2026 güncellemesi): yalnızca admin ve proje yöneticisi. Şantiye şefi
// WBS/alanı İş Planı kolon ve filtrelerinden görür; ayrı görünüm yok. İlk alt sekme "WBS ve Alanlar"; ileride proje
// kodu ve kategori ağırlıkları. Bağlantı noktası ProjeDetay.jsx (kullanıcının commit'lenmemiş dosyası; rol koşullu
// sekme butonu faz1-adim5-tasarim.md Ek A'da hazır, kullanıcı haber verene kadar eklenmedi).
const SUBTABS = [{ key: 'wbs-alan', label: 'WBS ve Alanlar' }]

export default function ProjeAyarlari({ projectId, role }) {
  const [sub, setSub] = useState('wbs-alan')
  if (role !== 'admin' && role !== 'proje_yoneticisi') return null
  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid var(--color-border-md)' }}>
        {SUBTABS.map(s => (
          <button key={s.key} type="button" onClick={() => setSub(s.key)} style={{
            background: 'none', border: 'none', padding: '10px 22px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
            fontWeight: sub === s.key ? 600 : 400, color: sub === s.key ? 'var(--color-primary)' : 'var(--color-muted)',
            borderBottom: sub === s.key ? '2px solid var(--color-primary)' : '2px solid transparent', marginBottom: -2,
          }}>{s.label}</button>
        ))}
      </div>
      {sub === 'wbs-alan' && <WbsAlanlar projectId={projectId} role={role} />}
    </div>
  )
}
