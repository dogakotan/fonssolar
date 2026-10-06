// Alıntı doğrulaması (tasarım 4.6): source.quote belge metninde — boşluk ve büyük/küçük harf
// normalize edilerek — birebir geçmiyorsa alanın güveni en çok 0,3 yapılır ve quote_not_found işaretlenir.
// Bu, modelin uydurduğu değeri yüksek güvenle göstermesini engelleyen asıl önlemdir.

export const QUOTE_NOT_FOUND_CAP = 0.3

export function normalizeForQuote(text) {
  return String(text ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param fields  model çıktısı {alan: {value, confidence, source}}
 * @param pages   belge metni (sayfa dizisi)
 * @returns       {fields: düzeltilmiş kopya, flags: {alan: ['quote_not_found'|'page_mismatch']}}
 */
export function applyQuoteCheck(fields, pages) {
  const normPages = pages.map(normalizeForQuote)
  const whole = normPages.join(' ')
  const out = {}
  const flags = {}
  for (const [key, field] of Object.entries(fields)) {
    const copy = { ...field }
    out[key] = copy
    if (copy.value == null) continue
    const quote = normalizeForQuote(copy.source?.quote)
    if (!quote || !whole.includes(quote)) {
      copy.confidence = Math.min(Number(copy.confidence) || 0, QUOTE_NOT_FOUND_CAP)
      flags[key] = ['quote_not_found']
      continue
    }
    const page = copy.source?.page
    if (Number.isInteger(page) && normPages[page - 1] !== undefined && !normPages[page - 1].includes(quote)) {
      flags[key] = ['page_mismatch'] // bilgi amaçlı; güven düşürülmez
    }
  }
  return { fields: out, flags }
}
