// Menü bölümleri, register menü öğeleri, uyarı sayımları ve risk yapılandırması (node:test; ağ ve veritabanı yok).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  REGISTER_MENU_ITEMS, registerForTab, groupSidebarItems, canSeeAlert, alertCounts, menuBadge,
  ALERT_CARDS, visibleAlertCards,
} from '../src/lib/menu/sidebarMenu.js'
import {
  RISK_TAB, getRegisterTab, allColumns, statusOptions, filterByStatus, canViewRegister, REGISTER_TABS, parseRegisterNo,
} from '../src/lib/register/registerConfig.js'

const ROLLER = ['admin', 'proje_yoneticisi', 'santiye_sefi', 'muhasebe']
const SECTIONS = [
  { section_key: 'yonetim', label: 'Yönetim', order_index: 7 },
  { section_key: 'proje', label: 'Proje', order_index: 1 },
  { section_key: 'ticari', label: 'Ticari', order_index: 4 },
]

test('gruplama: bölümsüz en üstte başlıksız, bölümler sırasıyla, boş bölüm yok', () => {
  const groups = groupSidebarItems(
    ['genel', 'projeler', 'register-change', 'kullanicilar', 'tanimsiz'],
    { projeler: 'proje', 'register-change': 'ticari', kullanicilar: 'yonetim', tanimsiz: 'olmayan-bolum' },
    SECTIONS,
  )
  assert.deepEqual(groups.map(g => [g.label, g.items]), [
    [null, ['genel', 'tanimsiz']],
    ['Proje', ['projeler']],
    ['Ticari', ['register-change']],
    ['Yönetim', ['kullanicilar']],
  ])
  // Muhasebe: yalnızca Ticari; Proje ve Yönetim bölümü hiç çizilmez
  const muh = groupSidebarItems(['genel', 'register-change', 'register-claim'], { 'register-change': 'ticari', 'register-claim': 'ticari' }, SECTIONS)
  assert.deepEqual(muh.map(g => g.label), [null, 'Ticari'])
})

test('gruplama: bölüm bilgisi yoksa (migration öncesi) düz liste', () => {
  assert.deepEqual(groupSidebarItems(['genel', 'projeler'], undefined, undefined), [{ key: null, label: null, items: ['genel', 'projeler'] }])
  assert.deepEqual(groupSidebarItems([], {}, SECTIONS), [])
})

test('register menü öğeleri: anahtar → register kodu', () => {
  assert.equal(registerForTab('register-material-approval'), 'material_approval')
  assert.equal(registerForTab('register-drawing'), 'drawing')
  assert.equal(registerForTab('register-risk'), 'risk')
  assert.equal(registerForTab('register'), null)
  assert.equal(registerForTab('genel'), null)
  for (const [key, meta] of Object.entries(REGISTER_MENU_ITEMS)) {
    assert.ok(getRegisterTab(meta.register), `${key} için yapılandırma var`)
  }
})

test('migration dosyasındaki rol listesi ön yüz yetki kuralıyla aynı', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261023130558_menu_bolumler.sql', import.meta.url), 'utf8')
  const rows = [...sql.matchAll(/\('(register-[a-z-]+)',\s*'[a-z-]+',\s*\d+,\s*array\[([^\]]*)\]\)/g)]
  assert.equal(rows.length, Object.keys(REGISTER_MENU_ITEMS).length)
  for (const [, key, roles] of rows) {
    const sqlRoles = roles.split(',').map(s => s.trim().replace(/'/g, ''))
    const reg = REGISTER_MENU_ITEMS[key].register
    assert.deepEqual(sqlRoles, ROLLER.filter(r => canViewRegister(r, reg)), key)
  }
})

const ALERTS = [
  { alert_type: 'rfi_overdue', register_code: 'rfi' },
  { alert_type: 'rfi_overdue', register_code: 'rfi' },
  { alert_type: 'decision_overdue', register_code: 'decision' },
  { alert_type: 'action_overdue', register_code: 'action' },
  { alert_type: 'claim_notice_due', register_code: 'claim' },
  { alert_type: 'critical_material_due', register_code: 'procurement' },
  { alert_type: 'risk_mitigation_overdue', register_code: 'risk' },
]

