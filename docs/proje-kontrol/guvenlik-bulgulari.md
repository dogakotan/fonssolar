# Proje Kontrol — Faz A güvenlik bulguları

Tarih: 2026-10-06 · Test: `tests/proje-kontrol-guvenlik.spec.js` (8 senaryo: **6 geçti, 2 başarısız**).
Kaynaklar: test koşusu + canlı `pg_policies` / `pg_proc` / `storage.objects` policy incelemesi.

**Bu dosyadaki SQL'lerin hiçbiri uygulanmadı.** Hepsi taslaktır; CLAUDE.md kuralı #1 gereği
tek tek gösterilip onay alındıktan sonra `npm run db:backup` + migration ile uygulanır.

## Geçen senaryolar (mevcut durum doğrulandı)

| Senaryo | Sonuç |
|---|---|
| anon: tickets, purchase_requests, invoices, project_risks, daily_reports, notifications + 05.10 register tabloları (10 tablo) okunamıyor | geçti (anon'un bu tablolarda GRANT'i yok) |
| anon: `save_daily_report`, `create_purchase_request_with_items` çağrılamıyor | geçti (anon EXECUTE yok) |
| Başka proje şantiye şefi: Kayseri tickets / purchase_requests / daily_reports / daily_report_photos / ticket_attachments okuyamıyor; storage `download` ve `list` reddediliyor | geçti |
| Başka proje şantiye şefi: Kayseri'ye ticket insert, ticket/talep update, talep RPC, `save_daily_report`, doğrudan daily_reports insert, saha-fotolari ve ticket-ekleri upload/remove yapamıyor | geçti |
| Başka kullanıcı adına kayıt: `p_created_by` / `p_requested_by` = admin id → "yetkiniz yok"; `tickets.created_by` = admin → RLS reddi | geçti |
| saha-fotolari ve ticket-ekleri: `/object/public/...` ve anon anahtarlı `/object/...` 200 dönmüyor; yetkili kullanıcının imzalı URL'i 200 dönüyor (pozitif kontrol) | geçti |

## Bulgular

### G-02 · YÜKSEK · Sahte `daily_report_photos` satırıyla başka projenin saha fotoğrafı okunabiliyor (testle kanıtlı)

- **Test:** `sahte metadata satırıyla başka projenin fotoğrafı okunamaz` — BAŞARISIZ.
- **Mekanizma:** `drp_insert` yalnızca `auth.uid() IS NOT NULL` kontrol ediyor. `storage_select` (saha-fotolari) ise
  "aynı `storage_path`'e sahip ve `has_project_access(photo.project_id)` olan bir metadata satırı var mı" diye bakıyor.
  İzmir şantiye şefi `project_id = İzmir`, `storage_path = <Kayseri dosya yolu>` olan bir satır ekleyip Kayseri
  fotoğrafını indirebildi. Ön koşul dosya yolunu bilmek (yol `proje/tarih/epoch_dosyaadı` biçiminde, tahmin
  edilmesi zor ama gizli değil; ör. dışa aktarılan PDF/Excel, ekran görüntüsü, log).
- **Taslak düzeltme:** satırın projesi ile dosya yolunun ilk klasörü eşleşmeli; insert kendi adına ve erişimi olan
  projeye yapılmalı; rapor verilmişse aynı projede olmalı.

```sql
-- TASLAK — UYGULANMADI
drop policy if exists drp_insert on public.daily_report_photos;
create policy drp_insert on public.daily_report_photos
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and public.has_project_access(project_id)
    and project_id is not null
    and split_part(storage_path, '/', 1) = project_id
    and (report_id is null or exists (
      select 1 from public.daily_reports dr where dr.id = report_id and dr.project_id = daily_report_photos.project_id))
  );

drop policy if exists storage_select on storage.objects;
create policy storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'saha-fotolari'
    and exists (
      select 1 from public.daily_report_photos photo
      where photo.storage_path = objects.name
        and photo.project_id = (storage.foldername(objects.name))[1]
        and public.has_project_access(photo.project_id)
    )
  );
```

Ön kontrol: canlıdaki 5 `daily_report_photos` satırında `split_part(storage_path,'/',1) = project_id` olup olmadığı
uygulama öncesi SELECT ile doğrulanmalı (`DailyReportForm.jsx:765` yolu bu biçimde üretiyor).

### G-03 · YÜKSEK · Sahte `ticket_attachments` satırıyla başka projenin ticket eki okunabiliyor (testle kanıtlı)

