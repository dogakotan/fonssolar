// Register ekranının saf yapılandırması ve yardımcıları (React/Supabase bağımlılığı yok; tests-unit'ten doğrudan
// test edilir). Rol görünürlüğü Karar 6 "G" kolonudur; veritabanındaki register_view_allowed() ile aynı olmalı
// (son hali supabase/migrations/20261023134000_register_role_hardening_risk_numbering_alert_filter.sql; risk dahil).
// B1 gelince ikisi de register_permissions'tan okunur.

const TEKNIK_ROLLER = ['admin', 'proje_yoneticisi', 'santiye_sefi']
const SOZLESME_ROLLER = ['admin', 'proje_yoneticisi', 'muhasebe']

export const PRIORITY_MAP = {
  low:      { label: 'Düşük',  tone: 'muted' },
  medium:   { label: 'Orta',   tone: 'primary' },
  high:     { label: 'Yüksek', tone: 'warning' },
  critical: { label: 'Kritik', tone: 'danger' },
}
const PRIORITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 }

export const RECORD_STATE_MAP = {
  draft:            { label: 'Taslak',        tone: 'muted' },
  pending_approval: { label: 'Onay bekliyor', tone: 'warning' },
  approved:         { label: 'Onaylı',        tone: 'success' },
  rejected:         { label: 'Reddedildi',    tone: 'danger' },
}

export const REVISION_STATUS_MAP = {
  ifr:      { label: 'IFR — İnceleme için', tone: 'primary' },
  ifa:      { label: 'IFA — Onay için',     tone: 'warning' },
  ifc:      { label: 'IFC — Uygulama için', tone: 'success' },
  as_built: { label: 'As-built',            tone: 'success' },
}

// Disiplin anahtarı → Türkçe etiket (Karar 20 listesi). Eşlemede olmayan değer ham haliyle gösterilir:
// 19.10.2026'da canlıda disiplin kolonlarında kısıt/sözlük tablosu yok; dolu tek değer iki RFI'de serbest metin
// "Elektrik / Tasarım" (documents/technical_submittals boş).
export const DISCIPLINE_LABELS = {
  civil: 'İnşaat',
  mechanical: 'Mekanik',
  dc: 'DC',
  ac: 'AC',
  mv: 'Orta gerilim',
  hv: 'Yüksek gerilim',
  enh: 'ENH',
  scada: 'SCADA',
  general: 'Genel',
}

export function disciplineLabel(value) {
  if (value === null || value === undefined || value === '') return '—'
  return DISCIPLINE_LABELS[value] || String(value)
}

const ONAY_DURUMLARI = {
  draft:                  { label: 'Taslak',            tone: 'muted' },
  submitted:              { label: 'Gönderildi',        tone: 'primary' },
  under_review:           { label: 'İncelemede',        tone: 'warning' },
  approved:               { label: 'Onaylandı',         tone: 'success' },
  approved_with_comments: { label: 'Yorumlu onay',      tone: 'success' },
  rejected:               { label: 'Reddedildi',        tone: 'danger' },
  resubmit_required:      { label: 'Yeniden sunulmalı', tone: 'danger' },
  expired:                { label: 'Süresi doldu',      tone: 'muted' },
}

// Ortak sütunlar (WBS/alan/görev bağlantısı ve kayıt tarihleri) — her register'ın sonuna eklenir.
const BAG_SUTUNLARI = [
  { key: 'wbs_code',   label: 'WBS',          type: 'code', nameKey: 'wbs_name', default: true },
  { key: 'area_code',  label: 'Alan',         type: 'code', nameKey: 'area_name', default: true },
  // Karar 69: mevcut görev bağları salt okunur gösterilir (varsayılan açık); ekranda bağ kurulmaz.
  { key: 'task_code',  label: 'Görev',        type: 'code', nameKey: 'task_name', default: true },
  { key: 'created_at', label: 'Oluşturulma',  type: 'date' },
  { key: 'updated_at', label: 'Güncellenme',  type: 'date' },
]

const col = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra })

