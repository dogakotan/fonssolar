// Proje Kontrol — Faz A güvenlik doğrulaması (docs/proje-kontrol/tasarim.md Bölüm 3,
// "Mevcut RLS, RPC ve Storage durumu için yetkisiz kullanıcı ve başka proje
// kullanıcısı testleri"). Bu dosya mevcut durumu ÖLÇER, düzeltmez: başarısız olan
// her test docs/proje-kontrol/guvenlik-bulgulari.md'de bir bulguya karşılık gelir.
//
// Fikstür ilkesi: ticket ve satın alma talebi için client'ta DELETE yolu olmadığından
// yeni satır açılmaz — Kayseri test projesindeki mevcut kayıtlar salt okunur kullanılır,
// "değiştirilemez" denemeleri aynı değeri geri yazar. Yalnızca silinebilen geçici
// fikstürler (storage nesneleri + daily_report_photos / ticket_attachments satırları)
// oluşturulur ve afterAll'da temizlenir.
import { test, expect } from '@playwright/test'
import { makeClient, signIn } from './helpers.js'

const marker = `E2E_PK_GUVENLIK_${Date.now()}`
const FAR_DATE = '2099-12-31'
// 1x1 şeffaf PNG
const PNG_BYTES = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
))
const pngBlob = () => new Blob([PNG_BYTES], { type: 'image/png' })

// RLS "görmezden gelme" (0 satır) veya açık yetki hatası — ikisi de reddedilmiş sayılır.
function expectNoRows({ data, error }) {
  if (error) return
  expect(data ?? []).toHaveLength(0)
}

const ANON_READ_TABLES = [
  'tickets', 'purchase_requests', 'invoices', 'project_risks', 'daily_reports', 'notifications',
  // 05.10.2026'da canlıya eklenen Proje Kontrol tabloları (bkz. sema-dogrulama.md Bölüm 0)
  'documents', 'drawings', 'rfis', 'actions', 'decisions', 'technical_submittals',
  'material_approvals', 'project_wbs', 'project_areas', 'register_status_history',
]

function dailyReportArgs(projectId, createdBy, reportDate = FAR_DATE) {
  return {
    p_project_id: projectId, p_report_date: reportDate, p_created_by: createdBy,
    p_general_status: 'normal', p_worker_count: 0, p_weather: 'güneşli',
    p_weather_note: '', p_notes: marker, p_personnel: [], p_machinery: [],
    p_progress: [], p_daily_tasks: [], p_materials: [], p_task_progress: [],
  }
}

function purchaseArgs(projectId, requestedBy) {
  return {
    p_project_id: projectId, p_title: marker, p_category: 'diger', p_request_note: marker,
    p_requested_by: requestedBy,
    p_items: [{ name: marker, quantity: 1, unit: 'Adet', bom_item_id: null }],
  }
}

