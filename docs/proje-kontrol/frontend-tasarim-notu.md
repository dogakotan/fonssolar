# Proje Kontrol — Faz A frontend tasarım notu

Tarih: 2026-10-06 · İncelenen: `src/pages/dashboard/index.jsx`, `components/ProjeDetay.jsx`,
`hooks/useUrlSyncedSelection.js`, `context/AuthContext.jsx` (role_allowed_tabs / role_sidebar_items),
`components/TabBildirimler.jsx`, canlı `role_allowed_tabs` / `role_sidebar_items`.

## 1. Mevcut durum (koddan doğrulandı)

- **Route:** tek `/dashboard/*`. `index.jsx` yolu `[tabSeg, projSeg, projTabSeg]` olarak parçalar (`pathSegments`, satır 82).
  `projTabSeg` **doğrulanmadan** `ProjeDetay`'a `initialTab` olarak geçer.
- **ProjeDetay iç sekmeleri:** 7 sabit buton (satır 1195-1218) + `tab === …` zinciri (1369-1424). Zincirin son dalı
  `else → <TabIsPlan>`: tanınmayan bir sekme anahtarı (ör. yetkisi olmayan/eski `kontrol`) sessizce İş Planı'nı gösterir.
  Seçili sekme `proje-detay-active-tab-{projectId}` anahtarıyla localStorage'da; URL'den gelen `initialTab` önceliklidir.
  Sekme değişimi `onTabChange` → `navigate('/dashboard/projeler/{id}/{tab}', {replace:true})` — **sorgu dizesi atılır**.
- **ProjeDetay iç sekmeleri hangi mekanizmayla yetkilendiriliyor? — Hiçbiriyle.** `role_allowed_tabs` yalnızca
  üst seviye sekmeleri (`projeler`, `finans` …) kapsar; ProjeDetay'a ulaşan her rol 7 sekmenin hepsini görür. Rol
  farkı bileşen içinde (`isAdmin`, `canApprove` gibi) ve asıl olarak RLS/RPC'de uygulanır.
- **Kim ProjeDetay'a ulaşabiliyor?** Canlı `role_allowed_tabs`:
  admin (kısıtsız), proje_yoneticisi (`projeler` var). **santiye_sefi ve muhasebe'de `projeler` yok** → ProjeDetay'ı
  hiç açamazlar. Şantiye şefi proje içeriğini menü seviyesindeki bileşenlerle görüyor (ör. `index.jsx:464`
  `<ProjeTabSatinAlma siteChiefView projectId={…}>`).
- **Detay modalı URL senkronu:** `syncEntityParam(param, id)` (satır 177) mevcut path'i koruyup TEK bir sorgu
  parametresini ekler/siler (`replace`). URL → state yönü tek efektte (satır 141-172): proje içinde
  `projTabSeg === 'satin-alma' → ?talep`, `'finans' → ?fatura`, `'tickets' → ?ticket` okunur.
  `useUrlSyncedSelection` çocuk bileşende "son raporlanan değer" karşılaştırmasıyla StrictMode çift çalışmasını filtreler.
- **Bildirim derin bağlantısı:** `TabBildirimler.jsx:170` `switch (n.entity_type)` → `onGoToTicket/Request/Invoice/MalzemeListesi`;
  `index.jsx` `goToRequest` vb. `handleTabChange(tab, '?param=id')` çağırır. `handleTabChange` izin listesinde
  olmayan sekmeye **sessizce no-op** (satır 224). `goToInvoice`/`goToReport` rol-farkında yedek yol içerir.

## 2. "Proje Kontrol" 8. sekmesi — nereye, nasıl

1. `ProjeDetay.jsx` sekme şeridine `Ekip`'ten sonra `Proje Kontrol` butonu, anahtar **`kontrol`**
   (URL: `/dashboard/projeler/{id}/kontrol`). İçerik `lazy(() => import('../../../components/proje-kontrol/ProjeKontrolTab'))`
   + yerel `<Suspense>` — ana paket büyümez (tasarım 3, "Paket boyutu").