// Sekme sırası = dizinin sırası. Yeni register (ör. Risk) bu diziye bir öğe eklenerek gelir.
export const REGISTER_TABS = [
  {
    key: 'rfi', label: 'RFI', subtitle: 'Bilgi talepleri', roles: TEKNIK_ROLLER, historyTracked: true,
    statusMap: {
      open:         { label: 'Açık',        tone: 'primary' },
      under_review: { label: 'İncelemede',  tone: 'warning' },
      answered:     { label: 'Cevaplandı',  tone: 'success' },
      closed:       { label: 'Kapalı',      tone: 'muted' },
      rejected:     { label: 'Reddedildi',  tone: 'danger' },
    },
    columns: [
      col('raised_date', 'Açılış', 'date', { default: true }),
      col('due_date', 'Termin', 'date', { default: true }),
      col('assigned_to', 'Sorumlu', 'person', { default: true }),
      col('raised_by', 'Açan', 'person'),
      col('discipline', 'Disiplin', 'discipline'),
      col('answered_date', 'Cevap tarihi', 'date'),
    ],
    detail: [col('question', 'Soru', 'long'), col('description', 'Açıklama', 'long'), col('response', 'Cevap', 'long')],
  },
  {
    key: 'document', label: 'Doküman', subtitle: 'Dokümanlar ve çizimler', roles: TEKNIK_ROLLER, historyTracked: true,
    drawingFilter: true,
    statusMap: {
      active: { label: 'Aktif',    tone: 'success' },
      void:   { label: 'Geçersiz', tone: 'muted' },
    },
    hasPriority: false,
    columns: [
      col('revision_no', 'Revizyon', 'text', { default: true }),
      col('revision_status', 'Revizyon durumu', 'status', { default: true, map: REVISION_STATUS_MAP }),
      col('document_type', 'Tür', 'text', { default: true }),
      col('discipline', 'Disiplin', 'discipline'),
      col('issue_date', 'Yayın tarihi', 'date'),
      col('drawing_type', 'Çizim türü'),
      col('created_by', 'Oluşturan', 'person'),
    ],
    detail: [],
  },
  {
    key: 'decision', label: 'Karar', subtitle: 'Proje kararları', roles: TEKNIK_ROLLER, historyTracked: true,
    hasPriority: false,
    statusMap: {
      proposed:   { label: 'Önerildi',         tone: 'warning' },
      approved:   { label: 'Onaylandı',        tone: 'success' },
      superseded: { label: 'Yerine yenisi geldi', tone: 'muted' },
      cancelled:  { label: 'İptal',            tone: 'muted' },
    },
    columns: [
      col('decision_date', 'Karar tarihi', 'date', { default: true }),
      col('decision_maker', 'Karar veren', 'text', { default: true }),
      col('created_by', 'Oluşturan', 'person'),
    ],
    detail: [col('decision_text', 'Karar metni', 'long')],
  },
  {
    key: 'action', label: 'Aksiyon', subtitle: 'Takip edilen aksiyonlar', roles: TEKNIK_ROLLER, historyTracked: true,
    statusMap: {
      open:        { label: 'Açık',          tone: 'primary' },
      in_progress: { label: 'Devam ediyor',  tone: 'warning' },
      done:        { label: 'Tamamlandı',    tone: 'success' },
      cancelled:   { label: 'İptal',         tone: 'muted' },
    },
    columns: [
      col('assigned_to', 'Sorumlu', 'person', { default: true }),
      col('due_date', 'Termin', 'date', { default: true }),
      col('responsible', 'Sorumlu (metin)'),
      col('source_type', 'Kaynak', 'enum', { map: {
        manual: { label: 'Elle' }, risk: { label: 'Risk' }, rfi: { label: 'RFI' },
        decision: { label: 'Karar' }, meeting: { label: 'Toplantı' }, other: { label: 'Diğer' },
      } }),
      col('completed_at', 'Tamamlanma', 'date'),
    ],
    detail: [col('description', 'Açıklama', 'long')],
  },
  {
    key: 'submittal', label: 'Teknik Sunum', subtitle: 'Teknik sunumlar (submittal)', roles: TEKNIK_ROLLER,
    historyTracked: true, hasPriority: false, statusMap: ONAY_DURUMLARI,
    columns: [
      col('revision', 'Revizyon', 'text', { default: true }),
      col('submitted_date', 'Gönderim', 'date', { default: true }),
      col('due_date', 'Termin', 'date', { default: true }),
      col('discipline', 'Disiplin', 'discipline'),
      col('supplier_name', 'Tedarikçi'),
      col('reviewer_id', 'İnceleyen', 'person'),
      col('reviewed_date', 'İnceleme tarihi', 'date'),
    ],
    detail: [col('description', 'Açıklama', 'long')],
  },
  {
    key: 'material_approval', label: 'Malzeme Onayı', subtitle: 'Malzeme onayları', roles: TEKNIK_ROLLER,
    historyTracked: true, hasPriority: false, statusMap: ONAY_DURUMLARI,
    columns: [
      col('manufacturer', 'Üretici', 'text', { default: true }),
      col('revision', 'Revizyon', 'text', { default: true }),
      col('submitted_date', 'Gönderim', 'date', { default: true }),
      col('model', 'Model'),
      col('supplier_name', 'Tedarikçi'),
      col('approved_date', 'Onay tarihi', 'date'),
    ],
    detail: [],
  },
  {
    key: 'change', label: 'Değişiklik', subtitle: 'Değişiklik kayıtları', roles: SOZLESME_ROLLER, historyTracked: true,
    statusMap: {
      identified:  { label: 'Belirlendi',  tone: 'primary' },
      submitted:   { label: 'Sunuldu',     tone: 'warning' },
      approved:    { label: 'Onaylandı',   tone: 'success' },
      rejected:    { label: 'Reddedildi',  tone: 'danger' },
      implemented: { label: 'Uygulandı',   tone: 'success' },
    },
    columns: [
      col('assigned_to', 'Sorumlu', 'person', { default: true }),
      col('due_date', 'Termin', 'date', { default: true }),
      col('cost_estimate', 'Tahmini maliyet', 'money', { default: true }),
      col('time_impact_days', 'Süre etkisi (gün)', 'number'),
      col('origin', 'Kaynak', 'enum', { map: {
        owner_request: { label: 'İşveren talebi' }, design_change: { label: 'Tasarım değişikliği' },
        site_condition: { label: 'Saha koşulu' }, other: { label: 'Diğer' },
      } }),
      col('record_state', 'Kayıt durumu', 'status', { map: RECORD_STATE_MAP }),
      col('contract_ref', 'Sözleşme referansı'),
    ],
    detail: [col('description', 'Açıklama', 'long')],
  },
  {
    key: 'claim', label: 'Hak Talebi', subtitle: 'Hak talepleri (claim)', roles: SOZLESME_ROLLER, historyTracked: true,
    hasPriority: false,
    statusMap: {
      notice_due:  { label: 'İhbar bekliyor',   tone: 'warning' },
      notice_sent: { label: 'İhbar gönderildi', tone: 'primary' },
      submitted:   { label: 'Sunuldu',          tone: 'primary' },
      negotiating: { label: 'Müzakerede',       tone: 'warning' },
      settled:     { label: 'Sonuçlandı',       tone: 'success' },
      rejected:    { label: 'Reddedildi',       tone: 'danger' },
    },
    columns: [
      col('event_date', 'Olay tarihi', 'date', { default: true }),
      col('notice_deadline', 'İhbar son tarihi', 'date', { default: true }),
      col('amount_claimed', 'Talep tutarı', 'money', { default: true }),
      col('assigned_to', 'Sorumlu', 'person'),
      col('notice_type', 'İhbar türü', 'enum', { map: {
        time: { label: 'Süre' }, cost: { label: 'Maliyet' }, both: { label: 'Süre ve maliyet' },
      } }),
      col('time_claimed_days', 'Talep edilen süre (gün)', 'number'),
      col('record_state', 'Kayıt durumu', 'status', { map: RECORD_STATE_MAP }),
      col('contract_ref', 'Sözleşme referansı'),
    ],
    detail: [col('description', 'Açıklama', 'long')],
  },
  {
    key: 'interface', label: 'Arayüz (Interface)', subtitle: 'Disiplinler arası arayüz', roles: TEKNIK_ROLLER,
    historyTracked: true,
    statusMap: {
      open:   { label: 'Açık',    tone: 'primary' },
      agreed: { label: 'Mutabık', tone: 'success' },
      closed: { label: 'Kapalı',  tone: 'muted' },
    },
    columns: [
      col('party_a', 'Taraf A', 'text', { default: true }),
      col('party_b', 'Taraf B', 'text', { default: true }),
      col('due_date', 'Termin', 'date', { default: true }),
      col('assigned_to', 'Sorumlu', 'person'),
      col('interface_type', 'Tür'),
      col('record_state', 'Kayıt durumu', 'status', { map: RECORD_STATE_MAP }),
    ],
    detail: [col('description', 'Açıklama', 'long')],
  },
]

