# Faz 1 Adım 4 — canlı ROLLBACK test sonuçları

Tarih: 12.10.2026. Proje: `bshhgvdzemgfijkzhcrf`. Yöntem: Adım 2 yöntemi.
- Her oturum tek DO bloğudur ve hatayla biter (COMMIT yok).
- `lock_timeout` 3 sn, `statement_timeout` 60 sn.
- Oturumlar `scratchpad/build4.mjs` ile `taslak-sql/` dosyalarından üretildi.
- Hiçbir şey kalıcı uygulanmadı.

**ADIM 4 KAPANDI.** Bütün oturumlar beklendiği gibi geçti, Oturum 5 = Oturum 0. Gerçek Diyarbakır Excel'inin projesiz kontrolü
bekleniyor.

## Kurulum kapsamı

MCP aracı ~95 KB üstü isteği düşürüyor. Bu yüzden her oturumda yalnızca Adım 4'ün dokunduğu zincir kuruldu:
- B1;
- B2 A1-A2 + A4 (A3 FK indeksleri hariç);
- B4;
- AID A1-A6;
- Adım 4.

Kurulmayanlar:
- B2 A3 (yalnızca indeks);
- F1 (proje kodu kuralı, `create_project_with_code`, tiresiz alan kodu CHECK'i);
- AID A7-A8 (iptal görev hesapları ve koruması).

Bu parçalar Adım 2-3'te doğrulandı ve Adım 4'ün nesnelerine dokunmuyor. Adım 4 de onlarınkine dokunmuyor:
- Adım 4'ün değiştirdiği nesneler: `project_wbs`, `project_areas`, `area_wbs` guard'ları ve trigger'ları, yeni fonksiyonlar.
- F1 ile tek ortak nokta alan kodu biçimi. Import bunu kendisi doğruluyor (`code_format`, T26b).

Tam zincir (F1 ve AID A7-A8 dahil) Adım 6'da `f1_dogrulama.sql` ile birlikte çalışır.

## Kural 10 ön kontrolü (koşmadan önce)

- **Ad çakışması:**
  - Blok değişkenleri (`out`, `r`, `n`, `v`, `ok`, `p`, `j`, `j2`, `ex`, `rs`, `c0`, `c1`, `t1..t4`, `a_*`, `w*`) sorgularda takma ad olarak kullanılmadı.
  - Kolonlar tablo adıyla nitelendirildi.
  - `f1_dogrulama` §6 değişkenleri `u4a`, `s4`, `x4`… dış bloktakilerden (`e`, `f`, `j`, `t`, `n`) ayrı.
- **Beklenen metinler canlıda SELECT ile doğrulandı:**
  - `true::text` = `true` (kural 10 metni bu yönden yanlıştı, düzeltildi);
  - `smallint::text` = `2`;
  - `jsonb ->>` sayı = `0`;
  - jsonb nesne metninde anahtarlar uzunluk, sonra bayt sırasıyla (`written` beklentileri buna göre yazıldı).
- **Aynı ifadede yaz-oku:**
  - T32-3b, T33, T34'te sıra bağımlı yazmalar ayrı ifadelere bölündü.
  - Bağımsız reddedilen yazmalar (durum değiştirmeyen) tek ifadede kaldı.
  - Okumalar ayrı ifadede.

## Ön kontroller

- `pg_stat_activity`: aktif istemci bağlantısı 0.
- Oturum 0 parmak izi = 12.10 Adım 3 tabanı (`fp3_0b`), birebir.

## Oturumlar

| Oturum | İçerik | Sonuç |
|---|---|---|
| 4a | R17 katalog; T21 önizleme; T22 gerçek import; T23 tekrar; T24 silinmez; T25 güncelleme; T29 yetki; T30 projesiz | **10/10 geçti** |
| 4b | T26 a-p (15 hatalı dosya, proje ve projesiz modda); T26o; T30b; T26 gerçek; T27 | **20/20 geçti** |
| 4c | ID kurulumu; T28a-d (import'ta ID etkisi); T31 level | **10/10 geçti** |
| 4d | ID kurulumu; T32 (şantiye şefi ve admin doğrudan yazma); T33 (ID'siz geçer + audit); T34 (Ç-7) | **12/12 geçti** |
| 4e | `f1_dogrulama.sql` §6: R17-R26 (proje silme zinciri dahil) | **Geçti** (kontrol grubu 1) |
| 5 | Parmak izi | **Oturum 0 ile birebir** |

## Ayrıntı

### 4a

| Test | Gelen |
|---|---|
| R17 | `true{search_path=public}` \| anon yok \| authenticated var \| yardımcılar authenticated'a kapalı \| 7/7 trigger \| FK var \| guard'lar DEFINER |
| T21 | `w=6/0/0/0 a=5/0/0/0 l=3/0/0`, hata 0; sayılar `0/0/0/0→0/0/0/0` |
| T22 | ekle 6/5/3; `6/5/3/14` (WBS/alan/bağ/audit); TIZ-210 level 2; not ve alan tipi doğru; 14 audit satırı gerekçe "WBS/alan import: tiz.xlsx", yazan PM |
| T23 | hepsi "değişmez", `written` sıfır, audit 14, satır sürümleri (ctid) aynı |
| T24 | `not_in_file` = TIZ-310 / DEPO / B1-TIZ-310; kayıtlar duruyor (`6/5/3/14`) |
| T25 | önizlemede `["name"]` ve `["area_type"]`; gerçekte 1+1 güncelleme, audit 16, değişen alan yalnızca `name` |
| T29 | şantiye şefi ve muhasebe önizleme/gerçek/projesiz: `forbidden`; admin önizleme geçer |
| T30 | projesiz önizleme geçer, projesiz gerçek import `validation` |

### 4b

| Dosya | Proje modunda / projesiz |
|---|---|
| a WBS küçük harf | `WBS:10:code_format` / aynı |
| b tireli alan | `Alanlar:9:code_format` / aynı |
| c ad boş | `WBS:10:required_missing` / aynı |
| d Aktif "belki" | `WBS:10:value_invalid` / aynı |
| e alan tipi "tarla" | `Alanlar:9:value_invalid` / aynı |
| f disiplin "elektrik" | `WBS:10:discipline_unknown` / aynı |
| g WBS tekrar | `WBS:10:duplicate_in_file` / aynı |
| h alan tekrar | `Alanlar:9:duplicate_in_file` / aynı |
| i bağ tekrar | `Alan-WBS:7:duplicate_in_file` / aynı |
| j olmayan üst | `WBS:10:parent_missing` / aynı |
| k kendi üstü | `WBS:10:self_parent` / aynı |
| l döngü | `WBS:10:cycle,WBS:11:cycle` / aynı |
| m tanımsız bağ | `Alan-WBS:7:link_area_missing,Alan-WBS:8:link_wbs_missing` / aynı |
| n pasif üst, aktif alt | `WBS:6:…,WBS:7:inactive_parent_active_child` / aynı |
| p 5001 satır | `WBS:-:row_limit` / aynı |
| o dosya dışı aktif alt | `WBS:4:deactivate_with_active_children` / projesizde yok (beklenen) |
| T30b üst yalnızca projede | hata yok / projesizde `parent_missing` (beklenen) |
| T26 gerçek (döngülü dosya) | `validation`, satır sürümleri ve sayılar değişmedi |
| T27 (10 geçerli + 1 hatalı) | `validation` `WBS:20:code_format`, hiçbir satır yazılmadı |

### 4c

İki ID'li görev (TIZ-MEC-B1-0010 → B1/TIZ-210, TIZ-MEC-B2-0010 → B2/TIZ-220) ve bir ID'siz görev (B1/TIZ-310) kuruldu.

| Test | Gelen |
|---|---|
| T28a B1 ve INV1 pasif | önizleme `aid=1 Alanlar:5:TIZ-MEC-B1-0010`; gerçek `validation` aynı listeyle |
| T28b TIZ-210 taşıma | `WBS:6:TIZ-MEC-B1-0010` |
| T28b TIZ-200/210/220 pasif | `WBS:5` (iki ID), `WBS:6`, `WBS:7` |
| T28c B1 → TIZ-200 bağı (Karar 38, üst WBS üzerinden) | `Alan-WBS:7:TIZ-MEC-B2-0010` |
| T28 yazılmadı | satır sürümleri ve sayılar aynı |
| T28d ID'siz eşdeğerler (DEPO pasif, TIZ-310 taşıma, iki bağ) | geçti; `6/5/5/18`; TIZ-310 level 2; DEPO `false` |
| T31 level (import) | TIZ-310/311: `23` → TIZ-220 altına `34` → köke `12` |
| ID'ler | değişmedi |

### 4d

| Test | Gelen |
|---|---|
| T32-1 kod (şantiye şefi alan, admin alan, admin WBS, şantiye şefi WBS) | `KOD\|KOD\|KOD\|OK(0)`. Şantiye şefinin WBS yazma yetkisi RLS'te yok; 0 satır |
| T32-2 pasif/taşıma (şantiye şefi ve admin, alan ve WBS, üst WBS dahil) | `PAS\|PAS\|PAS\|TAS\|TAS\|TAS\|TAS` |
| T32-3 bağ (şantiye şefi/admin ekleme, şantiye şefi/admin silme) | `EKL\|EKL\|CIK\|CIK` |
| T32-3b küme (B2→TIZ-220 ekle, B1→TIZ-220 ekle, B2'yi çıkar) | `OK(1)\|OK(1)\|CIK` |
| T32-4 silme (admin alan, admin WBS, şantiye şefi alan) | `SIL\|SIL\|OK(0)` (şantiye şefinin silme yetkisi RLS'te yok) |
| T32 durum | ID'ler, B1 ve TIZ-210 değişmedi |
| T33 ID'siz (kod, pasif, taşıma, bağ ekle/sil, silme) | 10 işlem `OK(1)`. ID'siz görevi olan WBS'in kod değişikliği `KOD`: canlı kural, görevi olan kaydın kodu değişmez |
| T33 audit | şantiye şefinin alan kodu değişikliği 1, bağ ekle/sil 2 satır |
| T34 Ç-7 | aktif altı olan WBS ve alan pasifleştirilemez (`ALT`); alt önce pasifleşince üst geçer; taşınan WBS'in torunu da yeniden hesaplanır (`23→34→12`) |

### 4e

`GERI_AL:` dizesi beklenenle birebir:
- R18 önizleme yazmaz;
- R19 tekrar = değişmez, `7/3/1`, audit 11;
- ID atama;
- R20 silinmez;
- R21 import'ta `aid_impact` + doğrudan `PAS`;
- R22 `forbidden`;
- R23 `WBS:4:cycle,WBS:5:cycle,WBS:6:parent_missing`;
- R24 `KOD|TAS|EKL|CIK|SIL|SIL`;
- R25 ID'siz 7×`OK(1)`;
- R26 `ALT|23|OK(1)|12`, proje silme `del=0/0`.

## Karar 51 — görev tarafında alan-WBS kuralı (12.10.2026, ek oturumlar)

Taslak: `f1_aid_activity_id.sql` A3b, `fn_project_tasks_wbs_area_link_guard` + `trg_project_tasks_wbs_area_link_guard`
(BEFORE UPDATE OF wbs_id, area_id; SECURITY DEFINER; `authenticated`'a kapalı).
- **Neden ayrı trigger:** `fn_project_tasks_identity_guard` invoker kalmak zorunda, çünkü bayrak sahipliği `current_user`'a bakıyor.
- **Neden DEFINER:** RLS bağ satırlarını gizlese bile kontrol açık kalmasın.
- **Ad seçimi:** BEFORE trigger'lar ada göre çalışır; bu ad kimlik korumasından ve `updated_at`'ten sonra gelir. Böylece ID'li görevde doğrudan alan değişikliği önce "kilitli" mesajını alır (R14, T14 değişmedi). Canlıda `project_tasks`'taki trigger adları SELECT ile okunup doğrulandı.

**Kural 10 ön kontrolü:**
- R27'de iki hata koşmadan önce düzeltildi.
  - **Sıra:** B4 alanı B3'e çektikten sonra görevi W1'e taşımak yeni kurala takılırdı; adımların sırası değiştirildi.
  - **Kesme:** `left(…,45)` sona bir boşluk alıyordu; 44'e indirildi.
- Sıra bağımlı yazmalar ayrı ifadede.
- `OK` / `OK(n)` biçimleri ilgili yardımcıdan türetildi.

**Ön kontrol:** `pg_stat_activity` aktif bağlantı 0; Oturum 0 parmak izi = `fp4_0` birebir.

| Oturum | Kurulum | İçerik | Sonuç |
|---|---|---|---|
| K1 | B1, B2 (A3 hariç), B4, AID A1-A6, Adım 4 | ORTAK + AIDKUR + T35a-e (`f1_adim4_testler.sql` [K51]) | **7/7 geçti** |
| K2 | B1, B2 (A3 hariç), B4, F1, AID A1-A8 | `f1_dogrulama.sql` §5: R6-R16 + R27 ve katalog | **Geçti** (kontrol grubu 2) |
| 5 | — | Parmak izi | **Oturum 0 ile birebir** |

| Test | Gelen |
|---|---|
| T35a | PM bağsız WBS'e `OK(1)`; {B1} kümeli TIZ-310'a B1'li görev `OK(1)`; B2'li görev PM ve şantiye şefi ile `BAG\|BAG`; admin {B1,B2} kümeli TIZ-210'a `OK(1)` |
| T35b | B1→TIZ-200 bağı eklenir `OK(1)`; B2'li görev TIZ-220'ye (zincir {B1}, üst WBS üzerinden) `BAG` |
| T35c | ID'siz görev {B1} kümesine `OK(1)` |
| T35d | B4 bağsız alana `ERR:validation` (ayrıntıda Karar 51 mesajı); bağlı alana `OK`; ID temizlenirken bağsız alana `OK` |
| T35e | `TIZ-310/B1/TIZ-MEC-B1-0010 \| TIZ-210/DEPO/∅`; WBS audit yalnızca geçen değişiklikler (2 ve 1); B4 audit 2 |
| R27 | `B4 W1=validation \| Activity ID'li görevin alanı (A1) yeni WBS'e \| W4 \| B4 W4=BASARILI \| ZZFH-GEN-B3-0010` |

**Sınırlama:** K1 ve K2 ayrı oturumlar, çünkü MCP 95 KB sınırı tüm zinciri tek oturumda kurmaya izin vermiyor. Tam zincir
provası Adım 6 ön koşulu oldu (`faz1-adim3-tasarim.md` §9 madde 5).

## JS tarafı

- `tests/proje-kontrol-wbs-alan-excel.spec.js`: **23/23 geçti** (DB'siz).
  - T26 dosyalarının projesiz sonuçları canlıdakiyle aynı.
  - Şablon üretip geri okuma, satır numaraları, zengin metin ve sayı hücreleri, eksik sayfa ve başlık.
- `node scripts/proje-kontrol/wbs-alan/kontrol.mjs docs/proje-kontrol/sablon/wbs-alan-sablonu.xlsx`: hata yok, çıkış 0.
- ESLint: yeni dosyalarda hata yok.
