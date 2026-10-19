import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGanttScale, expectedPositionInHeader, fitPxPerDay, ganttRange, gridBackground, MIN_PX_PER_DAY } from '../../src/lib/isPlan/ganttScale.js'

const DYB = { startKey: '2026-09-01', endKey: '2027-11-30' }

test('DYB aralığı: 15 ay, 456 gün; ay genişlikleri gerçek gün sayısıyla ve ardışık', () => {
  const s = createGanttScale(DYB)
  assert.equal(s.months.length, 15)
  assert.equal(s.totalDays, 456)
  assert.equal(s.width, 456 * MIN_PX_PER_DAY)
  let left = 0
  for (const m of s.months) {
    assert.equal(m.left, left, `${m.key} sol kenar`)
    assert.equal(m.width, m.days * s.pxPerDay, `${m.key} genişlik`)
    left += m.width
  }
  assert.equal(left, s.width)
  assert.deepEqual(s.months.slice(0, 3).map(m => m.days), [30, 31, 30])
  assert.equal(s.months.find(m => m.key === '2027-02').days, 28)
})

test('DYB aralığında her gün için çubuk konumu başlıktaki yeriyle aynı (sapma 0 px)', () => {
  const s = createGanttScale(DYB)
  let worst = 0
  for (let d = 0; d < s.totalDays; d += 1) {
    const key = new Date(Date.UTC(2026, 8, 1 + d)).toISOString().slice(0, 10)
    const { px } = expectedPositionInHeader(s, key)
    worst = Math.max(worst, Math.abs(s.x(key) - px))
  }
  assert.equal(worst, 0)
})

test('çubuk: başlangıç ve bitiş günü dahil; bugün çizgisi aynı x()', () => {
  const s = createGanttScale({ ...DYB, pxPerDay: 4 })
  assert.deepEqual(s.span('2026-11-01', '2026-11-30'), { left: 61 * 4, width: 30 * 4 })
  assert.deepEqual(s.span('2026-11-05', '2026-11-05'), { left: 65 * 4, width: 4 })
  const nov = s.months.find(m => m.key === '2026-11')
  assert.equal(s.x('2026-11-01'), nov.left)
  assert.ok(s.contains('2027-11-30') && !s.contains('2027-12-01') && !s.contains('2026-08-31'))
})

test('tikler 1/8/15/22; son tik ay sonuna uzar; tikler ayı tam kaplar', () => {
  const s = createGanttScale(DYB)
  const oct = s.ticks.filter(t => t.key.startsWith('2026-10'))
  assert.deepEqual(oct.map(t => t.label), ['01', '08', '15', '22'])
  assert.deepEqual(oct.map(t => t.width / s.pxPerDay), [7, 7, 7, 10])
  const feb = s.ticks.filter(t => t.key.startsWith('2027-02'))
  assert.deepEqual(feb.map(t => t.width / s.pxPerDay), [7, 7, 7, 7])
  const total = s.ticks.reduce((sum, t) => sum + t.width, 0)
  assert.equal(total, s.width)
  for (const t of s.ticks) assert.equal(t.left, s.x(t.key))
})

test('ganttRange: proje tarihleri ve görev tarihlerini kapsayan tam aylar', () => {
  assert.deepEqual(ganttRange({ projectStart: '2026-09-15', projectEnd: '2027-11-10' }), DYB)
  assert.deepEqual(
    ganttRange({ projectStart: '2026-09-15', projectEnd: '2027-06-10', taskDates: ['2026-08-20', '2027-11-03', null] }),
    { startKey: '2026-08-01', endKey: '2027-11-30' }
  )
  assert.equal(ganttRange({ projectStart: null, projectEnd: null }), null)
})

test('fitPxPerDay: kapsayıcıyı doldurur, en az 3 px', () => {
  assert.equal(fitPxPerDay(0, 456), MIN_PX_PER_DAY)
  assert.equal(fitPxPerDay(900, 456), MIN_PX_PER_DAY)
  assert.equal(fitPxPerDay(1000, 100), 10)
})

test('gridBackground: her tikin sol kenarında bir katman', () => {
  const s = createGanttScale({ startKey: '2026-10-01', endKey: '2026-10-31' })
  const bg = gridBackground(s)
  assert.equal(bg.split('linear-gradient').length - 1, 4)
  assert.match(bg, /21\.00px 0 \/ 1px 100% no-repeat/)
})