export const RISK_SEVERITY_MAP = {
  'kritik': { label: 'Kritik', tone: 'danger' },
  'yüksek': { label: 'Yüksek', tone: 'warning' },
  'orta':   { label: 'Orta',   tone: 'primary' },
  'düşük':  { label: 'Düşük',  tone: 'muted' },
}

// Risk register'ı: get_register_list 'risk' dalı (RSK numarası, Karar 14) ve get_register_status_history
// (20261023134000). Görünürlük admin, proje yöneticisi, şantiye şefi. Sekmeli eski görünüme (REGISTER_TABS)
// bilinçli olarak eklenmedi; yalnızca menüdeki "Riskler" sayfası kullanır.
export const RISK_TAB = {
  key: 'risk', label: 'Riskler', subtitle: 'Proje riskleri', roles: TEKNIK_ROLLER, historyTracked: true,
  hasPriority: false, defaultSort: { key: 'risk_score', dir: 'desc' },
  statusMap: {
    'açık':         { label: 'Açık',         tone: 'warning' },
    'azaltıldı':    { label: 'Azaltıldı',    tone: 'primary' },
    'kabul_edildi': { label: 'Kabul edildi', tone: 'muted' },
    'kapatıldı':    { label: 'Kapatıldı',    tone: 'success' },
  },
  columns: [
    col('severity', 'Şiddet', 'status', { default: true, map: RISK_SEVERITY_MAP }),
    col('probability', 'Olasılık', 'number', { default: true }),
    col('impact', 'Etki', 'number', { default: true }),
    col('risk_score', 'Skor', 'number', { default: true }),
    col('mitigation_due_date', 'Önlem termini', 'date', { default: true }),
    col('risk_owner', 'Risk sahibi', 'person', { default: true }),
    col('source', 'Kaynak', 'enum', { map: { manuel: { label: 'Elle' }, otomatik: { label: 'Otomatik' } } }),
    col('category', 'Kategori', 'enum', { map: {
      is_kalemi: { label: 'İş kalemi' }, satin_alma: { label: 'Satın alma' }, diger: { label: 'Diğer' },
    } }),
  ],
  detail: [col('description', 'Açıklama', 'long'), col('mitigation', 'Önlem', 'long')],
}

