// Ölçüm metrikleri ve rapor.md üretimi (tasarım 4.6 "Faz B ölçüm protokolü").
//
// Alan sonucu sınıfları (belge × alan başına bir tane):
//   dogru        beklenen dolu, tahmin eşleşiyor
//   dogru_bos    beklenen boş, tahmin boş           (doğru boş bırakma)
//   yanlis       beklenen dolu, tahmin dolu ama farklı
//   uydurma      beklenen boş, tahmin dolu          (hatalı doldurma)
//   eksik        beklenen dolu, tahmin boş
// "Yüksek güvenle yanlış" = yanlis veya uydurma VE (alıntı kontrolünden SONRAKİ) güven >= yüksek eşik.
// Seçim kuralı (tasarım): yüksek güvenle yanlış sayısı en düşük olan; eşitlikte belge başı maliyeti düşük olan.
// Kabul eşiği (hangi doğruluk "yeterli") veriyi görmeden belirlenmez — rapor yalnızca sıralar.

const TR_LOWER = s => String(s).toLocaleLowerCase('tr-TR')

const normalizers = {
  text: v => TR_LOWER(v).normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(),
  code: v => String(v).toUpperCase().replace(/\s+/g, ''),
  date: v => String(v).trim().slice(0, 10),
  int: v => (v === '' || v == null ? null : Number(v)),
  enum: v => String(v).trim().toLowerCase(),
}

export const TEXT_SIMILARITY_THRESHOLD = 0.8

