// Register ekranı saf yardımcılarının birim testleri (node:test; ağ ve veritabanı yok).
// Koşturma: npm run test:unit
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  REGISTER_TABS, canViewRegister, visibleRegisterTabs, resolveRegisterTab, allColumns, defaultVisibleColumnKeys,
  parseRegisterNo, sortRows, filterRows, paginate, formatValue, PRIORITY_MAP, personIdsIn,
  DISCIPLINE_LABELS, disciplineLabel,
} from '../src/lib/register/registerConfig.js'

const ROLLER = ['admin', 'proje_yoneticisi', 'santiye_sefi', 'muhasebe']
const keys = role => visibleRegisterTabs(role).map(t => t.key)

test('Karar 6: rol × alt sekme görünürlüğü', () => {
  const hepsi = ['rfi', 'document', 'decision', 'action', 'submittal', 'material_approval', 'change', 'claim', 'interface']
  assert.deepEqual(keys('admin'), hepsi)
  assert.deepEqual(keys('proje_yoneticisi'), hepsi)
  assert.deepEqual(keys('santiye_sefi'), ['rfi', 'document', 'decision', 'action', 'submittal', 'material_approval', 'interface'])
  assert.deepEqual(keys('muhasebe'), ['change', 'claim'])
  assert.deepEqual(keys(null), [])
  assert.deepEqual(keys('bilinmeyen'), [])
})

test('çizim, doküman kuralını izler; risk ilk sürümde yok', () => {
  for (const r of ROLLER) assert.equal(canViewRegister(r, 'drawing'), canViewRegister(r, 'document'))
  for (const r of ROLLER) assert.equal(canViewRegister(r, 'risk'), false)
  assert.equal(REGISTER_TABS.some(t => t.key === 'risk'), false)
})

test('ön yüz matrisi veritabanındaki register_view_allowed ile aynı', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261020080127_register_okuma_rpc.sql', import.meta.url), 'utf8')
  const govde = sql.slice(sql.indexOf('function public.register_view_allowed'), sql.indexOf('function public.get_register_list'))
  const dallar = [...govde.matchAll(/when p_register in \(([^)]*)\)\s*then coalesce\(p_role in \(([^)]*)\)/g)]
  assert.equal(dallar.length, 2)
  const liste = s => s.split(',').map(x => x.trim().replace(/'/g, ''))
  for (const [, regs, roles] of dallar) {
    for (const reg of liste(regs)) {
      for (const r of ROLLER) assert.equal(canViewRegister(r, reg), liste(roles).includes(r), `${r}/${reg}`)
    }
  }
})

test('adresteki tur değeri rolün görebildiği sekmeye çözülür', () => {
  assert.equal(resolveRegisterTab('muhasebe', 'rfi').key, 'change')
  assert.equal(resolveRegisterTab('muhasebe', 'claim').key, 'claim')
  assert.equal(resolveRegisterTab('santiye_sefi', 'change').key, 'rfi')
  assert.equal(resolveRegisterTab('santiye_sefi', 'drawing').key, 'document')
  assert.equal(resolveRegisterTab('admin', null).key, 'rfi')
  assert.equal(resolveRegisterTab('admin', 'yok').key, 'rfi')
  assert.equal(resolveRegisterTab(null, 'rfi'), null)
})

test('ad ve yan başlıklar', () => {
  assert.equal(REGISTER_TABS.find(t => t.key === 'claim').label, 'Hak Talebi')
  const itf = REGISTER_TABS.find(t => t.key === 'interface')
  assert.equal(itf.label, 'Arayüz (Interface)')
  assert.equal(itf.subtitle, 'Disiplinler arası arayüz')
})

