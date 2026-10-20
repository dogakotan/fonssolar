// Register ekranı için taklit Supabase: oturum, rol/navigasyon ve register okuma fonksiyonları.
// Kurgu veri — gerçek proje/kişi verisi değil. Rol görünürlüğü burada Karar 6'dan ELLE yazıldı (ön yüz yardımcısından
// içe aktarılmaz), böylece ekran ile beklenti bağımsız karşılaştırılır.

export const MOCK_HOST = '127.0.0.1:54399'

export const USERS = {
  admin:            { id: '00000000-0000-4000-8000-000000000001', name: 'Kurgu Admin',  projects: ['tiz', 'dyb'] },
  proje_yoneticisi: { id: '00000000-0000-4000-8000-000000000002', name: 'Kurgu PM',     projects: ['tiz', 'dyb'] },
  santiye_sefi:     { id: '00000000-0000-4000-8000-000000000003', name: 'Kurgu Şef',    projects: ['tiz'] },
  muhasebe:         { id: '00000000-0000-4000-8000-000000000004', name: 'Kurgu Muhasebe', projects: ['tiz', 'dyb'] },
}

const PROJECTS = {
  tiz: { id: 'kurgu-izmir', name: 'Kurgu İzmir GES', prefix: 'TIZ' },
  dyb: { id: 'kurgu-diyarbakir', name: 'Kurgu Diyarbakır GES', prefix: 'DYB2' },
}

// Karar 6, "G"
export const EXPECTED_TABS = {
  admin:            ['RFI', 'Doküman', 'Karar', 'Aksiyon', 'Teknik Sunum', 'Malzeme Onayı', 'Değişiklik', 'Hak Talebi', 'Arayüz (Interface)'],
  proje_yoneticisi: ['RFI', 'Doküman', 'Karar', 'Aksiyon', 'Teknik Sunum', 'Malzeme Onayı', 'Değişiklik', 'Hak Talebi', 'Arayüz (Interface)'],
  santiye_sefi:     ['RFI', 'Doküman', 'Karar', 'Aksiyon', 'Teknik Sunum', 'Malzeme Onayı', 'Arayüz (Interface)'],
  muhasebe:         ['Değişiklik', 'Hak Talebi'],
}
const VIEW = {
  admin: 'all', proje_yoneticisi: 'all',
  santiye_sefi: ['document', 'drawing', 'rfi', 'decision', 'action', 'submittal', 'material_approval', 'interface'],
  muhasebe: ['change', 'claim'],
}
const canView = (role, reg) => VIEW[role] === 'all' || VIEW[role].includes(reg)

const NAV = {
  admin:            { tabs_unrestricted: true,  default_tab: null,    tabs: [], sidebar: ['genel', 'projeler', 'satin-alma', 'finans', 'tickets', 'bildirimler', 'proje-ekle', 'kullanicilar', 'register'] },
  proje_yoneticisi: { tabs_unrestricted: false, default_tab: 'genel', tabs: ['genel', 'projeler', 'satin-alma', 'tickets', 'kullanicilar', 'proje-ekle', 'bildirimler', 'finans', 'register'], sidebar: ['genel', 'projeler', 'satin-alma', 'tickets', 'bildirimler', 'proje-ekle', 'kullanicilar', 'finans', 'register'] },
  santiye_sefi:     { tabs_unrestricted: false, default_tab: 'genel', tabs: ['genel', 'is-plani', 'daily-report', 'rapor-listesi', 'satin-alma', 'tickets', 'bildirimler', 'register'], sidebar: ['genel', 'is-plani', 'rapor-listesi', 'satin-alma', 'tickets', 'bildirimler', 'register'] },
  muhasebe:         { tabs_unrestricted: false, default_tab: 'genel', tabs: ['genel', 'finans', 'satin-alma', 'bildirimler', 'odemeler', 'register'], sidebar: ['genel', 'finans', 'satin-alma', 'bildirimler', 'odemeler', 'register'] },
}

const PEOPLE = {
  'aaaaaaaa-0000-4000-8000-000000000001': 'Kurgu Mühendis A',
  'aaaaaaaa-0000-4000-8000-000000000002': 'Kurgu Mühendis B',
}
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002'

