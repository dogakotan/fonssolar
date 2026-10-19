import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MILESTONE_STATUS_OPTIONS, milestoneStatusMenu, SITE_CHIEF_CANCELLED_REASON } from '../../src/lib/isPlan/statusMenu.js'

const values = menu => menu.options.map(opt => opt.v)

test('admin ve proje yöneticisi: beş seçenek, iptal dahil, her durumda düzenlenebilir', () => {
  for (const role of ['admin', 'proje_yoneticisi']) {
    for (const status of ['beklemede', 'devam_ediyor', 'iptal']) {
      const menu = milestoneStatusMenu(role, status)
      assert.deepEqual(values(menu), MILESTONE_STATUS_OPTIONS.map(opt => opt.v))
      assert.equal(menu.readOnly, false)
      assert.equal(menu.reason, '')
    }
  }
})

test('şantiye şefi, iptal olmayan görev: İptal seçeneği yok, düzenlenebilir', () => {
  for (const status of ['beklemede', 'devam_ediyor', 'tamamlandi', 'askida']) {
    const menu = milestoneStatusMenu('santiye_sefi', status)
    assert.deepEqual(values(menu), ['beklemede', 'devam_ediyor', 'tamamlandi', 'askida'])
    assert.equal(menu.readOnly, false)
  }
})

test('şantiye şefi, iptal edilmiş görev: yalnızca İptal görünür, salt okunur, gerekçe var', () => {
  const menu = milestoneStatusMenu('santiye_sefi', 'iptal')
  assert.deepEqual(values(menu), ['iptal'])
  assert.equal(menu.readOnly, true)
  assert.equal(menu.reason, SITE_CHIEF_CANCELLED_REASON)
})

test('rol bilinmiyorsa (yükleniyor) kısıtlama uygulanmaz; DB yine korur', () => {
  assert.equal(milestoneStatusMenu(null, 'iptal').readOnly, false)
})
