// Saf birim testlerini (node:test, tests-unit/) üç saat diliminde ayrı süreçlerle koşar.
// İş Planı tarih hesapları kullanıcının tarayıcı saat diliminden bağımsız olmalı; UTC+3 (İstanbul), UTC ve
// UTC-7/-8 (Los Angeles) hataların iki yönünü de yakalar. Kullanım: npm run test:unit [-- dosya/desen ...]
import { spawnSync } from 'node:child_process'

const ZONES = ['Europe/Istanbul', 'UTC', 'America/Los_Angeles']
const patterns = process.argv.slice(2)
const files = patterns.length ? patterns : ['tests-unit/**/*.test.mjs']

let failed = 0
for (const tz of ZONES) {
  console.log(`\n=== TZ=${tz} ===`)
  const res = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], {
    stdio: 'inherit',
    env: { ...process.env, TZ: tz },
  })
  if (res.status !== 0) failed += 1
}
console.log(failed ? `\n${failed}/${ZONES.length} saat diliminde başarısız test var.` : `\n${ZONES.length}/${ZONES.length} saat diliminde tüm testler geçti.`)
process.exit(failed ? 1 : 0)
