#!/usr/bin/env node
// AI sağlayıcı ölçüm betiği — Proje Kontrol (tasarım Bölüm 4.6 "Faz B ölçüm protokolü").
// Faz A'da yazıldı; gerçek sağlayıcılarla Faz B'de (3-9 Kas) çalıştırılacak.
//
// Kullanım:
//   node scripts/proje-kontrol/ai-olcum/run.mjs [--set <klasör>] [--providers mock,adapter-a,adapter-b]
//                                               [--schema rfi_v1] [--out <klasör>] [--high 0.9]
//   --set        ölçüm seti klasörü: *.pdf + beklenen.csv (varsayılan: ./olcum-seti — gitignore'da)
//   --providers  virgüllü liste (varsayılan: mock dışındaki yapılandırılmış tüm adaptörler)
//   --out        rapor klasörü (varsayılan: ./sonuclar/<zaman>) — rapor.md + ham.json
//
// beklenen.csv: her belge için bir satır; ilk sütun "dosya" (PDF dosya adı), diğer sütunlar şema alan
// adları (subject, question, raised_by_party, …). Boş hücre = "belgede yok, model boş bırakmalı".
// Excel'den ';' ayraçlı CSV olarak kaydedilebilir.
//
// GİZLİLİK (Karar #5): harici bir sağlayıcıya belge göndermek için AI_OLCUM_GIZLILIK_ONAYI=evet
// ortam değişkeni gerekir. İsdemir OYAK izni alınmadan gerçek Diyarbakır dokümanı gönderilmez.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './lib/csv.mjs'
import { extractDocumentText } from './lib/pdf-text.mjs'
import { applyQuoteCheck } from './lib/quote-check.mjs'
import { fieldSpecs, parseModelJson, validateAgainstSchema } from './lib/schema.mjs'
import { computeMetrics, renderReport } from './metrics.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROVIDERS = ['mock', 'adapter-a', 'adapter-b']

function parseArgs(argv) {
  const args = { set: join(HERE, 'olcum-seti'), providers: null, schema: 'rfi_v1', out: null, high: 0.9 }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    const value = argv[i + 1]
    if (key === 'set') args.set = resolve(value)
    else if (key === 'providers') args.providers = value.split(',').map(s => s.trim()).filter(Boolean)
    else if (key === 'schema') args.schema = value
    else if (key === 'out') args.out = resolve(value)
    else if (key === 'high') args.high = Number(value)
    else continue
    i++
  }
  return args
}

async function loadProviders(names) {
  const list = []
  for (const name of names) {
    if (!PROVIDERS.includes(name)) throw new Error(`Bilinmeyen sağlayıcı: ${name} (seçenekler: ${PROVIDERS.join(', ')})`)
    const mod = await import(`./providers/${name}.mjs`)
    list.push({ key: name, provider: mod.createProvider() })
  }
  return list
}

async function runDocument(provider, request, schema, pages) {
  const started = performance.now()
  let response
  let parsed = null
  let errors = []
  let repaired = false
  try {
    response = await provider.extract({ ...request, repairHint: null })
    parsed = parseModelJson(response.rawText)
    errors = parsed ? validateAgainstSchema(schema, parsed) : ['geçersiz JSON']
    if (errors.length) {
      // Tek onarım denemesi (tasarım 4.5 hata davranışı).
      const second = await provider.extract({ ...request, repairHint: errors.slice(0, 20).join('\n') })
      response = { rawText: second.rawText, usage: sumUsage(response.usage, second.usage) }
      parsed = parseModelJson(second.rawText)
      errors = parsed ? validateAgainstSchema(schema, parsed) : ['geçersiz JSON']
      repaired = errors.length === 0
    }
  } catch (error) {
    return { ms: performance.now() - started, error: error.message, jsonValid: false, fields: {}, flags: {}, usage: null }
  }
  const ms = performance.now() - started
  if (errors.length) {
    return { ms, error: `şema dışı: ${errors.slice(0, 3).join('; ')}`, jsonValid: false, repaired: false, fields: {}, flags: {}, usage: response.usage }
  }
  const { fields, flags } = applyQuoteCheck(parsed, pages)
  return { ms, jsonValid: true, repaired, fields, flags, usage: response.usage }
}

