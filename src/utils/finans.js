// Tüm KPI/kova/sapma/CPI hesapları artık get_finans_overview RPC'sinde (Postgres) yapılıyor.
// Bu dosyada sadece SAF sunum yardımcıları kalıyor: renk/etiket eşlemesi ve metin biçimlendirme —
// hiçbiri veriyi sorgulamıyor ya da toplamıyor, sadece RPC'den gelen hazır sayıları görüntüye çeviriyor.

// Satın Alma modülüyle aynı kategori adlandırması (Malzeme/Hizmet) kullanılıyor — işçilik
// faturaları veritabanında hâlâ 'iscilik' değeriyle tutuluyor, sadece etiket "Hizmet" oldu.
export const CATEGORY_META = {
  malzeme: { label: 'Malzeme', color: 'var(--color-primary)' },
  iscilik: { label: 'Hizmet',  color: 'var(--color-warning)' },
  diger:   { label: 'Diğer',   color: '#8B5CF6' },
}

export const durumMeta = (sapma) =>
  sapma > 0 ? { key: 'asim', label: 'Aşım', bg: '#FEE2E2', color: '#991B1B' }
  : sapma < 0 ? { key: 'tasarruf', label: 'Tasarruf', bg: '#DCFCE7', color: '#166534' }
  : { key: 'planlandi', label: 'Planlandı', bg: '#DBEAFE', color: '#1E40AF' }

const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

// RPC'nin curve[].month alanı (YYYY-MM-DD) → grafik X ekseni etiketi (ör. "Haz 26").
// to_char/TM ile sunucu locale'ine bağımlı kalmamak için ay adı burada, sabit bir dizden üretiliyor.
export function curvePointLabel(monthStr) {
  const d = new Date(`${monthStr}T00:00:00`)
  return `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}

// RPC'nin dagilim {malzeme,iscilik,diger} nesnesini donut/legend'in beklediği diziye çevirir.
export function buildDagilimItems(dagilim) {
  return Object.entries(CATEGORY_META).map(([key, meta]) => ({ key, value: Number(dagilim?.[key]) || 0, ...meta }))
}

export function remainingDaysLabel(remainingDays) {
  if (remainingDays == null) return '—'
  return remainingDays < 0 ? `${Math.abs(remainingDays)} gün gecikti` : `${remainingDays} gün kaldı`
}

const STATUS_ACTIVITY = {
  bekliyor:            { verb: 'yüklendi',          color: 'var(--color-muted)' },
  muhasebe_onayında:   { verb: 'muhasebe onayında', color: 'var(--color-warning)' },
  yönetici_onayında:   { verb: 'yönetici onayında', color: 'var(--color-warning)' },
  onaylandı:           { verb: 'onaylandı',         color: 'var(--color-success)' },
  ödendi:              { verb: 'ödendi',            color: 'var(--color-primary)' },
  reddedildi:          { verb: 'reddedildi',        color: 'var(--color-danger)' },
}

// RPC'nin recentActivity[] ham fatura kayıtlarını "Son İşlemler" panelinin gösterdiği
// başlık/alt başlık metnine çevirir — timeAgo render anına bağlı olduğu için burada hesaplanmaz,
// bileşen kendi render'ında hesaplar.
export function formatRecentActivity(recentActivity = []) {
  return recentActivity.map(i => {
    const meta = STATUS_ACTIVITY[i.status] || { verb: i.status || 'güncellendi', color: 'var(--color-muted)' }
    const amount = Number(i.total_amount ?? i.amount) || 0
    return {
      id: i.id,
      title: `Fatura ${meta.verb}`,
      subtitle: `${CATEGORY_META[i.category]?.label || 'Diğer'} · ${amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`,
      color: meta.color,
      date: i.created_at || i.invoice_date,
    }
  })
}
