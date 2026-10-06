// rfi_v1.json gibi alan şemaları için küçük doğrulayıcı (yalnızca bu şemaların kullandığı JSON Schema
// alt kümesi: type, enum, pattern, minimum/maximum, required, additionalProperties, $ref). Harici
// bağımlılık eklememek için yazıldı; "JSON güvenilirliği" metriği bu doğrulamaya dayanır.

function resolve(schema, node) {
  if (node?.$ref) {
    const path = node.$ref.replace(/^#\//, '').split('/')
    const target = path.reduce((acc, key) => acc?.[key], schema)
    const { $ref: _ref, ...rest } = node
    return { ...target, ...rest }
  }
  return node
}

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function check(root, nodeIn, value, path, errors) {
  const node = resolve(root, nodeIn)
  if (!node) return
  if (node.enum && !node.enum.includes(value)) errors.push(`${path}: izinli değer değil (${JSON.stringify(value)})`)
  if (node.type) {
    const types = Array.isArray(node.type) ? node.type : [node.type]
    const actual = typeOf(value)
    const ok = types.includes(actual) || (actual === 'integer' && types.includes('number'))
    if (!ok) { errors.push(`${path}: tip ${actual}, beklenen ${types.join('|')}`); return }
  }
  if (typeof value === 'string') {
    if (node.pattern && !new RegExp(node.pattern).test(value)) errors.push(`${path}: biçim uymuyor`)
    if (node.maxLength != null && value.length > node.maxLength) errors.push(`${path}: çok uzun`)
  }
  if (typeof value === 'number') {
    if (node.minimum != null && value < node.minimum) errors.push(`${path}: < ${node.minimum}`)
    if (node.maximum != null && value > node.maximum) errors.push(`${path}: > ${node.maximum}`)
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && node.properties) {
    for (const key of node.required ?? []) if (!(key in value)) errors.push(`${path}.${key}: eksik`)
    for (const [key, child] of Object.entries(value)) {
      if (node.properties[key]) check(root, node.properties[key], child, `${path}.${key}`, errors)
      else if (node.additionalProperties === false) errors.push(`${path}.${key}: şemada yok`)
    }
  }
}

export function validateAgainstSchema(schema, value) {
  const errors = []
  check(schema, schema, value, '$', errors)
  return errors
}

/** Model çıktısından JSON'u ayıklar (kod bloğu sarmalı varsa soyar). Başarısızsa null. */
export function parseModelJson(rawText) {
  if (typeof rawText !== 'string') return null
  const trimmed = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(trimmed) } catch { return null }
}

export function fieldSpecs(schema) {
  return Object.entries(schema.properties).map(([key, node]) => ({
    key, compare: node['x-compare'] ?? 'text', label: node['x-label'] ?? key,
  }))
}