- **Test:** `sahte metadata satırıyla başka projenin ticket eki okunamaz` — BAŞARISIZ.
- **Mekanizma:** `ta_insert` yalnızca `auth.uid() IS NOT NULL`. `storage_select_ticket` ekin bağlı olduğu ticket'a
  erişimi kontrol ediyor ama yolun o ticket'a ait olduğunu kontrol etmiyor. Kullanıcı görebildiği kendi ticket'ına,
  yolu başka projenin ekini gösteren bir satır ekleyip dosyayı indirebildi.

```sql
-- TASLAK — UYGULANMADI
drop policy if exists ta_insert on public.ticket_attachments;
create policy ta_insert on public.ticket_attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and split_part(storage_path, '/', 1) = ticket_id::text
    and exists (select 1 from public.tickets t where t.id = ticket_id)  -- çağıranın RLS'iyle görünür olmalı
  );

drop policy if exists storage_select_ticket on storage.objects;
create policy storage_select_ticket on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ticket-ekleri'
    and exists (
      select 1 from public.ticket_attachments attachment
      join public.tickets ticket on ticket.id = attachment.ticket_id
      where attachment.storage_path = objects.name
        and attachment.ticket_id::text = (storage.foldername(objects.name))[1]
        and (public.has_project_access(ticket.project_id)
             or ticket.created_by = (select auth.uid())
             or ticket.assigned_to = (select auth.uid()))
    )
  );
```

Ön kontrol: mevcut `ticket_attachments` satırlarında `split_part(storage_path,'/',1) = ticket_id::text`
(`YeniTicketModal.jsx:109` yolu bu biçimde üretiyor).

### G-01 · YÜKSEK (tasarım/şema) · 05.10.2026'da canlıya eklenen register tabloları tasarımın güvenlik ilkesini çiğniyor

