import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays, addMonths, daysInclusive, daysInMonth, diffDays, endOfMonth, endOfWeek, formatDate,
  formatMonthLong, monthOf, startOfMonth, startOfWeek, todayKey, toKey, weekday,
} from '../../src/lib/isPlan/dates.js'

test('toKey: geçerli metin, saatli metin; geçersiz ve var olmayan gün null', () => {
  assert.equal(toKey('2026-10-15'), '2026-10-15')
  assert.equal(toKey('2026-10-15T23:59:59+03:00'), '2026-10-15')
  assert.equal(toKey('2026-02-30'), null)
  assert.equal(toKey(''), null)
  assert.equal(toKey(null), null)
  assert.equal(toKey(new Date()), null)
})

test('gün aritmetiği ay/yıl sınırında ve artık yılda', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2027-01-01', -1), '2026-12-31')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(diffDays('2027-11-01', '2026-09-01'), 426)
  assert.equal(daysInclusive('2026-10-15', '2026-10-15'), 1)
  assert.equal(daysInclusive('2026-10-01', '2026-10-31'), 31)
  assert.equal(daysInclusive(null, '2026-10-31'), 0)
})

test('yaz saati geçişi gün farkını bozmaz (Avrupa/ABD Mart ve Ekim/Kasım geçişleri)', () => {
  assert.equal(diffDays('2027-03-29', '2027-03-27'), 2)
  assert.equal(diffDays('2026-11-02', '2026-10-31'), 2)
  assert.equal(addDays('2027-03-13', 2), '2027-03-15')
})

test('ay başı/sonu, ay uzunluğu, ay ekleme', () => {
  assert.equal(startOfMonth('2026-10-15'), '2026-10-01')
  assert.equal(endOfMonth('2026-10-15'), '2026-10-31')
  assert.equal(endOfMonth('2027-02-03'), '2027-02-28')
  assert.equal(endOfMonth('2028-02-03'), '2028-02-29')
  assert.equal(daysInMonth('2026-09-10'), 30)
  assert.equal(addMonths('2026-12-01', 1), '2027-01-01')
  assert.equal(addMonths('2026-09-20', 14), '2027-11-01')
  assert.equal(monthOf('2026-10-15'), '2026-10')
})

test('hafta: pazartesi başlar, pazar biter', () => {
  assert.equal(weekday('2026-10-15'), 4)
  assert.equal(startOfWeek('2026-10-15'), '2026-10-12')
  assert.equal(endOfWeek('2026-10-15'), '2026-10-18')
  assert.equal(startOfWeek('2026-10-18'), '2026-10-12')
  assert.equal(endOfWeek('2026-10-12'), '2026-10-18')
  assert.equal(endOfWeek('2026-12-28'), '2027-01-03')
})

test('todayKey İstanbul gününü verir, tarayıcı saat diliminden bağımsız', () => {
  // 2026-10-14 21:30 UTC = İstanbul 2026-10-15 00:30, Los Angeles 2026-10-14 14:30
  const instant = new Date(Date.UTC(2026, 9, 14, 21, 30))
  assert.equal(todayKey('Europe/Istanbul', instant), '2026-10-15')
  assert.equal(todayKey('UTC', instant), '2026-10-14')
  assert.equal(todayKey(undefined, instant), '2026-10-15')
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/)
})

test('biçimleme: gg.aa.yyyy, kısa yıl, boş değer, ay adı', () => {
  assert.equal(formatDate('2026-10-15'), '15.10.2026')
  assert.equal(formatDate('2026-10-15', { shortYear: true }), '15.10.26')
  assert.equal(formatDate(null), '-')
  assert.equal(formatMonthLong('2026-10-31'), 'Ekim 2026')
  assert.equal(formatMonthLong('2027-02-01'), 'Şubat 2027')
})
