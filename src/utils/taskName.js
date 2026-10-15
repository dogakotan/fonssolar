// İş kalemi adının sonundaki parantezli açıklamayı ayırır:
// "KOLON ÇAKIM İŞLEMİ (Hidrolik kazık makinesi)" →
//   { base: 'KOLON ÇAKIM İŞLEMİ', detail: 'Hidrolik kazık makinesi' }
// Yalnızca adın SONUNDAKİ parantez taşınır; ortadaki parantez adın parçasıdır
// ("Kiriş (aşık taşıyıcı) montajı" olduğu gibi kalır). Veritabanındaki
// task_name değişmez; ayrım yalnızca ekranda yapılır.
export function splitTaskName(name) {
  const text = (name || '').trim()
  const match = text.match(/^(.*\S)\s*\(([^()]+)\)$/)
  if (!match) return { base: text, detail: '' }
  return { base: match[1].trim(), detail: match[2].trim() }
}
