// Koşucunun gerçekten istenen saat diliminde çalıştığını doğrular (TZ ortam değişkeni yok sayılırsa diğer
// testlerin geçmesi anlamsız olur).
import { test } from 'node:test'
import assert from 'node:assert/strict'

const EXPECTED_OFFSET = { 'Europe/Istanbul': -180, UTC: 0, 'America/Los_Angeles': 420 }

test(`saat dilimi uygulandı (TZ=${process.env.TZ || 'tanımsız'})`, () => {
  const tz = process.env.TZ
  if (!(tz in EXPECTED_OFFSET)) return
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, tz)
  // 2026-10-15 yerel öğlen: Los Angeles yaz saatinde (-420 dk), İstanbul sabit +3.
  assert.equal(new Date(2026, 9, 15, 12).getTimezoneOffset(), EXPECTED_OFFSET[tz])
})
