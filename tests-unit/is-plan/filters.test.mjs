// 3A ortak filtreler: adres çubuğu okuma/yazma ve filterTasks birleşimleri. npm run test:unit üç saat diliminde koşar;
// ay sınırı ve "geciken" hesabı gün anahtarıyla yapıldığı için sonuç saat diliminden bağımsız olmalı.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FILTERS, filterTasks, hasFilterParams, isFiltered, normalizeFilters, parseFilterParams, responsibleLabel,
  SORUMLUSUZ, taskOverlapsMonth, writeFilterParams,
} from '../../src/lib/isPlan/filters.js'

const T = (id, extra = {}) => ({
  id, task_code: id, task_name: `Görev ${id}`, group_label: 'Mekanik', category: 'kolon_montaji',
  planned_start: '2026-10-01', planned_end: '2026-10-31', status: 'devam_ediyor', ...extra,
})

const tasks = [
  T('M1'),
  T('M2', { planned_end: '2026-10-10' }),                                            // 20.10'da gecikmiş
  T('E1', { group_label: 'Elektrik', category: 'elektrik_dc', responsible: 'Ali Usta' }),
  T('E2', { group_label: 'Elektrik', category: 'elektrik_dc', responsible_role: 'Elektrik Şefi', status: 'beklemede',
    planned_start: '2026-11-01', planned_end: '2026-11-30' }),
  T('İ1', { task_name: 'İşletme Binası', status: 'tamamlandi', planned_end: '2026-10-05' }),
  T('X1', { status: 'iptal', planned_end: '2026-10-01' }),
  T('S1', { status: 'askida', planned_start: '2026-09-01', planned_end: '2026-09-15' }),
]
const asOf = '2026-10-20'
const ids = list => list.map(t => t.id)

test('varsayılan filtre her görevi (iptal dahil) gösterir', () => {
  assert.deepEqual(ids(filterTasks(tasks, DEFAULT_FILTERS, { asOf })), ids(tasks))
  assert.equal(isFiltered(DEFAULT_FILTERS), false)
})

test('durum: ham durumlar ve geciken (kapalı ve iptal hariç)', () => {
  const by = durum => ids(filterTasks(tasks, { durum }, { asOf }))
  assert.deepEqual(by('devam'), ['M1', 'M2', 'E1'])
  assert.deepEqual(by('beklemede'), ['E2'])
  assert.deepEqual(by('tamamlandi'), ['İ1'])
  assert.deepEqual(by('askida'), ['S1'])
  assert.deepEqual(by('iptal'), ['X1'])
  assert.deepEqual(by('geciken'), ['M2', 'S1'])
})

test('grup, kategori, sorumlu ve arama birlikte (VE)', () => {
  assert.deepEqual(ids(filterTasks(tasks, { grup: 'Elektrik' }, { asOf })), ['E1', 'E2'])
  assert.deepEqual(ids(filterTasks(tasks, { kategori: 'elektrik_dc', sorumlu: 'Elektrik Şefi' }, { asOf })), ['E2'])
  assert.deepEqual(ids(filterTasks(tasks, { sorumlu: 'Ali Usta', durum: 'beklemede' }, { asOf })), [])
  // Sorumlusuz: ne kişi ne rol atanmış (E1 kişili, E2 rollü)
  assert.deepEqual(ids(filterTasks(tasks, { sorumlu: SORUMLUSUZ }, { asOf })), ['M1', 'M2', 'İ1', 'X1', 'S1'])
  assert.deepEqual(parseFilterParams(writeFilterParams(new URLSearchParams(), { sorumlu: SORUMLUSUZ })).sorumlu, SORUMLUSUZ)
  // Türkçe büyük/küçük harf: "işletme" → "İşletme Binası"; kodda arama
  assert.deepEqual(ids(filterTasks(tasks, { q: 'işletme' }, { asOf })), ['İ1'])
  assert.deepEqual(ids(filterTasks(tasks, { q: '  e2 ' }, { asOf })), ['E2'])
  // groupOf verilirse grup anahtarı ondan gelir
  assert.deepEqual(ids(filterTasks(tasks, { grup: 'ELK' }, { asOf, groupOf: t => (t.group_label === 'Elektrik' ? 'ELK' : 'X') })), ['E1', 'E2'])
})

test('bu ay: plan aralığı referans ayla çakışan; inMonth verilirse o kullanılır', () => {
  assert.deepEqual(ids(filterTasks(tasks, { buAy: true }, { asOf })), ['M1', 'M2', 'E1', 'İ1', 'X1'])
  assert.deepEqual(ids(filterTasks(tasks, { buAy: true }, { asOf, inMonth: t => t.id === 'E2' })), ['E2'])
  assert.equal(taskOverlapsMonth(T('a', { planned_start: '2026-09-30', planned_end: '2026-10-01' }), asOf), true)
  assert.equal(taskOverlapsMonth(T('b', { planned_start: '2026-11-01', planned_end: '2026-11-02' }), asOf), false)
  assert.equal(taskOverlapsMonth(T('c', { planned_start: '2026-10-31', planned_end: null }), asOf), true)
  assert.equal(taskOverlapsMonth(T('d', { planned_start: null, planned_end: null }), asOf), false)
})

test('sorumlu etiketi: kişi, yoksa rol, boşluklar kırpılır', () => {
  assert.equal(responsibleLabel({ responsible: ' Ali ', responsible_role: 'Şef' }), 'Ali')
  assert.equal(responsibleLabel({ responsible_role: 'Şef' }), 'Şef')
  assert.equal(responsibleLabel({}), '')
})

test('adres çubuğu: yaz/oku gidiş-dönüş, varsayılanlar yazılmaz, diğer parametreler korunur', () => {
  const f = { q: 'kablo', grup: 'Elektriksel Bölüm › TR-1', durum: 'geciken', kategori: 'elektrik_dc', sorumlu: 'Elektrik Şefi', buAy: true }
  const p = writeFilterParams(new URLSearchParams('view=detay&talep=5'), f)
  assert.equal(p.get('view'), 'detay')
  assert.equal(p.get('talep'), '5')
  assert.equal(p.get('buay'), '1')
  assert.deepEqual(parseFilterParams(new URLSearchParams(p.toString())), f)
  assert.equal(hasFilterParams(p), true)

  const cleared = writeFilterParams(p, { ...DEFAULT_FILTERS, q: '   ' })
  assert.equal(cleared.toString(), 'view=detay&talep=5')
  assert.equal(hasFilterParams(cleared), false)
})

test('bilinmeyen değerler varsayılana düşer', () => {
  assert.deepEqual(parseFilterParams(new URLSearchParams('durum=yok&buay=evet&grup=')), { ...DEFAULT_FILTERS })
  assert.deepEqual(normalizeFilters({ durum: 'iptal', buAy: 'true' }), { ...DEFAULT_FILTERS, durum: 'iptal', buAy: true })
})
