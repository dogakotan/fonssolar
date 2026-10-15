# Veritabanı yedeği (`scripts/db-backup`)

Supabase ücretsiz planda otomatik yedek yok. Elle alınan bu yedekler tek güvence. Canlıya her migration'dan önce
(özellikle veri değiştirenlerden önce) iki yedek de alınmalı. Adım 6a'dan önce zorunlu (Karar 67).

| Komut | Ne alır | Dosya |
|---|---|---|
| `npm run db:backup` | **Yalnızca şema**: `public`, `storage`, `supabase_migrations` şemalarının tabloları, kolonları, kısıtları, indeksleri, fonksiyonları, trigger'ları, RLS policy'leri (storage policy'leri dahil). **Veri yok.** | `<yedek klasörü>\dump_YYYY-MM-DD-HH-MM-SS.sql` |
| `npm run db:backup:data` | **Yalnızca veri**: `public` ve `auth` şemalarının satırları. `auth` kullanıcı hesaplarını içerir. Oturum ve token tabloları (`auth.sessions`, `refresh_tokens`, `one_time_tokens`, `flow_state`, `mfa_challenges`) alınmaz | `<yedek klasörü>\data_YYYY-MM-DD-HH-MM-SS.sql` |

Tam geri dönüş için ikisi birlikte gerekir: önce şema, sonra veri. `auth` tablolarının yapısı Supabase'e aittir; her Supabase projesinde zaten vardır, bu yüzden şema yedeğine alınmaz.

**Kapsam dışı:** Storage'daki dosyaların kendisi. Bucket'lar ayrıca, Supabase panelinden ya da Storage API ile indirilmeli.

## Güvenlik — okuyun

- **Veri yedeği şifre özetleri (hash) içerir.** `auth.users.encrypted_password` alanı yedekte bulunur. Özet de olsa bu dosya kimlik bilgisi gibi korunmalıdır.
- Veri yedeği kişisel veri de içerir: kullanıcı adları ve e-postaları, faturalar, tedarikçiler.
- **Yedekler repoya ve paylaşılan klasörlere konmaz.**
  - Repo OneDrive klasöründe. Bu yüzden `.env.local` ve yedekler **OneDrive dışında** tutulur (aşağıda "Dosyaların yeri").
  - Repo içindeki eski yollar (`scripts/db-backup/backups/`, `scripts/db-backup/.env.local`) `.gitignore`'da (13.10.2026'da `git check-ignore` ile doğrulandı). Betik bu yolları kullanmak zorunda kalırsa OneDrive uyarısı verir.
  - Yedek dosyası e-postayla, sohbetle ya da paylaşılan sürücüyle gönderilmez.
- Bir yedeği geri yüklemek canlıyı değiştirir: CLAUDE.md kuralı gereği önce gösterilip onaylanır.

## Dosyaların yeri

Betik `.env.local`'i ve yedek klasörünü şu sırayla arar:

| | 1. öncelik | 2. öncelik | 3. öncelik (uyarı verir) |
|---|---|---|---|
| `.env.local` | `FONS_BACKUP_ENV` ortam değişkeni (dosyanın tam yolu) | `C:\fons-yedek\.env.local` | `scripts/db-backup/.env.local` (repo içi, OneDrive) |
| Yedek klasörü | `FONS_BACKUP_DIR` (ortam değişkeni ya da `.env.local` içinde bir satır) | `C:\fons-yedek\backups` (`C:\fons-yedek` klasörü varsa) | `scripts/db-backup/backups` (repo içi, OneDrive) |

