// Postgres/Supabase hatalarını Türkçe kullanıcı mesajına çeviren tek kaynak —
// DailyReportForm.jsx, FaturaOlusturModal.jsx, TedarikKuyrugu.jsx'teki üç
// bağımsız `toUserMessage()` kopyasının tekilleştirilmiş hali. Her ekranın
// kendine özel kuralları (`rules`) ve varsayılan mesajı (`fallback`) farklı
// olabilir, o yüzden bunlar çağıran tarafından parametre olarak geçiliyor —
// yalnızca ortak olan kurallar (ör. RLS/yetki hatası) burada sabit.
const COMMON_RULES = [
  { match: ['row-level security', 'permission'], message: 'Bu işlem için yetkiniz yok.' },
]

export function toUserMessage(error, { rules = [], fallback } = {}) {
  const m = (error?.message || '').toLocaleLowerCase('tr-TR')
  for (const rule of [...rules, ...COMMON_RULES]) {
    const matchers = Array.isArray(rule.match) ? rule.match : [rule.match]
    if (matchers.some(text => m.includes(text.toLocaleLowerCase('tr-TR')))) return rule.message
  }
  if (typeof fallback === 'function') return fallback(error)
  return fallback ?? (error?.message || 'Bir hata oluştu. Lütfen tekrar deneyin.')
}