test('durum etiketleri veritabanı CHECK değerlerinin hepsini kapsıyor (19.10.2026 canlı)', () => {
  const check = {
    rfi: ['open', 'under_review', 'answered', 'closed', 'rejected'],
    document: ['active', 'void'],
    decision: ['proposed', 'approved', 'superseded', 'cancelled'],
    action: ['open', 'in_progress', 'done', 'cancelled'],
    submittal: ['draft', 'submitted', 'under_review', 'approved', 'approved_with_comments', 'rejected', 'resubmit_required'],
    material_approval: ['draft', 'submitted', 'approved', 'approved_with_comments', 'rejected', 'expired'],
    change: ['identified', 'submitted', 'approved', 'rejected', 'implemented'],
    claim: ['notice_due', 'notice_sent', 'submitted', 'negotiating', 'settled', 'rejected'],
    interface: ['open', 'agreed', 'closed'],
  }
  for (const t of REGISTER_TABS) {
    for (const s of check[t.key]) {
      assert.ok(t.statusMap[s]?.label, `${t.key}.${s} etiketi yok`)
      assert.ok(['primary', 'success', 'warning', 'danger', 'muted'].includes(t.statusMap[s].tone), `${t.key}.${s} tonu`)
    }
  }
  for (const p of ['low', 'medium', 'high', 'critical']) assert.ok(PRIORITY_MAP[p].label)
})

test('sütunlar: sabit sütunlar, öncelik yalnızca öncelikli register\'larda, bağ sütunları hep var', () => {
  for (const t of REGISTER_TABS) {
    const cols = allColumns(t).map(c => c.key)
    assert.deepEqual(cols.slice(0, 3), ['no', 'title', 'status'])
    for (const k of ['wbs_code', 'area_code', 'task_code']) assert.ok(cols.includes(k), `${t.key} ${k}`)
    assert.equal(cols.includes('priority'), t.hasPriority !== false)
    assert.equal(new Set(cols).size, cols.length, `${t.key} yinelenen sütun`)
    const def = defaultVisibleColumnKeys(t)
    assert.ok(def.includes('no') && def.includes('title') && def.includes('status'))
  }
  assert.equal(allColumns(REGISTER_TABS.find(t => t.key === 'document')).some(c => c.key === 'priority'), false)
})

test('numara: saklanan biçim çözülür, sıralama sıra numarasına göre', () => {
  assert.deepEqual(parseRegisterNo('RFI-DYB2-0001'), { type: 'RFI', project: 'DYB2', seq: 1 })
  assert.deepEqual(parseRegisterNo('DRW-TIZ-10000'), { type: 'DRW', project: 'TIZ', seq: 10000 })
  assert.deepEqual(parseRegisterNo('serbest'), { type: null, project: null, seq: null })
  const no = allColumns(REGISTER_TABS[0]).find(c => c.key === 'no')
  const rows = [{ no: 'RFI-TIZ-0009' }, { no: 'RFI-TIZ-10000' }, { no: 'RFI-TIZ-0010' }]
  assert.deepEqual(sortRows(rows, no, 'asc').map(r => r.no), ['RFI-TIZ-0009', 'RFI-TIZ-0010', 'RFI-TIZ-10000'])
  assert.deepEqual(sortRows(rows, no, 'desc').map(r => r.no), ['RFI-TIZ-10000', 'RFI-TIZ-0010', 'RFI-TIZ-0009'])
})

test('öncelik sıralaması anlam sırasıyla', () => {
  const pr = allColumns(REGISTER_TABS[0]).find(c => c.key === 'priority')
  const rows = ['high', 'low', 'critical', 'medium'].map(priority => ({ priority }))
  assert.deepEqual(sortRows(rows, pr, 'desc').map(r => r.priority), ['critical', 'high', 'medium', 'low'])
})

test('arama Türkçe büyük/küçük harf ve etiket üzerinden', () => {
  const t = REGISTER_TABS[0]
  const cols = allColumns(t).filter(c => c.fixed)
  const rows = [
    { no: 'RFI-TIZ-0001', title: 'İNVERTER köşk yeri', status: 'open', priority: 'high' },
    { no: 'RFI-TIZ-0002', title: 'Kablo kanalı', status: 'answered', priority: 'low' },
  ]
  assert.equal(filterRows(rows, 'inverter', cols).length, 1)
  assert.equal(filterRows(rows, 'cevaplandı', cols)[0].no, 'RFI-TIZ-0002')
  assert.equal(filterRows(rows, 'yüksek', cols)[0].no, 'RFI-TIZ-0001')
  assert.equal(filterRows(rows, '   ', cols).length, 2)
})