function tokenJaccard(a, b) {
  const A = new Set(a.split(' ').filter(Boolean))
  const B = new Set(b.split(' ').filter(Boolean))
  if (!A.size && !B.size) return 1
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

const isEmpty = v => v == null || (typeof v === 'string' && v.trim() === '')

export function valuesMatch(compare, expected, predicted) {
  const norm = normalizers[compare] ?? normalizers.text
  const e = norm(expected)
  const p = norm(predicted)
  if (compare === 'text') return e === p || tokenJaccard(e, p) >= TEXT_SIMILARITY_THRESHOLD
  return e === p
}

export function classify(compare, expected, predicted) {
  const expEmpty = isEmpty(expected)
  const predEmpty = isEmpty(predicted)
  if (expEmpty && predEmpty) return 'dogru_bos'
  if (expEmpty) return 'uydurma'
  if (predEmpty) return 'eksik'
  return valuesMatch(compare, expected, predicted) ? 'dogru' : 'yanlis'
}

const median = xs => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const pct = (num, den) => (den ? `${((num / den) * 100).toFixed(1)}%` : '—')

/**
 * @param runs   [{provider, model, documents: [{fileName, ms, cost, jsonValid, repaired, error, fields, flags}]}]
 * @param expected Map<fileName, {alan: değer}>
 * @param specs  [{key, compare, label}]
 */
export function computeMetrics(runs, expected, specs, { highThreshold }) {
  return runs.map(run => {
    const perField = Object.fromEntries(specs.map(s => [s.key, { dogru: 0, dogru_bos: 0, yanlis: 0, uydurma: 0, eksik: 0 }]))
    const highConfWrong = []
    let quoteNotFound = 0
    for (const doc of run.documents) {
      const exp = expected.get(doc.fileName) ?? {}
      for (const spec of specs) {
        const pred = doc.fields?.[spec.key]
        const outcome = classify(spec.compare, exp[spec.key], pred?.value)
        perField[spec.key][outcome]++
        if (doc.flags?.[spec.key]?.includes('quote_not_found')) quoteNotFound++
        if ((outcome === 'yanlis' || outcome === 'uydurma') && Number(pred?.confidence) >= highThreshold) {
          highConfWrong.push({
            fileName: doc.fileName, field: spec.label, outcome,
            expected: exp[spec.key] || '(boş)', predicted: pred?.value, confidence: pred?.confidence,
          })
        }
      }
    }
    const totals = Object.values(perField).reduce((acc, f) => {
      for (const k of Object.keys(f)) acc[k] = (acc[k] ?? 0) + f[k]
      return acc
    }, {})
    const cells = Object.values(totals).reduce((a, b) => a + b, 0)
    const costs = run.documents.map(d => d.cost).filter(c => c != null)
    return {
      provider: run.provider,
      model: run.model,
      documents: run.documents.length,
      perField,
      totals,
      accuracy: cells ? (totals.dogru + totals.dogru_bos) / cells : null,
      correctEmptyRate: totals.dogru_bos + totals.uydurma ? totals.dogru_bos / (totals.dogru_bos + totals.uydurma) : null,
      falseFillRate: totals.dogru_bos + totals.uydurma ? totals.uydurma / (totals.dogru_bos + totals.uydurma) : null,
      wrongValueRate: totals.dogru + totals.yanlis ? totals.yanlis / (totals.dogru + totals.yanlis) : null,
      highConfWrong,
      quoteNotFound,
      invalidJson: run.documents.filter(d => !d.jsonValid).length,
      repaired: run.documents.filter(d => d.repaired).length,
      errors: run.documents.filter(d => d.error).map(d => ({ fileName: d.fileName, error: d.error })),
      medianMs: median(run.documents.map(d => d.ms)),
      totalMs: run.documents.reduce((a, d) => a + d.ms, 0),
      costPerDoc: costs.length === run.documents.length && costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    }
  })
}

export function rankProviders(metrics) {
  return [...metrics].sort((a, b) =>
    a.highConfWrong.length - b.highConfWrong.length ||
    (a.costPerDoc ?? Infinity) - (b.costPerDoc ?? Infinity))
}

const fmt = (n, d = 1) => (n == null ? '—' : Number(n).toFixed(d))
const fmtRate = r => (r == null ? '—' : `${(r * 100).toFixed(1)}%`)

export function renderReport({ metrics, specs, meta }) {
  const lines = []
  lines.push(`# AI sağlayıcı ölçüm raporu — ${meta.schemaVersion}`, '')
  lines.push(`- Tarih: ${meta.date}`)
  lines.push(`- Ölçüm seti: \`${meta.setDir}\` (${meta.documentCount} belge)`)
  lines.push(`- Belge metni yöntemi: ${meta.textMethods.join(', ')} (alıntı doğrulamasının referansı; tüm sağlayıcılar için aynı)`)
  lines.push(`- Yüksek güven eşiği: ${meta.highThreshold} · metin alanı benzerlik eşiği: ${TEXT_SIMILARITY_THRESHOLD}`)
  if (meta.note) lines.push(`- Not: ${meta.note}`)
  lines.push('', '> Bu rapor belge içeriğinden alıntılar içerebilir; gerçek dokümanlarla üretildiyse repoya eklenmez.', '')

  lines.push('## Özet', '')
  lines.push('| Sağlayıcı | Model | Belge | Alan doğruluğu | Doğru boş bırakma | Hatalı doldurma | Yanlış değer | **Yüksek güvenle yanlış** | quote_not_found | Geçersiz JSON | Onarılan | Medyan süre (ms) | Belge başı maliyet |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const m of metrics) {
    lines.push(`| ${m.provider} | ${m.model ?? '—'} | ${m.documents} | ${fmtRate(m.accuracy)} | ${fmtRate(m.correctEmptyRate)} | ${fmtRate(m.falseFillRate)} | ${fmtRate(m.wrongValueRate)} | **${m.highConfWrong.length}** | ${m.quoteNotFound} | ${m.invalidJson} | ${m.repaired} | ${fmt(m.medianMs, 0)} | ${m.costPerDoc == null ? 'bilinmiyor' : fmt(m.costPerDoc, 5)} |`)
  }
  const ranked = rankProviders(metrics)
  lines.push('', `Seçim kuralına göre sıra (yüksek güvenle yanlış ↑, eşitlikte maliyet ↑): ${ranked.map(m => m.provider).join(' > ') || '—'}.`)
  lines.push('Kabul eşiği bu raporda verilmez; karar veriye bakılarak ayrıca alınır.', '')

  lines.push('## Alan bazında', '')
  lines.push(`| Alan | ${metrics.map(m => m.provider).join(' | ')} |`)
  lines.push(`|---|${metrics.map(() => '---').join('|')}|`)
  for (const spec of specs) {
    const cells = metrics.map(m => {
      const f = m.perField[spec.key]
      const n = f.dogru + f.dogru_bos + f.yanlis + f.uydurma + f.eksik
      return `${pct(f.dogru + f.dogru_bos, n)} (D${f.dogru}/B${f.dogru_bos}/Y${f.yanlis}/U${f.uydurma}/E${f.eksik})`
    })
    lines.push(`| ${spec.label} | ${cells.join(' | ')} |`)
  }
  lines.push('', 'D = doğru, B = doğru boş, Y = yanlış değer, U = uydurma (beklenen boşken doldurma), E = eksik.', '')

  lines.push('## Yüksek güvenle yanlış alanlar', '')
  const hcw = metrics.flatMap(m => m.highConfWrong.map(x => ({ ...x, provider: m.provider })))
  if (!hcw.length) lines.push('Yok.')
  else {
    lines.push('| Sağlayıcı | Belge | Alan | Tür | Beklenen | Tahmin | Güven |', '|---|---|---|---|---|---|---|')
    for (const x of hcw) lines.push(`| ${x.provider} | ${x.fileName} | ${x.field} | ${x.outcome} | ${x.expected} | ${x.predicted} | ${fmt(x.confidence, 2)} |`)
  }

  const errs = metrics.flatMap(m => m.errors.map(e => ({ ...e, provider: m.provider })))
  if (errs.length) {
    lines.push('', '## Hatalar', '', '| Sağlayıcı | Belge | Hata |', '|---|---|---|')
    for (const e of errs) lines.push(`| ${e.provider} | ${e.fileName} | ${String(e.error).replace(/\|/g, '/')} |`)
  }
  if (meta.skipped?.length) {
    lines.push('', '## Atlanan sağlayıcılar', '')
    for (const s of meta.skipped) lines.push(`- ${s}`)
  }
  return lines.join('\n') + '\n'
}