// Görüntüleme kuralı: Karar 6 'G'. 'drawing' doküman sekmesinin süzgecidir, rol kuralı dokümanla aynı.
export function canViewRegister(role, registerKey) {
  const key = registerKey === 'drawing' ? 'document' : registerKey
  const tab = key === 'risk' ? RISK_TAB : REGISTER_TABS.find(t => t.key === key)
  return Boolean(tab && role && tab.roles.includes(role))
}

// Durum süzgeci seçenekleri: register'ın durum haritası, sırası korunur.
export function statusOptions(tab) {
  return Object.entries(tab?.statusMap || {}).map(([value, meta]) => ({ value, label: meta.label }))
}

export function filterByStatus(rows, status) {
  return status ? rows.filter(r => r.status === status) : rows
}

export function visibleRegisterTabs(role) {
  return REGISTER_TABS.filter(t => canViewRegister(role, t.key))
}

// Adresteki ?tur= değerini rolün görebildiği bir sekmeye çözer. Görülemeyen/bilinmeyen değer ilk sekmeye düşer;
// rolün hiç sekmesi yoksa null.
export function resolveRegisterTab(role, requested) {
  const tabs = visibleRegisterTabs(role)
  if (tabs.length === 0) return null
  const key = requested === 'drawing' ? 'document' : requested
  return tabs.find(t => t.key === key) || tabs[0]
}

