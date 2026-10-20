# Register ekranı — yayın sırası (yalnızca okuma, ilk sürüm)

Dal: `register-ekran` (`origin/main`'den; yalnızca iki register commit'i). Hiçbir adım uygulanmadı.
Her canlı adım ayrı onayla, SQL gösterilerek yapılır (CLAUDE.md kural 1). **Adım 1 kullanıcı "başla" demeden uygulanmaz.**
**Mesai dışı ve harici yedek koşulu her canlı adımda ayrıca sorulur**; feragat edilmedikçe geçerlidir ("uygula" demek feragat değildir).

## Durum (20.10.2026 10:20 İstanbul)

| # | Adım | Durum |
|---|---|---|
| 0 | Ön kontrol | Parmak izi 20.10 07:20 UTC'de alındı: değerler aşağıdaki tabloyla aynı, yalnızca `bildirim` 1282. Prova bu tarihten sonra yeniden koşulacak |
| 1 | Okuma fonksiyonları | **Bekliyor — kullanıcının "başla"sı** (mesai dışı / yedek sorusu o anda) |
| 2 | Entegrasyon testi | Adım 1'i bekliyor |
| 3 | PR (`register-ekran`) | Dal hazır, push yok; Adım 2'yi bekliyor |
| 4 | Navigasyon | Adım 3'ün yayınını bekliyor |

Bu sıranın dışında, ayrı: F5 migration dosyası dalı `migrations/f5-changes-claims-interfaces` (yalnızca
`supabase/migrations/20261014082055_f5_changes_claims_interfaces.sql`; push/PR yok). Register adımlarına bağlı değil.

## Sıra (karar: 19.10.2026)

| # | Adım | Dosya | Ters SQL |
|---|---|---|---|
| 0 | Ön kontrol: parmak izi + prova | `supabase/bekleyen/REGISTER_parmak_izi.sql`, `supabase/bekleyen/20261020090000_register_okuma_rpc_prova.sql` | — (prova ROLLBACK ile biter) |
| 1 | Okuma fonksiyonları | `supabase/bekleyen/20261020090000_register_okuma_rpc.sql` | `supabase/rollback/20261020090000_register_okuma_rpc.down.sql` |
| 2 | Entegrasyon testi (yerel uygulama → canlı DB, yalnızca okuma) | `docs/register-entegrasyon-test-plani.md` | — |
| 3 | PR → inceleme → `main`'e birleştirme → Vercel yayını | PR kapsamı: aşağıda | Vercel'de önceki yayına dönüş |
| 4 | Navigasyon satırları | `supabase/bekleyen/20261020090100_register_navigasyon.sql` | `supabase/rollback/20261020090100_register_navigasyon.down.sql` |

**Okuma fonksiyonları (1) ile navigasyon (4) arasında ön yüzün (3) yayına çıkmış olması şarttır.**
- Navigasyon satırları menüde "Register"i açar. Bu menünün çağırdığı `get_register_list` (1) canlıda yoksa ekran
  "Veri yüklenemedi" gösterir; ön yüz (3) yayında değilse eski sürümde `register` sekmesi tanımlı olmadığından satırlar
  boşa durur. Doğru durum: fonksiyonlar var → yeni ön yüz yayında → ancak o zaman menü açılır.
- Ön yüz (3) navigasyondan (4) önce yayına çıktığında kullanıcı fark etmez: sidebar yalnızca `role_sidebar_items`'ta
  olan öğeyi gösterir. Bu arada yalnızca admin (`tabs_unrestricted`) `/dashboard/register` adresine elle girebilir;
  fonksiyonlar (1) zaten canlıda olduğu için ekran çalışır.
- Geri alma tersi sırayla: önce navigasyon ters SQL'i (4), gerekirse ön yüz, en son fonksiyon ters SQL'i (1).

## Adım 0 — ön kontrol

1. `REGISTER_parmak_izi.sql` (salt okunur). `asili_islem` = 0 olmalı.
   19.10.2026 13:42 UTC değerleri (değişebilir alanlar: `bildirim`, `zaman`):

   | Alan | Değer |
   |---|---|
   | register_n | act=0 chg=0 clm=0 dec=0 doc=0 drw=0 hist=2 itf=0 ma=0 rev=0 rfi=2 ts=0 |
   | rfi_md5 / gecmis_md5 | b2132925… / 2e90b774… |
   | sayac_md5 / onek_md5 | c586f888… / 875a8381… |
   | nav_sekme_md5 / nav_sidebar_md5 | 77a06200… / cca4e836… |
   | register_fn_n / fonksiyon_n | 0 / 119 |
   | tablo_yetki_md5 | 6e9ccf90… |

2. Prova (canlıda yalnızca `BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; <prova>; ROLLBACK;`).
   Beklenen: `PROVA SONUCU: OK 11 kontrol | matris 4 rol × 10 register: 30 yetkili / 10 yetkisiz | …`.
   Ardından parmak izi yeniden: ÖNCE ile birebir.
   Prova dosyası bekleyen SQL'den üretilir: `node scripts/uret-register-prova.cjs` (gövdeler birebir, md5 başlıkta).

## Adım 1 — okuma fonksiyonları

`apply_migration` (ad: `register_okuma_rpc`), içerik `20261020090000_register_okuma_rpc.sql`'in birebir metni.
Uygulanınca dosya aynı sürüm numarasıyla `supabase/migrations/`'a taşınır.

**Doğrulama (salt okunur):**

```sql
select p.proname, md5(pg_get_functiondef(p.oid)) as md5, p.prosecdef, p.proacl::text
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('register_view_allowed', 'get_register_list', 'get_register_status_history')
 order by 1;
```