function sumUsage(a, b) {
  const add = (x, y) => (x == null || y == null ? null : x + y)
  return { inputTokens: add(a?.inputTokens, b?.inputTokens), outputTokens: add(a?.outputTokens, b?.outputTokens) }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const schemaPath = join(HERE, 'schemas', `${args.schema}.json`)
  const promptPath = join(HERE, 'prompts', `${args.schema}.md`)
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  const systemPrompt = await readFile(promptPath, 'utf8')
  const specs = fieldSpecs(schema)

  if (!existsSync(args.set)) throw new Error(`Ölçüm seti klasörü yok: ${args.set}`)
  const expectedCsv = join(args.set, 'beklenen.csv')
  if (!existsSync(expectedCsv)) throw new Error(`beklenen.csv yok: ${expectedCsv}`)
  const expectedRows = parseCsv(await readFile(expectedCsv, 'utf8'))
  const expected = new Map(expectedRows.map(row => [row.dosya, row]))
  const unknownCols = Object.keys(expectedRows[0] ?? {}).filter(c => c !== 'dosya' && !specs.some(s => s.key === c))
  if (unknownCols.length) console.warn(`Uyarı: beklenen.csv'de şemada olmayan sütunlar yok sayıldı: ${unknownCols.join(', ')}`)

  const pdfs = (await readdir(args.set)).filter(f => f.toLowerCase().endsWith('.pdf')).sort()
  const missingExpected = pdfs.filter(f => !expected.has(f))
  if (missingExpected.length) console.warn(`Uyarı: beklenen.csv'de satırı olmayan belgeler ölçülmeyecek: ${missingExpected.join(', ')}`)
  const docs = pdfs.filter(f => expected.has(f))
  if (!docs.length) throw new Error('Ölçülecek belge yok (PDF + beklenen.csv satırı eşleşmeli)')

  const names = args.providers ?? PROVIDERS.filter(p => p !== 'mock')
  const providers = await loadProviders(names)
  const skipped = []
  const active = providers.filter(({ key, provider }) => {
    if (!provider.configured) { skipped.push(`${key}: yapılandırılmamış (ortam değişkenleri eksik)`); return false }
    return true
  })
  if (active.some(p => p.provider.external) && process.env.AI_OLCUM_GIZLILIK_ONAYI !== 'evet') {
    throw new Error('Harici sağlayıcıya belge gönderimi engellendi: AI_OLCUM_GIZLILIK_ONAYI=evet tanımlı değil (Karar #5).')
  }
  if (!active.length) throw new Error(`Çalıştırılabilir sağlayıcı yok. ${skipped.join(' · ')}`)

  // Belge metni bir kez çıkarılır, bütün sağlayıcılar aynı metni ve aynı PDF'i alır.
  const documents = []
  const textMethods = new Set()
  for (const fileName of docs) {
    const path = join(args.set, fileName)
    const { pages, method } = await extractDocumentText(path)
    textMethods.add(method)
    documents.push({ fileName, pages, pdfBytes: new Uint8Array(await readFile(path)) })
  }

  const runs = []
  for (const { key, provider } of active) {
    console.log(`▶ ${key} (${provider.model ?? '—'}) — ${documents.length} belge`)
    const results = []
    for (const doc of documents) {
      const request = { systemPrompt, schema, schemaVersion: args.schema, document: doc }
      const r = await runDocument(provider, request, schema, doc.pages)
      results.push({ fileName: doc.fileName, ...r, cost: r.usage ? provider.cost(r.usage) : null })
      console.log(`  ${r.error ? '✖' : '✔'} ${doc.fileName} ${Math.round(r.ms)} ms${r.repaired ? ' (onarıldı)' : ''}${r.error ? ` — ${r.error}` : ''}`)
    }
    runs.push({ provider: key === provider.name ? key : `${key} (${provider.name})`, model: provider.model, documents: results })
  }

  const metrics = computeMetrics(runs, expected, specs, { highThreshold: args.high })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = args.out ?? join(HERE, 'sonuclar', stamp)
  await mkdir(outDir, { recursive: true })
  const report = renderReport({
    metrics, specs,
    meta: {
      schemaVersion: args.schema, date: new Date().toISOString().slice(0, 19).replace('T', ' '),
      setDir: args.set, documentCount: documents.length, textMethods: [...textMethods],
      highThreshold: args.high, skipped,
      note: active.every(p => p.key === 'mock') ? 'YALNIZCA SAHTE SAĞLAYICI — sonuçlar gerçek bir modeli temsil etmez, boru hattını kanıtlar.' : null,
    },
  })
  await writeFile(join(outDir, 'rapor.md'), report)
  await writeFile(join(outDir, 'ham.json'), JSON.stringify({ runs, metrics }, null, 2))
  console.log(`\nRapor: ${join(outDir, 'rapor.md')}`)
}

main().catch(error => {
  console.error(`Hata: ${error.message}`)
  process.exit(1)
})
