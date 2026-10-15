// drive-gateway girdi doğrulaması: izinli dosya türleri, boyut, sözlükler, sha256, Drive dosya adı.
// Saf fonksiyonlar — Deno ve Node'da (testler) aynı şekilde çalışır.

export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // geçici; Faz A Drive sınır denemesine göre MAX_UPLOAD_BYTES secret'ı ile ayarlanır
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024
export const MAX_JSON_BYTES = 16 * 1024

export const DOC_TYPES = ['drawing', 'rfi', 'submittal', 'correspondence', 'report', 'contract', 'minutes', 'photo', 'other'] as const
export const DISCIPLINES = ['mechanical', 'dc', 'ac', 'mv', 'enh', 'civil', 'general'] as const

export interface FileKind {
  ext: string
  mimeType: string
  /** dwg saklanır ama AI'a gönderilmez (tasarım 4.5). */
  aiEligible: boolean
}

// Uzantı → kanonik mime + baş imza (magic bytes). Tarayıcının gönderdiği Content-Type'a güvenilmez.
const KINDS: Record<string, { mimeType: string; magic: number[][]; aiEligible: boolean }> = {
  pdf: { mimeType: 'application/pdf', magic: [[0x25, 0x50, 0x44, 0x46]], aiEligible: true }, // %PDF
  png: { mimeType: 'image/png', magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], aiEligible: true },
  jpg: { mimeType: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]], aiEligible: true },
  jpeg: { mimeType: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]], aiEligible: true },
  docx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: [[0x50, 0x4b, 0x03, 0x04]], // ZIP
    aiEligible: true,
  },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magic: [[0x50, 0x4b, 0x03, 0x04]],
    aiEligible: true,
  },
  dwg: { mimeType: 'image/vnd.dwg', magic: [[0x41, 0x43, 0x31, 0x30]], aiEligible: false }, // "AC10"
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** İzinli tür değilse veya içerik uzantıyla uyuşmuyorsa null (→ 415). */
export function detectFileKind(name: string, bytes: Uint8Array): FileKind | null {
  const ext = fileExtension(name)
  const kind = KINDS[ext]
  if (!kind) return null
  const matches = kind.magic.some(sig => sig.every((byte, i) => bytes[i] === byte))
  if (!matches) return null
  return { ext: ext === 'jpeg' ? 'jpg' : ext, mimeType: kind.mimeType, aiEligible: kind.aiEligible }
}

export function parseMaxUploadBytes(raw: string | undefined): number {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_UPLOAD_BYTES
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' }

/** ASCII, küçük harf, boşluk → tire, en fazla maxLen karakter. */
export function slugify(text: string, maxLen = 80): string {
  const ascii = text
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, ch => TR_MAP[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii.slice(0, maxLen).replace(/-+$/g, '')
}

/** Tasarım 4.5: {register_no}_{revizyon}_{kisa-baslik}.{uzantı}; revizyon yoksa o parça atlanır. */
export function buildDriveFileName(registerNo: string, revision: string | null | undefined, title: string, ext: string): string {
  const parts = [registerNo]
  const rev = revision?.trim()
  if (rev) parts.push(rev.replace(/[^A-Za-z0-9-]/g, ''))
  const slug = slugify(title)
  if (slug) parts.push(slug)
  return `${parts.join('_')}.${ext}`
}

/** Content-Disposition için RFC 5987 uyumlu, başlık enjeksiyonuna kapalı değer. */
export function contentDisposition(disposition: 'inline' | 'attachment', fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\\r\n]/g, '_')
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