| Fonksiyon | Beklenen `md5(pg_get_functiondef)` | `prosecdef` | ACL |
|---|---|---|---|
| `register_view_allowed(text,text)` | `a0d725a10729011555123e05a8a102be` | false | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `get_register_list(text,text)` | `fe99a25dda879e33b3d66668975a344a` | false | aynı |
| `get_register_status_history(text,uuid)` | `3341771fe44dd3a603c2ed1a15c2452f` | false | aynı |

md5'ler 19.10.2026'da canlıda ROLLBACK içinde kurularak alındı; dosya metni **LF satır sonlarıyla** gönderilmeli.
Git bu makinede dosyaları CRLF'e çevirebilir (`core.autocrlf`); CRLF'li metin uygulanırsa gövdede `\r` kalır ve md5 tutmaz
(fonksiyon yine çalışır, ama doğrulama başarısız sayılır ve ters SQL + yeniden uygulama gerekir).

Parmak izi: yalnızca `register_fn_n` 0 → 3 ve `fonksiyon_n` 119 → 122 değişir; diğer bütün alanlar ÖNCE ile aynı.

Duman testi (admin oturumunda, salt okunur): `select get_register_list('<TIZ proje id>', 'rfi')` → `{"authorized": true, "prefix": "TIZ", "rows": []}`
(19.10'da TIZ'de register kaydı yok); `select get_register_list('<DYB2 proje id>', 'rfi')` → 2 satır.
Kullanıcı etkisi yok: ön yüz bu fonksiyonları henüz çağırmıyor.

## Adım 2 — entegrasyon testi

`docs/register-entegrasyon-test-plani.md`. Geçmeden PR açılmaz.

## Adım 3 — PR, birleştirme, yayın

PR kapsamı ve dal durumu için aşağıdaki "PR kapsamı" bölümü. Yayından sonra: canlı sitede `/dashboard/register` adresine
admin test hesabıyla girilir (navigasyon yokken yalnızca admin girebilir); menüde "Register" görünmemeli.

## Adım 4 — navigasyon satırları

`apply_migration` (ad: `register_navigasyon`), içerik `20261020090100_register_navigasyon.sql`.

**Doğrulama (salt okunur):**

```sql
select 'sekme' t, role_key, order_index from role_allowed_tabs where tab_key = 'register'
union all select 'sidebar', role_key, order_index from role_sidebar_items where item_key = 'register'
order by 1, 2;
select (select count(*) from role_allowed_tabs) sekme_n, (select count(*) from role_sidebar_items) sidebar_n;
```

| Beklenen | Değer (19.10.2026 verisiyle) |
|---|---|
| `role_allowed_tabs` `register` satırı | 3 (muhasebe:11, proje_yoneticisi:11, santiye_sefi:7) — admin yok (`tabs_unrestricted`) |
| `role_sidebar_items` `register` satırı | 4 (admin:8, muhasebe:11, proje_yoneticisi:11, santiye_sefi:6) |
| toplam satır | sekme 20 → 23, sidebar 27 → 31 |
| `nav_sekme_md5` / `nav_sidebar_md5` | `2ec9ed187783ec69030886b378cc87dd` / `342ad99f4a15ba0ab6d3b5dc81ff94a2` |

`order_index` değerleri o anki en büyük değerin bir fazlasıdır; arada başka bir navigasyon değişikliği olursa
değerler ve md5'ler farklı çıkar (satır sayıları değişmez). Parmak izinde yalnızca iki `nav_*` alanı değişir.

Ekran kontrolü: admin test hesabıyla menüde "Register" ve 9 alt sekme; PM/şef/muhasebe kontrolü kendi hesaplarıyla
yalnızca görerek (gerçek kişi hesabı araçla kullanılmaz). Muhasebe 2 alt sekme (Değişiklik, Hak Talebi) görmelidir.

## Sonrası

- Kural 7: `docs/register-docx-metni.md` metni iki docx'e, Adım 1 doğrulandıktan sonra işlenir
  (ekran bölümü Adım 4'ten sonra).
- B1/B3 uygulandığında `register_view_allowed` gövdesi `register_can(p_register, 'view')` ile değiştirilir.

## PR kapsamı (20.10.2026, dal `register-ekran`, `origin/main` = 65ca584)

Karar (20.10): `faz-2-3-register` olduğu gibi PR'a açılmaz. `register-ekran` `origin/main`'den açıldı; yalnızca iki
register commit'i alındı (778a5df → 0f92ecf, 56979a5 → d60e069). Merge commit caab5f3 ve 14.10 geçmişi alınmadı.
56979a5'teki iki `docs/proje-kontrol/` dosyası bu dala girmedi: durum tablosu değişikliği yalnızca `faz-2-3-register`'da,
docx metni `docs/register-docx-metni.md`'ye taşındı. `docs/proje-kontrol/` hiçbir PR'da `main`'e girmez.

`git diff --name-status origin/main...register-ekran`: 25 dosya. Register dışında yalnızca `CLAUDE.md`
("Son değişiklik"e iki girdi; çakışma `main` sürümü alınıp girdiler eklenerek çözüldü).

Register dosyaları: `src/lib/register/`, `src/pages/dashboard/components/register/`, `Sidebar.jsx` (+1 öğe),
`index.jsx` (+3 satır), `supabase/bekleyen/` (6), `supabase/rollback/2026102009*` (2), `scripts/uret-register-prova.cjs`,
`tests-unit/register-config.test.mjs`, `tests-register-mock/`, `playwright.register-mock.config.js`,
`tests/register-canli-tiz.spec.js`, `docs/register-*.md` (3).

Bu dalda (20.10): build başarılı, `npm run test:unit` 24/24, lint 0 hata (11 uyarı, önceden var), ağ taklitli Playwright 9/9.
Eksik bağımlılık çıkmadı (`test:unit` betiği `main`'de zaten var).
