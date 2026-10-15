import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeSapma, isTaskLate } from '../../src/lib/isPlan/delay.js'
import { effectiveFilterDate, matchesStatusFilter, taskKpis } from '../../src/lib/isPlan/filters.js'
import { deriveTaskStatusAt, pctFromDailyProgress, progressFor } from '../../src/lib/isPlan/progress.js'
import { todayKey } from '../../src/lib/isPlan/dates.js'

const open = (planned_end, extra = {}) => ({ planned_end, status: 'devam_ediyor', ...extra })

test('isTaskLate: plan bitişi asOf öncesi ve açık; kapalı ve tarihsiz görev gecikmiş değil', () => {
  assert.equal(isTaskLate(open('2026-10-14'), '2026-10-15'), true)
  assert.equal(isTaskLate(open('2026-10-15'), '2026-10-15'), false)
  assert.equal(isTaskLate(open('2026-10-14', { status: 'tamamlandi' }), '2026-10-15'), false)
  assert.equal(isTaskLate(open('2026-10-14', { status: 'iptal' }), '2026-10-15'), false)
  assert.equal(isTaskLate(open(null), '2026-10-15'), false)
})

test('asOf verilmezse bugün (Europe/Istanbul)', () => {
  const today = todayKey()
  assert.equal(isTaskLate(open(today)), false)
  assert.equal(computeSapma(open('2000-01-01')) > 0, true)
})

test('computeSapma: gerçek bitiş, açık gecikme, ileride, kapalı', () => {
  assert.equal(computeSapma({ planned_end: '2026-10-10', actual_end: '2026-10-13' }, '2026-10-20'), 3)
  assert.equal(computeSapma({ planned_end: '2026-10-10', actual_end: '2026-10-08' }, '2026-10-20'), -2)
  assert.equal(computeSapma(open('2026-10-10'), '2026-10-15'), 5)
  assert.equal(computeSapma(open('2026-10-15'), '2026-10-15'), null)
  assert.equal(computeSapma(open('2026-10-20'), '2026-10-15'), null)
  assert.equal(computeSapma(open('2026-10-10', { status: 'tamamlandi' }), '2026-10-15'), null)
  assert.equal(computeSapma(open('2026-09-30'), '2027-01-01'), 93)
})

test('effectiveFilterDate: günlük, haftalık, aylık, yıl sonu, boş tarih', () => {
  assert.equal(effectiveFilterDate('2026-10-15', 'daily'), '2026-10-15')
  assert.equal(effectiveFilterDate('2026-12-29', 'weekly'), '2027-01-03')
  assert.equal(effectiveFilterDate('2026-12-29', 'monthly'), '2026-12-31')
  assert.equal(effectiveFilterDate('2026-11-30', 'monthly'), '2026-11-30')
  assert.equal(effectiveFilterDate('', 'daily', '2026-10-15'), '2026-10-15')
  assert.equal(effectiveFilterDate(null, 'monthly', '2026-10-15'), '2026-10-31')
})

test('durum filtresi ve KPI: iptal yalnızca kendi filtresinde, KPI dışında', () => {
  const tasks = [
    open('2026-10-10'),
    open('2026-10-20'),
    { planned_end: '2026-10-01', status: 'tamamlandi' },
    { planned_end: '2026-10-01', status: 'iptal' },
  ]
  const asOf = '2026-10-15'
  assert.deepEqual(tasks.map(t => matchesStatusFilter(t, 'all', asOf)), [true, true, true, false])
  assert.deepEqual(tasks.map(t => matchesStatusFilter(t, 'iptal', asOf)), [false, false, false, true])
  assert.deepEqual(tasks.map(t => matchesStatusFilter(t, 'geciken', asOf)), [true, false, false, false])
  assert.deepEqual(taskKpis(tasks, asOf), { total: 3, ongoing: 2, risky: 1 })
})

test('ilerleme ve durum türetme (eski davranış korunur)', () => {
  assert.equal(progressFor({ id: 'a', progress_pct: 40 }, { a: 62.4 }), 62)
  assert.equal(progressFor({ id: 'b', progress_pct: 40.6 }, {}), 41)
  assert.equal(deriveTaskStatusAt({ target_qty: 0, status: 'askida' }, 0, '2026-10-15'), 'askida')
  assert.equal(deriveTaskStatusAt({ target_qty: 10, status: 'devam_ediyor' }, 100, '2026-10-15'), 'tamamlandi')
  assert.equal(deriveTaskStatusAt({ target_qty: 10, planned_start: '2026-10-16' }, 0, '2026-10-15'), 'bekliyor')
  assert.equal(deriveTaskStatusAt({ target_qty: 10, planned_start: '2026-10-15', status: 'beklemede' }, 5, '2026-10-15'), 'devam_ediyor')
  assert.equal(pctFromDailyProgress(200, [{ qty_added: 30 }, { qty_added: 20 }]), 25)
  assert.equal(pctFromDailyProgress(0, [{ qty_added: 30 }]), 0)
})
