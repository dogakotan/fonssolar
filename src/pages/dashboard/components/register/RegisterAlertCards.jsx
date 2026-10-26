import { useRegisterAlerts } from '../../../../hooks/useRegisterAlerts'
import { visibleAlertCards } from '../../../../lib/menu/sidebarMenu'
import './register.css'

// Genel ekran: v_register_alerts özet kartları (erişilen tüm projeler). Uyarı yoksa hiç çizilmez.
// Karta tıklamak ilgili menü sayfasını açar.
export default function RegisterAlertCards({ onNavigate }) {
  const counts = useRegisterAlerts()
  const cards = visibleAlertCards(counts)
  if (cards.length === 0) return null
  return (
    <section className="register-alerts" aria-label="Proje kontrol uyarıları">
      {cards.map(card => (
        <button key={card.type} type="button" className="register-alert-card" onClick={() => onNavigate?.(card.tab)}>
          <span className="register-alert-count">{card.count}</span>
          <span className="register-alert-label">{card.label}</span>
        </button>
      ))}
    </section>
  )
}