Testle değil, policy incelemesiyle tespit edildi (tablolar boş, frontend'de kullanılmıyor — bugün istismar yüzeyi yok).

- `documents`, `drawings`, `rfis`, `actions`, `decisions`, `technical_submittals`, `material_approvals`:
  doğrudan `INSERT/UPDATE` (`can_write_project_control` = admin/PM/**şantiye şefi**) ve `DELETE`
  (`can_manage_project_control`) policy'leri var. Tasarım 4.2: "hiçbir yeni tabloya doğrudan
  INSERT/UPDATE/DELETE policy'si yazılmaz; yazma yalnızca RPC ile".
- Sonuçlar: şantiye şefi çizim/doküman/karar kaydını doğrudan değiştirebilir (tasarım matrisinde `V`); onaylı kayıt
  kilidi, dört göz kuralı, durum geçiş beyaz listesi uygulanamaz; `status` doğrudan UPDATE ile istenen değere
  çekilebilir (yalnızca `register_status_history`'e iz düşer).
- `muhasebe` rolü `is_manager=true` olduğu için `user_has_project_access` her projede true → bütün register
  tablolarını okuyabilir (tasarım matrisinde çoğu register için "yok").
- `project_wbs` / `project_areas` / `area_wbs` da doğrudan yazma policy'li (şantiye şefi Area ekleyip silebilir).

**Güncel geçici kapatma taslağı (07.10.2026, v2):** `taslak-sql/g01_gecici_yazma_kapatma.sql` — yalnızca 8 register/geçmiş
tablosunda `authenticated`'ın INSERT/UPDATE/DELETE GRANT'ini geri alır, geri alma bölümü dahil. `project_wbs`,
`project_areas`, `area_wbs` kapsam dışı (WBS/Alan ekranı doğrudan yazacak; yetkileri G-10'da testle doğrulandı).
UYGULANMADI — onay bekliyor. Aşağıdaki eski policy-DROP taslağı kalıcı çözüm seçeneği olarak duruyor.

Eski taslak (Karar #0'a bağlı — tablolar korunacaksa; yeniden adlandırma/yeniden kurma seçilirse bu taslak geçersiz):

```sql
-- TASLAK — UYGULANMADI. Önce Karar #0 (05.10 şemasının akıbeti) kapanmalı.
do $$
declare t text;
begin
  foreach t in array array['documents','drawings','rfis','actions','decisions','technical_submittals','material_approvals'] loop
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;
-- SELECT policy'leri register_can(...) eklenene kadar (Faz B, M03) user_has_project_access ile kalır.
```

### G-04 · ORTA · Storage yazma/silme policy'leri dosya sahipliğine ve role bakmıyor

Policy incelemesi; test edilmedi (veriyi silmeyi gerektirir).

- `storage_insert` / `storage_delete` (saha-fotolari) yalnızca `has_project_access(ilk klasör)` arıyor: projeye erişimi olan
  herkes o projedeki **başkasının** fotoğraf dosyasını silebilir. `muhasebe` (`is_manager`) bütün projelerde
  saha fotoğrafı yükleyip silebilir.
- `storage_delete_ticket` aynı şekilde: ticket'ın projesine erişimi olan herkes (muhasebe dahil, bütün projeler)
  eki silebilir.
- Silme, metadata satırını bırakır (kırık görsel); sahiplik `daily_report_photos.uploaded_by` /
  `ticket_attachments.uploaded_by` üzerinden kontrol edilebilir.

```sql
-- TASLAK — UYGULANMADI. Önce DailyReportForm.jsx:810 ve TicketDetayModal.jsx:115 silme akışlarıyla
-- uyum test edilmeli (rapor silme akışı metadata'yı CASCADE ile önce siliyor, bkz. G-06).
drop policy if exists storage_delete on storage.objects;
create policy storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'saha-fotolari'
    and ((select public.get_my_role()) = 'admin'
         or exists (select 1 from public.daily_report_photos p
                    where p.storage_path = objects.name and p.uploaded_by = (select auth.uid())))
  );
-- storage_insert: rol listesi (admin, proje_yoneticisi, santiye_sefi) eklenerek muhasebe dışarıda bırakılır.
```

### G-05 · DÜŞÜK · `notify_role` proje kapsamını daraltmıyor

- Gövde: `where p.role_key = p_role_key` — o roldeki herkes alır. Bugün yalnızca admin / proje_yoneticisi / muhasebe
  hedefleniyor (16 çağrı noktası tarandı) ve üçü de tüm projeleri görüyor → **bugün sızıntı yok**.
- Faz C'de register bildirimleri `santiye_sefi`'ye gönderilirse başka projenin şefine de gider (başlık/gövde sızar).
- Taslak (Faz C, ekleyici): `notify_role_in_project(p_role_key, p_project_id, …)` — alıcı filtresine
  `profiles.project_id = p_project_id OR user_project_access` veya rolün `is_manager/cross_project` olması şartı.
  Mevcut `notify_role` değişmez.

### G-06 · DÜŞÜK · Rapor silme akışı fotoğraf dosyalarını yetim bırakıyor

- `DailyReportForm.jsx:800-811`: önce `daily_reports` silinir (`daily_report_photos` CASCADE ile gider), sonra
  `storage.remove(photoPaths)`. Storage `remove` önce SELECT yapar; SELECT policy'si artık var olmayan metadata
  satırını aradığı için dosya görünmez ve **silinmez** (hata yalnızca `console.warn`). Aynı davranış bu test
  dosyasının ilk koşusunda gözlendi ve test temizliği sıralaması düzeltildi.
- Öneri (frontend, SQL değil): önce `storage.remove`, sonra `daily_reports` delete. Uygulanmadı.

### G-07 · DÜŞÜK · Storage policy'lerinde `{public}` rolü

- `storage_insert`, `storage_delete`, `storage_*_teklif`, `storage_*_ticket` (insert/delete) `to public` yazılmış;
  `auth.uid() IS NOT NULL` / `has_project_access` şartı anon'u zaten dışarıda bırakıyor (test: anon erişemedi).
  Derinlemesine savunma için `to authenticated`'e çevrilmesi önerilir. Taslak: her policy için
  `alter policy <ad> on storage.objects to authenticated;`.

### G-08 · DÜŞÜK · `update_updated_at()` / `update_updated_at_column()` anon'a EXECUTE açık

- `RETURNS trigger` olduğu için doğrudan çağrılamaz; CLAUDE.md'nin "trigger fonksiyonlarından anon/authenticated
  çıkarılır" kuralına uymuyor. 05.10 migration'ı yeni tablolarda bu fonksiyonu kullanıyor.

```sql
-- TASLAK — UYGULANMADI
revoke execute on function public.update_updated_at() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
```

### G-09 · BİLGİ · İşlevsel yan bulgular (güvenlik değil)

- `agent-chat` edge function'ı canlıda **deploy edilmemiş** (yalnızca 4 fonksiyon var), ama `src/components/agent/AgentChat.jsx:172`
  onu çağırıyor → AI sohbet canlıda çalışmıyor olmalı. Doğrulanamadı: canlı UI'da denenmedi.
- `exportUtils.js:839` PDF'teki saha fotoğrafları için `storagePublicUrl` (public URL) kullanıyor; bucket private
  olduğundan bu istek 200 dönmez (testte doğrulandı) → PDF'te fotoğraf kutuları boş kalır. İmzalı URL'e
  (`withSignedStorageUrls`) geçilmeli.

### G-10 · BİLGİ (açık bulunmadı) · WBS/Alan master tabloları başka projeye yazmaya kapalı (07.10.2026, testle)

`tests/proje-kontrol-master-veri.spec.js` — 9 senaryo, **9/9 geçti**; fikstürler temizlendi (3 tablo tekrar 0 satır,
`project_tasks`'a kalıcı yazım yok).

| Senaryo | Sonuç |
|---|---|
| anon okuma/yazma | reddedildi (GRANT yok) |
| İzmir şantiye şefi → Kayseri `project_wbs` okuma/ekleme/güncelleme/silme | reddedildi |
| Şantiye şefi kendi projesinde `project_wbs` ekleme | reddedildi (yalnızca admin/PM — policy gereği) |
| İzmir şantiye şefi → Kayseri `project_areas` ekleme/güncelleme/silme | reddedildi |
| Şantiye şefi kendi `project_areas` satırını açma | **izinli** (tasarım gereği); başka projeye taşıma ve silme reddedildi |
| İzmir şantiye şefi → Kayseri `area_wbs` ekleme/silme; projeler arası bağ (İzmir satırı + Kayseri alanı) | reddedildi (policy + kompozit FK) |
| Muhasebe → üç tabloda yazma | reddedildi (okuma: `is_manager` olduğu için tüm projeler — G-01 okuma notuyla aynı) |
| Proje yöneticisi → Kayseri `project_wbs` ekleme | **izinli** — `cross_project=true` tasarımı; açık değil, bilgi |
| `trg_project_tasks_identity_guard`: pasif WBS'i göreve atama | reddedildi ("Pasif WBS aktiviteye atanamaz"), görev değişmedi |

Policy notları: `area_wbs`'te UPDATE policy'si yok (satır yalnızca silinip yeniden eklenir); şantiye şefi dalı
`has_project_access` yerine `profiles.project_id` eşitliği kullanıyor — `user_project_access` ile ek projeye atanmış
bir şantiye şefi o projede Alan açamaz (bugün bu durumda kullanıcı yok; daha dar, güvenli yönde).

**Canlı akış regresyonu (identity_guard):** `is-plani-hiyerarsi`, `manual-task-progress`, `project-excel-layout`,
`category-weights` spec'leri — **10/10 geçti** (07.10.2026). Bu testler `project_tasks`'a INSERT ve UPDATE yapıyor;
trigger yalnızca `activity_id`/`wbs_id`/`area_id` doluyken etkili olduğu için mevcut akışlar etkilenmedi.
Dikkat: guard bir kez atanmış `activity_id`'nin değişmesini **ve NULL'a geri alınmasını** engelliyor — Faz B'de
Excel içe aktarımı/proje sihirbazı activity_id yazarsa düzeltme yolu yalnızca migration olur.

### G-11 · ORTA (veri bütünlüğü) · `next_register_no` 1000. kayıtta numara çakışması üretiyor

- `lpad(v::text, 3, '0')` — PostgreSQL `lpad` hedef uzunluktan uzun metni **kırpar**:
  `lpad('1000',3,'0') = '100'`, `lpad('1100',3,'0') = '110'` (canlıda SELECT ile doğrulandı).
- Bir proje × yıl × register türünde 1000. kayıt `RFI-2026-100` alır → 100. kayıtla `unique (project_id, rfi_no)`
  ihlali → o yıl o türde **yeni kayıt açılamaz**. Tablolar boş, bugün etkisi yok; Diyarbakır ölçeğinde Action/RFI
  sayısı 1000'i bir yılda aşabilir.
- Düzeltme yönü (taslak, uygulanmadı; numara biçimi kararıyla birlikte yazılmalı):
  `lpad(v::text, greatest(length(v::text), <pad>), '0')`. Ayrıntı: `uyum-tablosu.md` §3.

## drive-gateway için not

`has_project_access(text)` authenticated'e EXECUTE açık ve SECURITY DEFINER — drive-gateway kullanıcı JWT'siyle
`rpc('has_project_access')` çağırabilir. Ancak `has_project_access(NULL)` true döndüğü için gateway `project_id`
boş/eksik isteği **kendi içinde 400 ile reddetmeli** (iskelette uygulandı).