// Seri değil: bir bulgu (başarısız test) sonraki senaryoların koşmasını engellemesin.
// Başarısızlıkta Playwright yeni worker açar; beforeAll/afterAll fikstürleri yeniden kurar/temizler.
test.describe('Proje Kontrol Faz A — RLS, RPC ve Storage doğrulaması', () => {
  let admin, santiye, anon
  let adminId, siteId
  let izmir, kayseri
  let kTicket, kRequest, kReportId, izmirReportId, izmirTicketId
  let kPhotoPath, kPhotoRowId, kAttachmentPath, kAttachmentRowId

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    anon = makeClient()
    ;[adminId, siteId] = await Promise.all(
      [admin, santiye].map(async client => (await client.auth.getUser()).data.user.id),
    )
    izmir = process.env.TEST_PROJECT_IZMIR
    kayseri = process.env.TEST_PROJECT_KAYSERI
    expect(izmir && kayseri && izmir !== kayseri).toBeTruthy()

    // Kayseri'de mevcut kayıtlar (admin görür) — testlerin anlamlı olması için şart.
    const [tickets, requests, reports] = await Promise.all([
      admin.from('tickets').select('id,title').eq('project_id', kayseri).limit(1),
      admin.from('purchase_requests').select('id,title').eq('project_id', kayseri).limit(1),
      admin.from('daily_reports').select('id').eq('project_id', kayseri).limit(1),
    ])
    for (const r of [tickets, requests, reports]) {
      expect(r.error).toBeNull()
      expect(r.data?.length).toBeGreaterThan(0)
    }
    kTicket = tickets.data[0]
    kRequest = requests.data[0]
    kReportId = reports.data[0].id

    // Şantiye şefinin kendi projesinde görebildiği bir rapor ve ticket (sahte metadata denemesi için)
    const [ownReports, ownTickets] = await Promise.all([
      santiye.from('daily_reports').select('id').eq('project_id', izmir).limit(1),
      santiye.from('tickets').select('id').eq('project_id', izmir).limit(1),
    ])
    expect(ownReports.data?.length).toBeGreaterThan(0)
    expect(ownTickets.data?.length).toBeGreaterThan(0)
    izmirReportId = ownReports.data[0].id
    izmirTicketId = ownTickets.data[0].id

    // Geçici Kayseri saha fotoğrafı (dosya + metadata satırı)
    kPhotoPath = `${kayseri}/e2e-guvenlik/${marker}.png`
    const up1 = await admin.storage.from('saha-fotolari').upload(kPhotoPath, pngBlob(), { contentType: 'image/png' })
    expect(up1.error).toBeNull()
    const photoRow = await admin.from('daily_report_photos').insert({
      report_id: kReportId, project_id: kayseri, report_date: FAR_DATE,
      storage_path: kPhotoPath, caption: marker, uploaded_by: adminId,
    }).select('id').single()
    expect(photoRow.error).toBeNull()
    kPhotoRowId = photoRow.data.id

    // Geçici Kayseri ticket eki (mevcut ticket'a, dosya + metadata satırı)
    kAttachmentPath = `${kTicket.id}/${marker}.png`
    const up2 = await admin.storage.from('ticket-ekleri').upload(kAttachmentPath, pngBlob(), { contentType: 'image/png' })
    expect(up2.error).toBeNull()
    const attRow = await admin.from('ticket_attachments').insert({
      ticket_id: kTicket.id, storage_path: kAttachmentPath, uploaded_by: adminId,
    }).select('id').single()
    expect(attRow.error).toBeNull()
    kAttachmentRowId = attRow.data.id
  })

  test.afterAll(async () => {
    // Sıra önemli: storage remove() önce SELECT yapar ve SELECT policy'si metadata
    // satırına bakar — satır silinirse dosya görünmez olur ve silinemez.
    if (kPhotoPath) expect((await admin.storage.from('saha-fotolari').remove([kPhotoPath])).error).toBeNull()
    if (kAttachmentPath) expect((await admin.storage.from('ticket-ekleri').remove([kAttachmentPath])).error).toBeNull()
    // Şantiye şefinin sahte metadata satırları (test başarısız olsa da)
    await santiye?.from('daily_report_photos').delete().eq('uploaded_by', siteId).eq('storage_path', kPhotoPath ?? '-')
    await santiye?.from('ticket_attachments').delete().eq('uploaded_by', siteId).eq('storage_path', kAttachmentPath ?? '-')
    if (kPhotoRowId) await admin.from('daily_report_photos').delete().eq('id', kPhotoRowId)
    if (kAttachmentRowId) await admin.from('ticket_attachments').delete().eq('id', kAttachmentRowId)
    // Kimlik taklidi beklenmedik şekilde başarılı olduysa artakalanı temizle
    await admin.from('daily_reports').delete().eq('project_id', izmir).eq('report_date', FAR_DATE)
    const { data: strayRequests } = await admin.from('purchase_requests').select('id').eq('title', marker)
    for (const row of strayRequests ?? []) {
      await admin.from('notifications').delete().eq('entity_id', row.id)
      await admin.from('purchase_requests').delete().eq('id', row.id)
    }
  })

  test('anon anahtarı hiçbir proje tablosunu okuyamaz', async () => {
    for (const table of ANON_READ_TABLES) {
      const result = await anon.from(table).select('*').limit(1)
      expectNoRows(result)
    }
  })

  test('anon save_daily_report ve create_purchase_request_with_items RPC’lerini çağıramaz', async () => {
    const fakeUser = '00000000-0000-0000-0000-000000000000'
    const daily = await anon.rpc('save_daily_report', dailyReportArgs(izmir, fakeUser))
    const purchase = await anon.rpc('create_purchase_request_with_items', purchaseArgs(izmir, fakeUser))
    expect(daily.error).toBeTruthy()
    expect(purchase.error).toBeTruthy()
  })

  test('başka projenin şantiye şefi Kayseri ticket/talep/rapor/fotoğraflarını okuyamaz', async () => {
    expectNoRows(await santiye.from('tickets').select('id').eq('id', kTicket.id))
    expectNoRows(await santiye.from('purchase_requests').select('id').eq('id', kRequest.id))
    expectNoRows(await santiye.from('daily_reports').select('id').eq('project_id', kayseri))
    expectNoRows(await santiye.from('daily_report_photos').select('id').eq('project_id', kayseri))
    expectNoRows(await santiye.from('ticket_attachments').select('id').eq('ticket_id', kTicket.id))

    const photo = await santiye.storage.from('saha-fotolari').download(kPhotoPath)
    expect(photo.error).toBeTruthy()
    const listed = await santiye.storage.from('saha-fotolari').list(`${kayseri}/e2e-guvenlik`)
    expectNoRows(listed)
    const attachment = await santiye.storage.from('ticket-ekleri').download(kAttachmentPath)
    expect(attachment.error).toBeTruthy()
  })

  test('başka projenin şantiye şefi Kayseri’ye yazamaz', async () => {
    const ticketInsert = await santiye.from('tickets').insert({
      project_id: kayseri, created_by: siteId, title: marker, category: 'genel',
    }).select('id')
    expect(ticketInsert.error).toBeTruthy()

    expectNoRows(await santiye.from('tickets').update({ title: kTicket.title }).eq('id', kTicket.id).select('id'))
    expectNoRows(await santiye.from('purchase_requests').update({ title: kRequest.title }).eq('id', kRequest.id).select('id'))

    const pr = await santiye.rpc('create_purchase_request_with_items', purchaseArgs(kayseri, siteId))
    expect(pr.error).toBeTruthy()

    const daily = await santiye.rpc('save_daily_report', dailyReportArgs(kayseri, siteId))
    expect(daily.error).toBeTruthy()

    const directReport = await santiye.from('daily_reports').insert({
      project_id: kayseri, report_date: FAR_DATE, created_by: siteId,
    }).select('id')
    expect(directReport.error).toBeTruthy()

    const photoUpload = await santiye.storage.from('saha-fotolari')
      .upload(`${kayseri}/e2e-guvenlik/${marker}_site.png`, pngBlob(), { contentType: 'image/png' })
    expect(photoUpload.error).toBeTruthy()
    const attUpload = await santiye.storage.from('ticket-ekleri')
      .upload(`${kTicket.id}/${marker}_site.png`, pngBlob(), { contentType: 'image/png' })
    expect(attUpload.error).toBeTruthy()

    // Silme denemesi: hata dönmese bile nesne yerinde kalmalı
    await santiye.storage.from('saha-fotolari').remove([kPhotoPath])
    await santiye.storage.from('ticket-ekleri').remove([kAttachmentPath])
    expect((await admin.storage.from('saha-fotolari').download(kPhotoPath)).error).toBeNull()
    expect((await admin.storage.from('ticket-ekleri').download(kAttachmentPath)).error).toBeNull()
  })

  test('giriş yapmış kullanıcı başka kullanıcı adına kayıt oluşturamaz', async () => {
    const daily = await santiye.rpc('save_daily_report', dailyReportArgs(izmir, adminId))
    expect(daily.error?.message).toContain('yetkiniz yok')

    const pr = await santiye.rpc('create_purchase_request_with_items', purchaseArgs(izmir, adminId))
    expect(pr.error?.message).toContain('yetkiniz yok')

    const ticket = await santiye.from('tickets').insert({
      project_id: izmir, created_by: adminId, title: marker, category: 'genel',
    }).select('id')
    expect(ticket.error).toBeTruthy()
  })

  test('saha-fotolari ve ticket-ekleri public değil; imzasız URL ile erişilemez', async () => {
    const base = process.env.VITE_SUPABASE_URL
    const key = process.env.VITE_SUPABASE_ANON_KEY
    for (const [bucket, path] of [['saha-fotolari', kPhotoPath], ['ticket-ekleri', kAttachmentPath]]) {
      const publicUrl = await fetch(`${base}/storage/v1/object/public/${bucket}/${path}`)
      expect(publicUrl.status).not.toBe(200)
      const anonDirect = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      })
      expect(anonDirect.status).not.toBe(200)

      // Pozitif kontrol: yetkili kullanıcının imzalı URL'i çalışıyor
      const signed = await admin.storage.from(bucket).createSignedUrl(path, 60)
      expect(signed.error).toBeNull()
      expect((await fetch(signed.data.signedUrl)).status).toBe(200)
    }
  })

  test('sahte metadata satırıyla başka projenin fotoğrafı okunamaz (daily_report_photos)', async () => {
    // Kendi projesine ait, ama yolu Kayseri dosyasını gösteren sahte bir satır.
    await santiye.from('daily_report_photos').insert({
      report_id: izmirReportId, project_id: izmir, report_date: FAR_DATE,
      storage_path: kPhotoPath, caption: marker, uploaded_by: siteId,
    })
    const photo = await santiye.storage.from('saha-fotolari').download(kPhotoPath)
    expect(photo.error, 'Kayseri fotoğrafı sahte İzmir satırı üzerinden indirilebildi').toBeTruthy()
  })

  test('sahte metadata satırıyla başka projenin ticket eki okunamaz (ticket_attachments)', async () => {
    await santiye.from('ticket_attachments').insert({
      ticket_id: izmirTicketId, storage_path: kAttachmentPath, uploaded_by: siteId,
    })
    const attachment = await santiye.storage.from('ticket-ekleri').download(kAttachmentPath)
    expect(attachment.error, 'Kayseri ticket eki sahte İzmir satırı üzerinden indirilebildi').toBeTruthy()
  })
})
