// Harici sağlayıcı adaptörü — İKİ BOŞ YUVA (a, b). Sağlayıcı seçimi Karar #5'e bağlı ve ölçümle
// yapılacak; bu yüzden adaptörler belirli bir firmaya bağlanmadı. Ölçüm başlamadan önce her yuva için
// extract() içindeki TODO doldurulur.
//
// Ortam değişkenleri (X = A veya B):
//   AI_OLCUM_X_API_KEY        zorunlu — yalnızca ortamda; rapora/loga yazılmaz
//   AI_OLCUM_X_MODEL          zorunlu — ör. sağlayıcının model kimliği
//   AI_OLCUM_X_LABEL          isteğe bağlı — raporda görünen ad (ör. "Sağlayıcı A — <model>")
//   AI_OLCUM_X_BASE_URL       isteğe bağlı — API uç noktası
//   AI_OLCUM_X_PRICE_IN       isteğe bağlı — 1M girdi token fiyatı
//   AI_OLCUM_X_PRICE_OUT      isteğe bağlı — 1M çıktı token fiyatı
import { envNumber, ExtractionProvider, schemaForModel } from './base.mjs'

export class ExternalAdapter extends ExtractionProvider {
  constructor(slot) {
    const prefix = `AI_OLCUM_${slot.toUpperCase()}_`
    super({
      name: process.env[`${prefix}LABEL`] || `adapter-${slot}`,
      model: process.env[`${prefix}MODEL`] || null,
      external: true,
      pricing: { inputPerMTok: envNumber(`${prefix}PRICE_IN`), outputPerMTok: envNumber(`${prefix}PRICE_OUT`) },
    })
    this.prefix = prefix
  }

  get configured() {
    return Boolean(process.env[`${this.prefix}API_KEY`] && this.model)
  }

  async extract(request) {
    const apiKey = process.env[`${this.prefix}API_KEY`]
    void apiKey
    void schemaForModel(request.schema)
    // TODO(Faz B, ölçüm öncesi): sağlayıcının API'sine istek
    //   - sıcaklık 0; yapılandırılmış/JSON çıktı modu ve schemaForModel(request.schema)
    //   - sistem mesajı: request.systemPrompt (belge içeriği ASLA sistem mesajına konmaz)
    //   - kullanıcı mesajı: PDF (request.document.pdfBytes, sağlayıcı PDF okuyorsa) ve/veya sayfa metinleri;
    //     ikisinden hangisi gönderildiyse raporda belirtilmeli — iki sağlayıcıya aynı girdi verilmeli
    //   - araç (tool) çağrısı kapalı
    //   - request.repairHint doluysa tek onarım denemesi: önceki hataları kullanıcı mesajına ekle
    //   - dönüş: { rawText, usage: { inputTokens, outputTokens } }
    throw new Error(`${this.name}: API çağrısı henüz yazılmadı (Karar #5 ve sağlayıcı adayları bekleniyor)`)
  }
}