- Seçilen yol OneDrive altındaysa betik `UYARI: … OneDrive altinda` yazar ve devam eder.
- Önerilen düzen: her şey `C:\fons-yedek\` altında. Ortam değişkeni gerekmez.

## Kurulum (bir kez)

1. **PostgreSQL 17 istemci araçları** (Docker gerekmez):
   - PostgreSQL 17 Windows kurulum programında yalnızca **Command Line Tools**'u seçin; sunucu kurmanız gerekmez.
   - Kontrol: yeni bir terminalde `pg_dump --version` → `pg_dump (PostgreSQL) 17.x`.
   - `pg_dump` PATH'te yoksa betik `C:\Program Files\PostgreSQL\17\bin\pg_dump.exe`'ye de bakar.
   - Sürüm canlıdaki PostgreSQL 17 ile aynı ya da daha yeni olmalı; eskiyse betik durur.
2. **OneDrive dışında klasör ve `.env.local`:**
   - `C:\fons-yedek` klasörünü oluşturun. Klasör yalnızca sizin hesabınızın erişebildiği yerel bir klasör olmalı; OneDrive, Google Drive ya da ağ paylaşımı olmamalı.
   - Repodaki `scripts/db-backup/.env.local.example` dosyasını `C:\fons-yedek\.env.local` olarak kopyalayın.
   - Başka bir yer kullanacaksanız `FONS_BACKUP_ENV` ve `FONS_BACKUP_DIR` ortam değişkenlerini ayarlayın; ya da `FONS_BACKUP_DIR=…` satırını `.env.local`'e yazın.
3. `SUPABASE_DB_URL` değerini doldurun:
   - Değeri Supabase panelinden alın: Project Settings → Database → Connection string → **Session pooler** (port 5432).
   - Doğrudan bağlantı adresi ücretsiz planda yalnızca IPv6 üzerinden erişilebilir olabilir (doğrulanamadı); Session pooler IPv4 ile çalışır.
   - Adresin içindeki şifre yüzde kodlamalı (percent-encoded) olmalı. Şifrede `@`, `#`, `/`, `%` gibi karakterler varsa kodlayın (ör. `@` → `%40`).
4. `.env.local`'in içeriği kimseyle paylaşılmaz ve sohbete yazılmaz.

## Çalıştırma

```bash
npm run db:backup        # şema
npm run db:backup:data   # veri (public + auth)
```

Başarılı çalışmada son satır `Tamamlandi: C:\fons-yedek\backups\… (… KB)` olur. Bağlantı adresi ekrana yazılmaz.
`UYARI: … OneDrive altinda` satırı görürseniz durun ve "Dosyaların yeri"ne göre düzeltin.

## Kısa kontrol listesi (sizin adımlarınız)

1. PostgreSQL 17 kurulum programında yalnızca Command Line Tools'u kurun; yeni bir terminalde `pg_dump --version` 17.x göstermeli.
2. `C:\fons-yedek` klasörünü oluşturun.
3. `scripts\db-backup\.env.local.example` dosyasını `C:\fons-yedek\.env.local` olarak kopyalayın.
4. `SUPABASE_DB_URL`'ye Session pooler adresini yazın (şifre yüzde kodlamalı). Değeri kimseyle paylaşmayın.
5. Repo klasöründe şunları çalıştırın:
   - `npm run db:backup`
   - `npm run db:backup:data`
6. Kontrol:
   - iki çıktının da son satırı `Tamamlandi: C:\fons-yedek\backups\…`;
   - `UYARI` satırı yok.
7. Bana yalnızca dosya adlarını, boyutlarını ve varsa hata metnini bildirin. Bağlantı adresini ve şifreyi bildirmeyin.

**Eski yol:** `node scripts/db-backup/run-backup.mjs --cli` Supabase CLI ile döküm alır (`supabase db dump`). Docker gerektirir; yalnızca yedek kip olarak duruyor.

**Doğrulama durumu (14.10.2026):**
- Betik sözdizimi kontrol edildi. Yol seçimi denendi: olmayan bir `FONS_BACKUP_ENV` açık hatayla duruyor; repo içi yol OneDrive altında, `C:\fons-yedek` dışında algılanıyor.
- Gerçek döküm bu makinede alınmadı (PostgreSQL istemcisi ve `.env.local` yok).
- Doğrulanamayanlar:
  - Session pooler üzerinden `auth` şemasının tüm tablolarının okunup okunamadığı;
  - `--data-only` dökümünde yabancı anahtar döngüsü uyarısı çıkıp çıkmadığı.

  Hata çıkarsa çıktıyı paylaşın; bağlantı adresini ve şifreyi paylaşmayın.