test('sayfalama 10 satır, sayfa sınırlanır', () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ i }))
  assert.equal(paginate(rows, 0).items.length, 10)
  assert.equal(paginate(rows, 2).items.length, 3)
  assert.equal(paginate(rows, 9).page, 2)
  assert.equal(paginate([], 0).totalPages, 1)
})

test('biçimlendirme: boş değer, tarih, kişi', () => {
  const tab = REGISTER_TABS[0]
  const due = allColumns(tab).find(c => c.key === 'due_date')
  const kisi = allColumns(tab).find(c => c.key === 'assigned_to')
  assert.equal(formatValue(due, null), '—')
  assert.equal(formatValue(due, '2026-10-20T08:00:00+00:00'), '2026-10-20')
  assert.equal(formatValue(kisi, 'u1', { names: new Map([['u1', { full_name: 'Ayşe' }]]) }), 'Ayşe')
  assert.equal(formatValue(kisi, 'u2', { names: new Map() }), '—')
  assert.deepEqual(personIdsIn([{ assigned_to: 'a', raised_by: 'b' }, { assigned_to: 'a' }], tab).sort(), ['a', 'b'])
})

test('disiplin: anahtar Türkçe etikete, eşlemede olmayan değer ham haliyle', () => {
  const beklenen = { civil: 'İnşaat', mechanical: 'Mekanik', dc: 'DC', ac: 'AC', mv: 'Orta gerilim', hv: 'Yüksek gerilim',
    enh: 'ENH', scada: 'SCADA', general: 'Genel' }
  assert.deepEqual(DISCIPLINE_LABELS, beklenen)
  for (const [k, v] of Object.entries(beklenen)) assert.equal(disciplineLabel(k), v)
  // 19.10.2026 canlı: iki RFI'de serbest metin
  assert.equal(disciplineLabel('Elektrik / Tasarım'), 'Elektrik / Tasarım')
  assert.equal(disciplineLabel('CIVIL'), 'CIVIL')
  assert.equal(disciplineLabel(null), '—')
  assert.equal(disciplineLabel(''), '—')
})

test('disiplin sütunu üç register\'da etiketle biçimlenir ve aranır', () => {
  for (const key of ['rfi', 'document', 'submittal']) {
    const c = allColumns(REGISTER_TABS.find(t => t.key === key)).find(x => x.key === 'discipline')
    assert.equal(c.type, 'discipline', key)
    assert.equal(formatValue(c, 'mv'), 'Orta gerilim')
    assert.equal(formatValue(c, 'Elektrik / Tasarım'), 'Elektrik / Tasarım')
  }
  const c = allColumns(REGISTER_TABS[0]).find(x => x.key === 'discipline')
  const rows = [{ discipline: 'mv' }, { discipline: 'dc' }, { discipline: 'Elektrik / Tasarım' }]
  assert.equal(filterRows(rows, 'orta gerilim', [c]).length, 1)
  assert.equal(filterRows(rows, 'elektrik', [c]).length, 1)
  const sirali = sortRows(rows, c, 'asc').map(r => formatValue(c, r.discipline))
  assert.deepEqual(sirali, ['DC', 'Elektrik / Tasarım', 'Orta gerilim'])
})
test('zaman damgası kullanıcının yerel gününe çevrilir; date değeri olduğu gibi', () => {
  const c = allColumns(REGISTER_TABS[0]).find(x => x.key === 'created_at')
  assert.equal(formatValue(c, '2026-10-15'), '2026-10-15')
  const ts = '2026-10-15T22:30:00Z'
  const d = new Date(ts)
  const beklenen = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  assert.equal(formatValue(c, ts), beklenen)
  assert.equal(formatValue(c, 'tarih değil'), 'tarih değil')
})