// Sihirbaz iş kalemi kilidinin birim testleri (node:test; ağ ve veritabanı yok).
// Koşturma: npm run test:unit
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TASK_LOCK_CHECKS, LINKED_RECORD_TABLES, summarizeTaskLock, taskLockMessage, fetchProjectTaskLock,
} from '../src/utils/projectTaskLock.js'

const allZero = () => Object.fromEntries(TASK_LOCK_CHECKS.map(c => [c.table, 0]))

test('veri taşımayan proje kilitlenmez', () => {
  const s = summarizeTaskLock(allZero())
  assert.equal(s.locked, false)
  assert.deepEqual(s.reasons, [])
  assert.equal(taskLockMessage(s), null)
})

test('her kilit sebebi tek başına kilitler', () => {
  for (const check of TASK_LOCK_CHECKS) {
    const s = summarizeTaskLock({ ...allZero(), [check.table]: 1 })
    assert.equal(s.locked, true, check.table)
    assert.equal(s.reasons.length, 1, check.table)
  }
})

test('DYB1 benzeri sayılar: bağımlılık ve aylık plan mesajda', () => {
  const s = summarizeTaskLock({ ...allZero(), task_dependencies: 74, task_monthly_plan: 109 })
  assert.equal(s.locked, true)
  assert.deepEqual(s.reasons.map(r => [r.key, r.count]), [['dependencies', 74], ['monthlyPlan', 109]])
  const msg = taskLockMessage(s)
  assert.match(msg, /74 öncül\/ardıl bağımlılığı ve 109 aylık plan satırı var\./)
  assert.match(msg, /sihirbazdan kaydedilemez/)
})

test('göreve bağlı kayıtlar tek satırda toplanır (DYB2: 2 RFI + 1 günlük rapor görevi)', () => {
  const s = summarizeTaskLock({ ...allZero(), rfis: 2, daily_tasks: 1 })
  assert.deepEqual(s.reasons, [{ key: 'linked', label: 'göreve bağlı kayıt', count: 3 }])
})

test('sayısı bilinmeyen tablo kilitler (fail-closed)', () => {
  const counts = allZero()
  counts.task_monthly_plan = null
  const s = summarizeTaskLock(counts)
  assert.equal(s.locked, true)
  assert.equal(s.unknown, true)
  assert.match(taskLockMessage(s), /kontrol edilemedi/)
})

test('kontrol listesi istenen beş başlığı kapsar', () => {
  const keys = new Set(TASK_LOCK_CHECKS.map(c => c.key))
  for (const k of ['dependencies', 'monthlyPlan', 'progress', 'wbs', 'linked']) assert.ok(keys.has(k), k)
  for (const t of LINKED_RECORD_TABLES) {
    assert.ok(TASK_LOCK_CHECKS.some(c => c.table === t && c.notNull === 'task_id'), t)
  }
})

// Supabase sorgu zincirini kaydeden sahte istemci. Yalnızca select/eq/not destekler;
// insert/update/delete çağrılırsa test düşer (modül yalnızca okumalı).
function fakeClient(countFor) {
  const calls = []
  const client = {
    from(table) {
      const call = { table, select: null, opts: null, eq: [], not: [] }
      calls.push(call)
      const builder = {
        select(cols, opts) { call.select = cols; call.opts = opts; return builder },
        eq(col, val) { call.eq.push([col, val]); return builder },
        not(col, op, val) { call.not.push([col, op, val]); return builder },
        insert() { throw new Error('yazma yasak') },
        update() { throw new Error('yazma yasak') },
        delete() { throw new Error('yazma yasak') },
        then(resolve, reject) { return Promise.resolve(countFor(call)).then(resolve, reject) },
      }
      return builder
    },
  }
  return { client, calls }
}

test('fetchProjectTaskLock: doğru tablolara, proje filtresiyle, yalnızca sayım sorgusu atar', async () => {
  const { client, calls } = fakeClient(() => ({ count: 0, error: null }))
  const res = await fetchProjectTaskLock(client, 'proje-x')
  assert.equal(res.locked, false)
  assert.equal(calls.length, TASK_LOCK_CHECKS.length)
  for (const c of calls) {
    assert.deepEqual(c.opts, { count: 'exact', head: true }, c.table)
    const projFilter = c.eq.find(([col]) => col === 'project_id' || col === 'project_tasks.project_id')
    assert.deepEqual(projFilter?.[1], 'proje-x', c.table)
  }
  const pd = calls.find(c => c.table === 'progress_daily')
  assert.match(pd.select, /project_tasks!inner\(project_id\)/)
  assert.deepEqual(pd.eq, [['project_tasks.project_id', 'proje-x']])
  const wbs = calls.find(c => c.table === 'project_tasks')
  assert.deepEqual(wbs.not, [['wbs_id', 'is', null]])
  const rfis = calls.find(c => c.table === 'rfis')
  assert.deepEqual(rfis.not, [['task_id', 'is', null]])
  const deps = calls.find(c => c.table === 'task_dependencies')
  assert.deepEqual(deps.not, [])
})

test('fetchProjectTaskLock: sorgu hatası kilitler, mesaj döner', async () => {
  const { client } = fakeClient(call => call.table === 'task_monthly_plan'
    ? { count: null, error: { message: 'permission denied' } }
    : { count: 0, error: null })
  const res = await fetchProjectTaskLock(client, 'p')
  assert.equal(res.locked, true)
  assert.equal(res.unknown, true)
  assert.match(res.message, /kontrol edilemedi/)
})

test('fetchProjectTaskLock: sayılar mesaja yansır', async () => {
  const counts = { task_dependencies: 74, task_monthly_plan: 109 }
  const { client } = fakeClient(call => ({ count: counts[call.table] ?? 0, error: null }))
  const res = await fetchProjectTaskLock(client, 'isdemir-diyarbakir-arazi-faz1')
  assert.equal(res.locked, true)
  assert.match(res.message, /74 öncül\/ardıl bağımlılığı ve 109 aylık plan satırı/)
})
