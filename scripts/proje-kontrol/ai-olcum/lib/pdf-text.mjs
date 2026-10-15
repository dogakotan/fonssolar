// Belge metni — alıntı doğrulamasının referansı. Aynı metin bütün sağlayıcılar için kullanılır.
// Öncelik sırası:
//   1. <belge>.txt yan dosyası (ör. `pdftotext -layout belge.pdf belge.txt`; sayfa ayracı \f)
//   2. pdfjs-dist kuruluysa (npm i -D pdfjs-dist) — gerçek ölçüm için önerilen yol
//   3. Yerleşik basit çıkarıcı: FlateDecode akışlarını açıp Tj/TJ metinlerini toplar. Yalnızca basit
//      (WinAnsi kodlu, ör. jsPDF ile üretilmiş) PDF'lerde güvenilir; CID/Type0 fontlu gerçek
//      çizim/yazışma PDF'lerinde eksik metin üretir. Taranmış PDF'te metin yoktur (OCR kapsam dışı).
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

export async function extractDocumentText(pdfPath) {
  const sidecar = pdfPath.replace(/\.pdf$/i, '.txt')
  if (sidecar !== pdfPath && existsSync(sidecar)) {
    const text = await readFile(sidecar, 'utf8')
    return { pages: text.split('\f'), method: 'sidecar_txt' }
  }
  const bytes = new Uint8Array(await readFile(pdfPath))
  const viaPdfjs = await tryPdfjs(bytes)
  if (viaPdfjs) return { pages: viaPdfjs, method: 'pdfjs' }
  return { pages: builtinExtract(Buffer.from(bytes)), method: 'builtin_simple' }
}

async function tryPdfjs(bytes) {
  let pdfjs
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  } catch {
    return null
  }
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''))
  }
  return pages
}

function builtinExtract(buf) {
  const raw = buf.toString('latin1')
  const pages = []
  const streamRe = /<<([\s\S]*?)>>\s*stream\r?\n/g
  let m
  while ((m = streamRe.exec(raw))) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) break
    let data = buf.subarray(start, end)
    if (/\/FlateDecode/.test(m[1])) {
      try { data = inflateSync(data) } catch { continue }
    } else if (/\/Filter/.test(m[1])) continue
    const content = data.toString('latin1')
    if (!/\bBT\b/.test(content)) continue
    const text = textFromContentStream(content)
    if (text.trim()) pages.push(text)
    streamRe.lastIndex = end
  }
  return pages
}

function decodePdfString(s) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, esc) => {
    const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
    return map[esc] ?? String.fromCharCode(parseInt(esc, 8))
  })
}

function textFromContentStream(content) {
  let out = ''
  const tokenRe = /\((?:\\.|[^\\)])*\)\s*(?:Tj|'|")|\[(?:\\.|[^\]])*\]\s*TJ|\b(?:T\*|Td|TD|ET)\b/g
  let t
  while ((t = tokenRe.exec(content))) {
    const tok = t[0]
    if (/^(T\*|Td|TD|ET)$/.test(tok)) { if (!out.endsWith('\n')) out += '\n'; continue }
    const strings = tok.match(/\((?:\\.|[^\\)])*\)/g) ?? []
    out += strings.map(s => decodePdfString(s.slice(1, -1))).join('')
  }
  return out
}