2. Görünürlük **register yetkisinden** türetilir, `role_allowed_tabs`'tan değil: `useRegisterPermissions(projectId)`
   (`get_my_register_permissions`) en az bir register'da `view` döndürürse buton görünür. Faz B'de bu RPC gelene kadar
   geçici koşul `isAdmin` (tasarım: "Faz B'de yalnızca admin").
3. Yetkisizken `tab === 'kontrol'` gelirse (URL/localStorage) **açıkça `genel`'e düşülmeli** — mevcut `else → TabIsPlan`
   fallback'ine bırakılmamalı. Aynı düzeltme diğer bilinmeyen anahtarlar için de faydalı (küçük, ayrı değişiklik).
4. **Şantiye şefi için ayrı giriş noktası gerekir.** `projeler` olmadan ProjeDetay'a ulaşamadığı için Faz C'de
   (tasarım: "Proje Kontrol grubu … santiye_sefi rollerine açılır") iki seçenek var:
   - (a) **Önerilen:** satın almadaki desenin aynısı — üst seviye `kontrol` sekmesi (`role_allowed_tabs` +
     `role_sidebar_items` satırı, `Sidebar.jsx`'e ikon/etiket) ve `index.jsx`'te
     `<ProjeKontrolTab projectId={authProjectId} />`. URL: `/dashboard/kontrol?register=…&kayit=…`.
   - (b) santiye_sefi'ye `projeler` vermek: bütün proje listesini/7 sekmeyi açar — kapsamı istenmeden genişletir.
   Muhasebe (`change`, `claim`, `payment` için V) aynı durumda; Faz D'de aynı (a) yolu.
5. Sekmenin içi tasarım 4.7 bileşen ağacı: `RegisterNav` (sol menü) + `RegisterList` / `RegisterDetail` / `ApprovalInbox`.

## 3. `?register=` ve `?kayit=` mevcut URL senkronuyla nasıl çakışmadan çalışır

- **Okuma (URL → state):** `index.jsx` efektine yeni dal: `projTabSeg === 'kontrol'` iken
  `register`, `kayit`, `taslak`, `sihirbaz` okunur ve `ProjeDetay` → `ProjeKontrolTab`'a prop olarak geçer. Mevcut
  dallar yalnızca kendi `projTabSeg` değerinde parametre okuduğu için çakışma yok. Parametre adları mevcutlarla
  (`talep`, `fatura`, `ticket`, `tedarikci`) örtüşmüyor.
- **Yazma (state → URL):** register değişince `kayit` de temizlenmeli. `syncEntityParam`'ı art arda iki kez çağırmak
  **hatalı** olur: ikisi de aynı render'ın `location.search`'ünü kapanışta tuttuğu için ikinci çağrı birincinin
  değişikliğini ezer. Çözüm: çoklu parametre alan `syncEntityParams({ register, kayit: null })` (aynı dosyada, ekleyici;
  mevcut `syncEntityParam` buna delege edebilir).
- **Sekme değişimi** zaten sorgu dizesini attığından `kontrol`'den çıkınca `?register` kendiliğinden temizlenir — istenen davranış.
- **Son açık register:** `proje-kontrol-active-register-{projectId}` localStorage (tasarım 4.7); URL'deki `?register`
  her zaman öncelikli (mevcut `initialTab` > localStorage deseni).
- **StrictMode:** `ProjeKontrolTab` seçili kayıt için `useUrlSyncedSelection(selectedId, onSelectedRecordChange)`
  kullanmalı; register seçimi için de aynı "son işlenen değerle karşılaştır" deseni (`ProjeDetay`'daki `lastActedTabRef`)
  — sayaç tabanlı "ilk render'ı atla" yazılırsa 02.08.2026'daki parametre silme bug'ı tekrarlar.
- **Bildirim:** `TabBildirimler` `switch`'ine `register_record` / `register_draft`; `index.jsx`'e
  `goToRegisterRecord(projectId, registerType, recordId)` →
  `/dashboard/projeler/{p}/kontrol?register={t}&kayit={id}` (taslakta `?register=_onay&taslak={id}`).
  `navigation.tabs` `projeler` içermiyorsa (santiye_sefi) 2(a)'daki `/dashboard/kontrol?…` yoluna düşmeli —
  `goToInvoice` deseniyle aynı rol-farkında yedek; aksi halde bildirim "ölü" kalır (CLAUDE.md uyarısı).

## 4. Faz B dosya listesi (öneri)

```
src/components/proje-kontrol/
  ProjeKontrolTab.jsx          kabuk: RegisterNav + seçili görünüm; URL prop'ları, localStorage
  RegisterNav.jsx              gruplar (Dokümanlar/Teknik/Yönetim/Ticari), sayı rozetleri (get_register_overview)
  RegisterList.jsx             config'ten tablo + mobil kart (invoice-mobile-list deseni), Pager, filtreler
  RegisterDetail.jsx           sağdan panel, sekmeler (Genel/Dokümanlar/İlişkiler/Geçmiş)
  RecordForm.jsx               formSections'tan form, sunucu validation hatasını alana bağlar
  registerConfig.js            register başına kolon/filtre/form/aiSchema (tasarım 4.7 örneği)
  labels.js                    enum → Türkçe etiket sözlüğü
  StatusBadge.jsx              record_state + iş durumu (Badge.jsx StatusDot dili)
  ConfidenceBadge.jsx          yeşil/sarı/kırmızı + metin etiketi
  AuditPanel.jsx               get_register_audit
  LinksPanel.jsx, RefPicker.jsx  register_links, search_register_refs
  ApprovalInbox.jsx            (Faz C) taslaklar + onay bekleyenler
  DocumentUpload.jsx           (Faz C) drive-gateway upload
src/hooks/
  useRegisterPermissions.js, useRegisterList.js, useRegisterRecord.js
src/utils/registerErrors.js    RPC hata kodu (forbidden/validation/…) → Türkçe mesaj
tests/proje-kontrol-*.spec.js  4 rol × görünürlük, ?register&kayit yenileme (T26-T28)
```

Değişecek mevcut dosyalar (küçük, ekleyici): `ProjeDetay.jsx` (buton + dal + fallback), `index.jsx` (URL dalı,
`syncEntityParams`, `goToRegisterRecord`), `TabBildirimler.jsx` (ENTITY_META + switch).

## 5. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| santiye_sefi/muhasebe ProjeDetay'a ulaşamıyor | Faz C'de "rollere açılır" adımı ProjeDetay içinde yapılamaz | 2(a) üst seviye `kontrol` sekmesi; Faz B'de kararlaştır |
| Bilinmeyen iç sekme → İş Planı fallback'i | Yetkisiz `kontrol` URL'i sessizce yanlış ekran gösterir | Açık fallback `genel` |
| `syncEntityParam` tek parametre | register/kayıt geçişinde URL tutarsız | `syncEntityParams` |
| Faz B'de 05.10 tablolarına doğrudan bağlanmak | Tasarım "ham .from() yok, yalnızca RPC" kuralı çiğnenir; tablolar doğrudan yazılabilir (G-01) | Ekranlar yalnızca `get_register_*` RPC'lerine bağlanır; Karar #0 kapanmadan UI yazılmaz |
| Arayüz gizleme = güvenlik sanılması | Yetkisiz eylem RPC'ye ulaşır | Asıl kontrol RPC'de (`register_can`); UI yalnızca gizler |
| `ProjeDetay.jsx` zaten ~1400 satır | Bakım yükü | Sekme içeriği tamamen ayrı klasörde; ProjeDetay'a yalnızca buton + lazy dal |