export function getRegisterTab(key) {
  if (key === 'risk') return RISK_TAB
  return REGISTER_TABS.find(t => t.key === (key === 'drawing' ? 'document' : key)) || null
}

// Tabloda sabit sütunlar + register sütunları + bağlantı sütunları.
export function allColumns(tab) {
  const base = [
    { key: 'no', label: 'Numara', type: 'no', fixed: true },
    { key: 'title', label: 'Başlık', type: 'text', fixed: true },
    { key: 'status', label: 'Durum', type: 'status', fixed: true, map: tab.statusMap },
  ]
  if (tab.hasPriority !== false) base.push({ key: 'priority', label: 'Öncelik', type: 'priority', fixed: true, map: PRIORITY_MAP })
  return [...base, ...tab.columns, ...BAG_SUTUNLARI]
}

export function defaultVisibleColumnKeys(tab) {
  return allColumns(tab).filter(c => c.fixed || c.default).map(c => c.key)
}

// Saklanan numara olduğu gibi gösterilir (ör. RFI-DYB2-0001). Sıralama sondaki sıra numarasına göre.
export function parseRegisterNo(no) {
  const m = /^([A-Z]+)-([A-Z0-9]+)-(\d+)$/.exec(String(no || ''))
  if (!m) return { type: null, project: null, seq: null }
  return { type: m[1], project: m[2], seq: Number(m[3]) }
}

export function formatValue(column, value, { names } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  switch (column.type) {
    case 'date': {
      const s = String(value)
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s // date kolonu: olduğu gibi
      const d = new Date(s) // timestamptz: kullanıcının yerel gününe çevrilir (UTC kesmesi gece yarısı kayardı)
      if (Number.isNaN(d.getTime())) return s
      const p = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    }
    case 'discipline': return disciplineLabel(value)
    case 'money': return Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
    case 'person': return names?.get?.(value)?.full_name || '—'
    case 'enum':
    case 'status':
    case 'priority': return column.map?.[value]?.label || String(value)
    default: return String(value)
  }
}

function sortValue(column, row, names) {
  const v = row[column.key]
  if (column.type === 'no') return parseRegisterNo(v).seq ?? -1
  if (column.type === 'priority') return PRIORITY_RANK[v] ?? 0
  if (column.type === 'money' || column.type === 'number') return v == null ? -Infinity : Number(v)
  if (v == null || v === '') return ''
  return formatValue(column, v, { names }).toLocaleLowerCase('tr-TR')
}

export function sortRows(rows, column, direction = 'asc', names) {
  if (!column) return rows
  const dir = direction === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = sortValue(column, a, names)
    const y = sortValue(column, b, names)
    if (x < y) return -1 * dir
    if (x > y) return 1 * dir
    return 0
  })
}

// Arama görünen sütunların biçimlenmiş metninde (Türkçe küçük harf) yapılır.
export function filterRows(rows, query, columns, names) {
  const q = String(query || '').trim().toLocaleLowerCase('tr-TR')
  if (!q) return rows
  return rows.filter(row => columns.some(c => {
    const text = formatValue(c, row[c.key], { names })
    const extra = c.nameKey && row[c.nameKey] ? ` ${row[c.nameKey]}` : ''
    return `${text}${extra}`.toLocaleLowerCase('tr-TR').includes(q)
  }))
}

export const REGISTER_PAGE_SIZE = 10

export function paginate(rows, page, size = REGISTER_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / size))
  const safePage = Math.min(Math.max(0, page), totalPages - 1)
  return { page: safePage, totalPages, items: rows.slice(safePage * size, safePage * size + size) }
}

export function personIdsIn(rows, tab) {
  const keys = allColumns(tab).filter(c => c.type === 'person').map(c => c.key)
  const ids = new Set()
  for (const r of rows) for (const k of keys) if (r[k]) ids.add(r[k])
  return [...ids]
}