test('uyarılar: rolün göremediği register sayılmaz', () => {
  assert.deepEqual(alertCounts(ALERTS, 'muhasebe'), { claim_notice_due: 1 })
  assert.deepEqual(alertCounts(ALERTS, 'santiye_sefi'), {
    rfi_overdue: 2, decision_overdue: 1, action_overdue: 1, critical_material_due: 1, risk_mitigation_overdue: 1,
  })
  assert.equal(Object.values(alertCounts(ALERTS, 'admin')).reduce((a, b) => a + b, 0), ALERTS.length)
  assert.equal(canSeeAlert('muhasebe', { register_code: 'procurement' }), false)
  assert.deepEqual(alertCounts(null, 'admin'), {})
})

test('rozet: yalnızca RFI, aksiyon, karar, claim; 0 ise yok', () => {
  const counts = alertCounts(ALERTS, 'admin')
  assert.equal(menuBadge('register-rfi', counts), 2)
  assert.equal(menuBadge('register-claim', counts), 1)
  assert.equal(menuBadge('register-risk', counts), null)
  assert.equal(menuBadge('register-rfi', {}), null)
  assert.equal(menuBadge('genel', counts), null)
})

test('Genel ekran kartları: beş tür, sayısı 0 olan gizli', () => {
  assert.deepEqual(ALERT_CARDS.map(c => c.type), ['rfi_overdue', 'decision_overdue', 'action_overdue', 'claim_notice_due', 'critical_material_due'])
  assert.deepEqual(visibleAlertCards(alertCounts(ALERTS, 'muhasebe')).map(c => [c.type, c.count]), [['claim_notice_due', 1]])
  assert.deepEqual(visibleAlertCards({}), [])
})

test('risk: get_register_list kolonları, RSK numara sütunu, geçmiş tutuluyor, etiketler CHECK değerlerini kapsıyor', () => {
  const keys = allColumns(RISK_TAB).map(c => c.key)
  assert.equal(keys[0], 'no')
  for (const k of ['title', 'status', 'severity', 'probability', 'impact', 'risk_score', 'mitigation_due_date', 'risk_owner', 'wbs_code', 'area_code', 'task_code']) {
    assert.ok(keys.includes(k), k)
  }
  assert.equal(keys.includes('priority'), false)
  assert.equal(RISK_TAB.historyTracked, true)
  assert.deepEqual(parseRegisterNo('RSK-TIZ-0012'), { type: 'RSK', project: 'TIZ', seq: 12 })
  assert.deepEqual(Object.keys(RISK_TAB.statusMap), ['açık', 'azaltıldı', 'kabul_edildi', 'kapatıldı'])
  assert.deepEqual(Object.keys(allColumns(RISK_TAB).find(c => c.key === 'severity').map), ['kritik', 'yüksek', 'orta', 'düşük'])
})

test('durum geçmişi: get_register_status_history listesindeki register\'larla aynı (20261023134000)', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261023134000_register_role_hardening_risk_numbering_alert_filter.sql', import.meta.url), 'utf8')
  const m = /p_register not in \(([^)]*)\)/.exec(sql)
  const tracked = m[1].split(',').map(s => s.trim().replace(/'/g, '')).sort()
  const ui = [...REGISTER_TABS, RISK_TAB].filter(t => t.historyTracked).map(t => t.key).sort()
  assert.deepEqual(ui, tracked)
})

test('durum süzgeci', () => {
  assert.deepEqual(statusOptions(RISK_TAB)[0], { value: 'açık', label: 'Açık' })
  const rows = [{ status: 'açık' }, { status: 'kapatıldı' }, { status: 'açık' }]
  assert.equal(filterByStatus(rows, 'açık').length, 2)
  assert.equal(filterByStatus(rows, '').length, 3)
})
