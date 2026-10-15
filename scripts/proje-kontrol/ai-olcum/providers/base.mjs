// Ortak sağlayıcı arayüzü. Ölçümde her sağlayıcıya AYNI şema, AYNI sistem promptu ve AYNI belge
// verilir; fark yalnızca adaptörün API çağrısıdır. JSON ayrıştırma, şema doğrulama, alıntı kontrolü,
// süre ve maliyet hesabı run.mjs'tedir — adaptör yalnızca ham metin ve token kullanımını döndürür.
//
// API anahtarları YALNIZCA ortam değişkeninden okunur; dosyaya, repoya veya rapora yazılmaz.

/**
 * @typedef {Object} ExtractRequest
 * @property {string} systemPrompt   prompts/<sürüm>.md içeriği
 * @property {object} schema         schemas/<sürüm>.json (x-* anahtarları dahil; adaptör isterse çıkarır)
 * @property {string} schemaVersion  ör. 'rfi_v1' — raporda ve (Faz C'de) ai_runs.prompt_version'da
 * @property {{fileName: string, pdfBytes: Uint8Array, pages: string[]}} document
 * @property {string|null} repairHint  önceki yanıt geçersizse doğrulama hataları (tek onarım denemesi)
 *
 * @typedef {Object} ExtractResponse
 * @property {string} rawText                       modelin döndürdüğü ham metin (JSON bekleniyor)
 * @property {{inputTokens: number|null, outputTokens: number|null}} usage
 */

export class ExtractionProvider {
  /** @param {{name: string, model: string|null, external: boolean, pricing: {inputPerMTok: number|null, outputPerMTok: number|null}}} opts */
  constructor({ name, model, external, pricing }) {
    this.name = name
    this.model = model
    /** Harici API'ye belge gönderir mi? (Karar #5 gizlilik kapısı) */
    this.external = external
    this.pricing = pricing
  }

  /** Gerekli ortam değişkenleri tanımlı mı? */
  get configured() { return false }

  /** @param {ExtractRequest} _request @returns {Promise<ExtractResponse>} */
  async extract(_request) {
    throw new Error(`${this.name}: extract() uygulanmadı`)
  }

  /** Belge başına maliyet (para birimi sağlayıcının fiyat birimi, genelde USD). Fiyat bilinmiyorsa null. */
  cost(usage) {
    const { inputPerMTok, outputPerMTok } = this.pricing ?? {}
    if (inputPerMTok == null || outputPerMTok == null || usage?.inputTokens == null || usage?.outputTokens == null) return null
    return (usage.inputTokens * inputPerMTok + usage.outputTokens * outputPerMTok) / 1_000_000
  }
}

/** Şemadan ölçüm betiğine özel x-* anahtarlarını temizler (modele gönderilecek kopya). */
export function schemaForModel(schema) {
  return JSON.parse(JSON.stringify(schema), (key, value) => (key.startsWith('x-') ? undefined : value))
}

export function envNumber(name) {
  const raw = process.env[name]
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
