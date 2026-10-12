import { useState } from 'react'
import WbsAlanlar from './WbsAlanlar'

// ProjeDetay › Proje Ayarları (Karar 58). İlk alt sekme "WBS ve Alanlar"; ileride proje kodu ve kategori ağırlıkları.
// Bağlantı noktası: ProjeDetay.jsx sekme listesine { key: 'ayarlar', label: 'Proje Ayarları' } ve render dalına
// <ProjeAyarlari projectId={project.id} role={role} />. ProjeDetay.jsx kullanıcının commit'lenmemiş dosyası olduğu için
// bu iki satır kullanıcı haber verene kadar eklenmedi (faz1-adim5-tasarim.md Ek A).
const SUBTABS = [{ key: 'wbs-alan', label: 'WBS ve Alanlar' }]

export default function ProjeAyarlari({ projectId, role }) {
  const [sub, setSub] = useState('wbs-alan')
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
