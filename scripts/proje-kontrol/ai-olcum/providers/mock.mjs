// Sahte (mock) sağlayıcı — ağ yok, anahtar yok. Belge metnini düzenli ifadelerle okur ve ölçüm
// hattının her dalını çalıştırmak için BİLEREK kusurlu davranır:
//   - "Gonderen" satırı yoksa raised_by_party'yi uydurur (0.92 güven, belgede olmayan alıntı)
//     → alıntı doğrulaması güveni 0.3'e düşürmeli (quote_not_found).
//   - Aciliyet ifadesi yoksa da priority='normal' önerir (0.91 güven, gerçek bir alıntıyla)
//     → beklenen boş olduğu için "yüksek güvenle yanlış" sayılmalı.
//   - Adında "bozuk-json" geçen belgede ilk denemede kesik JSON döndürür → tek onarım denemesi.
// Gerçek bir modelin davranışını temsil ETMEZ; yalnızca uçtan uca boru hattını kanıtlar.
import { ExtractionProvider } from './base.mjs'

const PARTY = { yuklenici: 'contractor', isveren: 'owner', tasaron: 'subcontractor', musavir: 'engineer' }

function field(value, confidence, page, quote) {
  return value == null ? { value: null, confidence: 0, source: null } : { value, confidence, source: { page, quote } }
}

function find(pages, re) {
  for (let i = 0; i < pages.length; i++) {
    const line = pages[i].split('\n').find(l => re.test(l))
    if (line) return { page: i + 1, line: line.trim(), match: line.match(re) }
  }
  return null
}

export function createProvider() {
  return new (class MockProvider extends ExtractionProvider {
    constructor() {
      super({ name: 'mock', model: 'regex-v1', external: false, pricing: { inputPerMTok: 0.5, outputPerMTok: 1.5 } })
    }

    get configured() { return true }

    async extract({ document, repairHint }) {
      const { pages, fileName } = document
      const pick = (re, map = m => m[1].trim(), confidence = 0.95) => {
        const hit = find(pages, re)
        return hit ? field(map(hit.match), confidence, hit.page, hit.line) : field(null)
      }

      const sender = find(pages, /^Gonderen:\s*(\w+)/i)
      const raisedBy = sender
        ? field(PARTY[sender.match[1].toLowerCase()] ?? null, 0.93, sender.page, sender.line)
        : field('contractor', 0.92, 1, 'Gonderen: Yuklenici') // uydurma alıntı (bilerek)

      const urgent = find(pages, /\bacil\b/i)
      const subjectHit = find(pages, /^Konu:/i)
      const priority = urgent
        ? field('high', 0.95, urgent.page, urgent.line)
        : field('normal', 0.91, subjectHit?.page ?? 1, subjectHit?.line ?? '') // beklenen boşken doldurma (bilerek)

      const result = {
        subject: pick(/^Konu:\s*(.+)$/i),
        question: pick(/^Soru:\s*(.+)$/i, m => m[1].trim(), 0.9),
        raised_by_party: raisedBy,
        raised_at: pick(/^Tarih:\s*(\d{4}-\d{2}-\d{2})/i),
        due_date: pick(/^Cevap istenen tarih:\s*(\d{4}-\d{2}-\d{2})/i),
        drawing_no: pick(/^Ilgili cizim:\s*([A-Z0-9-]+)/i),
        task_code: pick(/^Aktivite:\s*([A-Z0-9-]+)/i),
        area_code: pick(/^Alan:\s*([A-Z0-9-]+)/i),
        wbs_code: pick(/^WBS:\s*([A-Z0-9.-]+)/i),
        contract_ref: pick(/^Sozlesme maddesi:\s*([0-9.]+)/i),
        schedule_impact_days: pick(/^Programa etkisi:\s*(\d+)\s*gun/i, m => Number(m[1]), 0.9),
        priority,
      }
      const json = JSON.stringify(result)
      const rawText = /bozuk-json/i.test(fileName) && !repairHint ? json.slice(0, Math.floor(json.length / 2)) : json
      const inputChars = pages.join('').length + 2000
      return { rawText, usage: { inputTokens: Math.ceil(inputChars / 4), outputTokens: Math.ceil(rawText.length / 4) } }
    }
  })()
}
