// docs/is-plani-denetim.md §3'teki doğrulanmış hataların regresyon testleri (H1-H3) ve aynı sınıftan
// saat dilimine bağlı iki hata. Her saat diliminde aynı sonucu vermeli (npm run test:unit üç TZ'de koşar).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveFilterDate } from '../../src/lib/isPlan/filters.js'
import { computeSapma, isTaskLate } from '../../src/lib/isPlan/delay.js'
import { createGanttScale } from '../../src/lib/isPlan/ganttScale.js'
import { formatDate } from '../../src/lib/isPlan/dates.js'

test('H2a: aylık filtre ayın son gününe gider (2026-10-15 → 2026-10-31)', () => {
  assert.equal(effectiveFilterDate('2026-10-15', 'monthly'), '2026-10-31')
  assert.equal(effectiveFilterDate('2027-02-10', 'monthly'), '2027-02-28')
})

test('H2b: haftalık filtre haftanın pazarına gider (perşembe 2026-10-15 → pazar 2026-10-18)', () => {
  assert.equal(effectiveFilterDate('2026-10-15', 'weekly'), '2026-10-18')
  assert.equal(effectiveFilterDate('2026-10-18', 'weekly'), '2026-10-18')
})

test('H3: açık gecikme tam gün sayılır (plan bitiş 2026-10-10, bugün 2026-10-15 → +5)', () => {
  assert.equal(computeSapma({ planned_end: '2026-10-10', status: 'devam_ediyor' }, '2026-10-15'), 5)
})

test('H1: DYB aralığında (2026-09 → 2027-11) her ayın 1. günü, ay başlığının sol kenarıyla aynı pikselde', () => {
  const scale = createGanttScale({ startKey: '2026-09-01', endKey: '2027-11-30' })
  assert.equal(scale.months.length, 15)
  for (const month of scale.months) {
    const drift = scale.x(`${month.key}-01`) - month.left
    assert.ok(Math.abs(drift) < 0.01, `${month.key}: başlık ${month.left.toFixed(1)} px, çubuk ${scale.x(`${month.key}-01`).toFixed(1)} px (fark ${drift.toFixed(1)} px)`)
  }
})

test('tarih metni saat dilimine göre kaymadan biçimlenir (2026-10-15 → 15.10.2026)', () => {
  assert.equal(formatDate('2026-10-15'), '15.10.2026')
})

test('bugün biten görev bugün gecikmiş sayılmaz', () => {
  assert.equal(isTaskLate({ planned_end: '2026-10-15', status: 'devam_ediyor' }, '2026-10-15'), false)
  assert.equal(isTaskLate({ planned_end: '2026-10-14', status: 'devam_ediyor' }, '2026-10-15'), true)
})