const pad = n => String(n).padStart(4, '0')
const id = (k, n) => `bbbbbbbb-${k.padEnd(4, '0').slice(0, 4)}-4000-8000-${String(n).padStart(12, '0')}`
const RFI_STATUS = ['open', 'under_review', 'answered', 'closed', 'rejected']
const PRIO = ['low', 'medium', 'high', 'critical']

function rfiRows(prefix) {
  return Array.from({ length: 13 }, (_, i) => ({
    id: id('rfi', i + 1), no: `RFI-${prefix}-${pad(i + 1)}`,
    title: i === 0 ? 'Kurgu: inverter köşkü temel kotu' : `Kurgu RFI konusu ${i + 1}`,
    status: RFI_STATUS[i % 5], priority: PRIO[i % 4],
    raised_date: `2026-10-${String(1 + i).padStart(2, '0')}`, due_date: `2026-11-${String(1 + i).padStart(2, '0')}`,
    answered_date: i % 5 === 2 ? '2026-10-15' : null, discipline: i % 2 ? 'dc' : 'civil',
    raised_by: P2, assigned_to: i % 3 ? P1 : null,
    question: 'Kurgu soru metni.', description: null, response: i % 5 === 2 ? 'Kurgu cevap.' : null,
    wbs_code: null, wbs_name: null, area_code: null, area_name: null,
    // Karar 69: mevcut görev bağı salt okunur görünür
    task_code: i === 0 ? 'M6' : null, task_name: i === 0 ? 'Kurgu görev adı' : null,
    created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-02T08:00:00Z',
  }))
}

