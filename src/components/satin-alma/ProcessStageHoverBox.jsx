import { useState, useRef } from 'react'
import { normalizeStatus } from '../../utils/satinAlma'

// Teklif/Pazarlık/Sipariş sürecindeki (veya Aylık Plan'dan bağlanmış) bir talebin
// İŞLEM DURUMU rozetinin üzerine gelince tüm süreç adımlarını (geçmiş + şu an +
// gelecek) tek bakışta gösteren kutu — 04.09.2026'da eklendi (kullanıcı isteği:
// "hangi kalem teklifte, hangisi pazarlıkta" satıra tıklamadan görülebilsin).
// BomEslesmeRozeti'yle (ProjeTabAylikPlan.jsx) aynı fixed-position popover deseni,
// ama tıklama yerine hover ile açılır/kapanır.
const STAGE_PIPELINE = [
  { key: 'bekliyor', label: 'Talep Oluşturuldu' },
  { key: 'onaylandi', label: 'Proje Yöneticisinde' },
  { key: 'teklif_toplama', label: 'Teklif Toplama' },
  { key: 'pazarlik_onay_bekliyor', label: 'Pazarlık Onayı Bekliyor' },
  { key: 'pazarlik', label: 'Pazarlık' },
  { key: 'siparis', label: 'Sipariş' },
  { key: 'satin_alindi', label: 'Fatura Bekleniyor' },
  { key: 'fatura_onay_bekliyor', label: 'Fatura Onayda' },
  { key: 'faturasi_kesildi', label: 'Fatura Kesildi' },
]
const STAGE_INDEX = Object.fromEntries(STAGE_PIPELINE.map((s, i) => [s.key, i]))
// fatura_bekliyor pratikte hiç üretilmiyor (bkz. CLAUDE.md "Satın alma akışı") ama
// normalizeStatus yine de ayrı bir değer dönebiliyor — satin_alindi ile aynı basamak.
STAGE_INDEX.fatura_bekliyor = STAGE_INDEX.satin_alindi

export function ProcessStageHoverBox({ status, children }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const wrapRef = useRef(null)
  const normalized = normalizeStatus(status)

  function handleEnter() {
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 270) })
    }
    setOpen(true)
  }
  function handleLeave() { setOpen(false) }

  const isTerminalNegative = normalized === 'red_edildi' || normalized === 'iptal'
  const currentIndex = STAGE_INDEX[normalized]

  return (
    <span ref={wrapRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave} style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      {open && pos && (
        <div
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 1200, width: 250,
            background: '#111827', color: '#fff', borderRadius: 10, padding: '10px 12px',
            fontSize: 12, lineHeight: 1.5, boxShadow: '0 8px 20px rgba(0,0,0,.25)', pointerEvents: 'none',
          }}
        >
          {isTerminalNegative ? (
            <p style={{ margin: 0, fontWeight: 700, color: normalized === 'iptal' ? '#9CA3AF' : '#FCA5A5' }}>
              {normalized === 'iptal' ? 'Bu talep iptal edildi.' : 'Bu talep reddedildi.'}
            </p>
          ) : currentIndex === undefined ? (
            <p style={{ margin: 0, color: '#CBD5E1' }}>Süreç bilgisi yok.</p>
          ) : (
            <div style={{ display: 'grid', gap: 5 }}>
              {STAGE_PIPELINE.map((stage, i) => {
                const done = i < currentIndex
                const isCurrent = i === currentIndex
                return (
                  <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: done || isCurrent ? 1 : 0.45 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
                      background: done ? '#22C55E' : isCurrent ? '#3B82F6' : 'transparent',
                      border: done || isCurrent ? 'none' : '1px solid #6B7280', color: '#fff',
                    }}>
                      {done ? '✓' : ''}
                    </span>
                    <span style={{ fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#93C5FD' : '#fff' }}>
                      {stage.label}{isCurrent ? ' (şu an)' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
