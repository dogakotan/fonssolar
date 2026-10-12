import { toUserMessage } from './errors'

// Proje yapısı (WBS / alan / alan-WBS / Activity ID) işlemlerinde DB'den dönen hataları kullanıcıya anlaşılır
// Türkçe metne çevirir (faz1-adim5-tasarim.md §1.4). Trigger mesajları zaten Türkçe; kurallar "ne yapmalı" ekler.
// register_raise biçimli RPC hataları (message = forbidden/validation/not_found/duplicate, hint = Türkçe açıklama,
// details = JSON) ayrıca ele alınır.

export const WBS_AREA_ERROR_RULES = [
  { match: 'Kullanımdaki WBS kodu değiştirilemez', message: 'Bu WBS kodunu kullanan görevler var; kod değiştirilemez. Yeni kodla yeni kayıt açın, eskisini pasifleştirin.' },
  { match: 'Kullanımdaki alan kodu değiştirilemez', message: 'Bu alan kodunu kullanan görevler var; kod değiştirilemez. Yeni kodla yeni kayıt açın, eskisini pasifleştirin.' },
  { match: "WBS'i veya üst WBS'i pasifleştirilemez", message: "Bu WBS'te (veya altında) Activity ID'li görev var; pasifleştirilemez. Önce görevleri başka WBS'e taşıyın ya da iptal edin." },
  { match: 'görevin alanı pasifleştirilemez', message: "Bu alanda Activity ID'li görev var; pasifleştirilemez. Önce görevin alanını admin düzeltmesiyle değiştirin ya da görevi iptal edin." },
  { match: "WBS'i veya üst WBS'i taşınamaz", message: "Bu WBS'te (veya altında) Activity ID'li görev var; başka üste taşınamaz." },
  { match: 'görevin alanı taşınamaz', message: "Bu alanda Activity ID'li görev var; başka üste taşınamaz." },
  { match: "WBS'i silinemez", message: "Bu WBS'te Activity ID'li görev var; silinemez." },
  { match: 'görevin alanı silinemez', message: "Bu alanda Activity ID'li görev var; silinemez." },
  { match: 'Alan-WBS bağı eklenemez', message: "Bu bağ, bazı Activity ID'li görevlerin alanını izin verilen kümenin dışında bırakır. Önce o görevlerin alanını da bu WBS'e bağlayın." },
  { match: 'Alan-WBS bağı kaldırılamaz', message: "Bu bağ kaldırılırsa Activity ID'li görevlerin alanı WBS'in bağ kümesinden çıkar; kaldırılamaz." },
  { match: "Aktif alt WBS'i olan WBS pasifleştirilemez", message: "Bu WBS'in aktif alt kayıtları var. Önce alt kayıtları pasifleştirin." },
  { match: 'Aktif alt alanı olan alan pasifleştirilemez', message: 'Bu alanın aktif alt alanları var. Önce alt alanları pasifleştirin.' },
  { match: 'Üst WBS pasifken alt WBS aktif olamaz', message: 'Üst WBS pasif; önce üstü aktifleştirin.' },
  { match: 'Üst alan pasifken alt alan aktif olamaz', message: 'Üst alan pasif; önce üstü aktifleştirin.' },
  { match: 'kendi alt dalına taşınamaz', message: 'Bir kayıt kendi altına taşınamaz.' },
  { match: "yeni WBS'e veya üst WBS'lerine bağlı değil", message: "Görevin alanı bu WBS'e bağlı değil. Alan-WBS bağını ekleyin ya da bağlı bir WBS/alan seçin." },
  { match: 'disiplini ve alanı değiştirilemez', message: 'Activity ID atanmış görevin disiplini ve alanı değiştirilemez; düzeltme yalnızca admin (gerekçeli).' },
  { match: 'Pasif WBS aktiviteye atanamaz', message: 'Pasif WBS göreve atanamaz.' },
  { match: 'Pasif alan aktiviteye atanamaz', message: 'Pasif alan göreve atanamaz.' },
  { match: 'Görevi yalnızca admin veya proje yöneticisi iptal edebilir', message: 'Görevi yalnızca admin veya proje yöneticisi iptal edebilir.' },
  { match: 'İptal edilmiş görevi yalnızca admin', message: 'İptal edilmiş görevi yalnızca admin veya proje yöneticisi yeniden açabilir.' },
  { match: 'Activity ID atanmış görev silinemez', message: 'Activity ID atanmış görev silinemez; görevi iptal edin.' },
  { match: 'Bu kategori için ağırlık tanımlayın', message: null }, // DB metni zaten kullanıcıya yönelik; aynen gösterilir
  { match: 'Görevi olan kategori ağırlık tablosundan çıkarılamaz', message: null },
  { match: 'project_areas_code_format', message: 'Alan kodu yalnızca büyük harf ve rakam içerebilir (tire yok).' },
  { match: 'project_wbs_code_format', message: 'WBS kodu yalnızca büyük harf, rakam ve tire içerebilir.' },
  { match: ['duplicate key', 'unique'], message: 'Bu kod projede zaten kullanılıyor.' },
]

const RAISE_CODES = { forbidden: 'Bu işlem için yetkiniz yok.', validation: 'Geçersiz bilgi.', not_found: 'Kayıt bulunamadı.', duplicate: 'Kayıt zaten var.' }

export function parseDetails(error) {
  const raw = error?.details
  if (!raw || typeof raw !== 'string') return null
  try { return JSON.parse(raw) } catch { return null }
}

// RPC (register_raise) ya da trigger hatasını tek satır kullanıcı metnine çevirir.
export function wbsAreaErrorMessage(error) {
  if (!error) return ''
  const code = error.message
  if (RAISE_CODES[code]) {
    const detail = parseDetails(error)
    const inner = detail?.error ? wbsAreaErrorMessage({ message: detail.error }) : null
    return [error.hint || RAISE_CODES[code], inner && inner !== detail.error ? inner : null].filter(Boolean).join(' — ')
  }
  const rule = WBS_AREA_ERROR_RULES.find(r => (Array.isArray(r.match) ? r.match : [r.match])
    .some(t => (code || '').toLocaleLowerCase('tr-TR').includes(t.toLocaleLowerCase('tr-TR'))))
  if (rule) return rule.message ?? code
  return toUserMessage(error)
}