const ROWS = prefix => ({
  rfi: rfiRows(prefix),
  document: [
    { id: id('doc', 1), no: `DOC-${prefix}-0001`, title: 'Kurgu teknik şartname', status: 'active', document_type: 'specification', discipline: 'general', drawing_type: null, revision_no: '01', revision_status: 'ifa', issue_date: '2026-10-05', created_by: P1, created_at: '2026-10-05T08:00:00Z', updated_at: '2026-10-05T08:00:00Z' },
    { id: id('doc', 2), no: `DRW-${prefix}-0001`, title: 'Kurgu yerleşim planı', status: 'active', document_type: 'drawing', discipline: 'civil', drawing_type: 'layout', revision_no: '00', revision_status: 'ifc', issue_date: '2026-10-06', created_by: P1, created_at: '2026-10-06T08:00:00Z', updated_at: '2026-10-06T08:00:00Z' },
  ],
  decision: [{ id: id('dec', 1), no: `DEC-${prefix}-0001`, title: 'Kurgu karar', status: 'proposed', decision_date: '2026-10-10', decision_maker: 'Kurgu toplantısı', decision_text: 'Kurgu karar metni.', created_by: P1, created_at: '2026-10-10T08:00:00Z', updated_at: '2026-10-10T08:00:00Z' }],
  action: [{ id: id('act', 1), no: `ACT-${prefix}-0001`, title: 'Kurgu aksiyon', status: 'in_progress', priority: 'high', assigned_to: P1, due_date: '2026-10-25', source_type: 'meeting', created_at: '2026-10-11T08:00:00Z', updated_at: '2026-10-11T08:00:00Z' }],
  submittal: [],
  material_approval: [{ id: id('ma', 1), no: `MA-${prefix}-0001`, title: 'Kurgu panel', status: 'submitted', revision: '00', manufacturer: 'Kurgu Üretici', model: 'K-1', supplier_name: null, submitted_date: '2026-10-12', created_at: '2026-10-12T08:00:00Z', updated_at: '2026-10-12T08:00:00Z' }],
  change: [{ id: id('chg', 1), no: `CHG-${prefix}-0001`, title: 'Kurgu değişiklik', status: 'submitted', priority: 'medium', record_state: 'pending_approval', origin: 'site_condition', cost_estimate: 125000, currency: 'TRY', time_impact_days: 5, assigned_to: P1, due_date: '2026-11-01', created_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T08:00:00Z' }],
  claim: [{ id: id('clm', 1), no: `CLM-${prefix}-0001`, title: 'Kurgu hak talebi', status: 'notice_sent', record_state: 'draft', notice_type: 'time', event_date: '2026-10-09', notice_deadline: '2026-10-30', amount_claimed: null, currency: 'TRY', time_claimed_days: 10, created_at: '2026-10-14T08:00:00Z', updated_at: '2026-10-14T08:00:00Z' }],
  interface: [],
})

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function installMock(page, role, { projectKey = 'tiz', calls = [] } = {}) {
  const user = USERS[role]
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, role: 'authenticated', exp })}.sig`
  const session = {
    access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'mock-refresh',
    user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: `${role}@kurgu.test`, user_metadata: { full_name: user.name }, app_metadata: {} },
  }
  const projectId = PROJECTS[projectKey].id
  await page.addInitScript(([s, pid]) => {
    window.localStorage.setItem('sb-127-auth-token', JSON.stringify(s))
    window.localStorage.setItem('register-project', JSON.stringify(pid))
  }, [session, projectId])

  // Canlıya kaçak istek: testi düşür.
  await page.route(/supabase\.co/, route => {
    calls.push({ method: route.request().method(), url: route.request().url(), leaked: true })
    return route.abort()
  })

  await page.route(`http://${MOCK_HOST}/**`, async route => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    calls.push({ method: req.method(), path })
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path.startsWith('/auth/v1/')) return json({})
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop()
      const args = req.postDataJSON() || {}
      if (fn === 'get_my_role') return json(role)
      if (fn === 'get_my_projects') return json(user.projects.map(k => ({ id: PROJECTS[k].id, name: PROJECTS[k].name })))
      if (fn === 'get_profile_names') return json((args.p_ids || []).filter(x => PEOPLE[x]).map(x => ({ id: x, full_name: PEOPLE[x] })))
      if (fn === 'get_register_list') {
        const proj = Object.values(PROJECTS).find(p => p.id === args.p_project_id)
        if (!proj || !user.projects.some(k => PROJECTS[k].id === proj.id) || !canView(role, args.p_register)) {
          return json({ authorized: false })
        }
        const all = ROWS(proj.prefix)
        let rows = args.p_register === 'drawing' ? all.document.filter(r => r.document_type === 'drawing') : all[args.p_register] || []
        // Taklit tablo kuralı: şef tedarikçi adını almaz (suppliers RLS)
        if (role === 'santiye_sefi') rows = rows.map(r => ('supplier_name' in r ? { ...r, supplier_name: null } : r))
        return json({ authorized: true, register: args.p_register, prefix: proj.prefix, rows })
      }
      if (fn === 'get_register_status_history') {
        if (!canView(role, args.p_register)) return json({ authorized: false })
        if (!['rfi', 'decision', 'action', 'change', 'claim', 'interface'].includes(args.p_register)) {
          return json({ authorized: true, tracked: false, history: [] })
        }
        return json({ authorized: true, tracked: true, history: [
          { old_status: null, new_status: 'open', changed_by: P2, changed_at: '2026-10-01T08:00:00Z' },
          { old_status: 'open', new_status: 'under_review', changed_by: P1, changed_at: '2026-10-03T09:30:00Z' },
        ] })
      }
      return json(null)
    }
    if (path === '/rest/v1/roles') {
      const n = NAV[role]
      return json({
        display_name: role, is_manager: role === 'admin' || role === 'muhasebe', tabs_unrestricted: n.tabs_unrestricted, default_tab: n.default_tab,
        role_allowed_tabs: n.tabs.map((tab_key, order_index) => ({ tab_key, order_index })),
        role_sidebar_items: n.sidebar.map((item_key, order_index) => ({ item_key, order_index })),
      })
    }
    if (path === '/rest/v1/profiles') return json({ full_name: user.name, project_id: role === 'santiye_sefi' ? PROJECTS.tiz.id : null })
    if (path.startsWith('/rest/v1/')) {
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      return json(single ? null : [])
    }
    return json({})
  })
}
