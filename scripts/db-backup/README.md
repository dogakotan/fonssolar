# Veritabanı yedeği (`scripts/db-backup`)

Supabase ücretsiz planda otomatik yedek yok. Elle alınan bu yedekler tek güvence. Canlıya her migration'dan önce
(özellikle veri değiştirenlerden önce) iki yedek de alınmalı. Adım 6a'dan önce zorunlu (Karar 67).

| Komut | Ne alır | Dosya |
|---|---|---|
| `npm run db:backup` | **Yalnızca şema**: `public`, `storage`, `supabase_migrations` şemalarının tabloları, kolonları, kısıtları, indeksleri, fonksiyonları, trigger'ları, RLS policy'leri (storage policy'leri dahil). **Veri yok.** | `backups/dump_YYYY-MM-DD-HH-MM-SS.sql` |
| `npm run db:backup:data` | **Yalnızca veri**: `public` ve `auth` şemalarının satırları. `auth` kullanıcı hesaplarını içerir. Oturum ve token tabloları (`auth.sessions`, `refresh_tokens`, `one_time_tokens`, `flow_state`, `mfa_challenges`) alınmaz | `backups/data_YYYY-MM-DD-HH-MM-SS.sql` |

Tam geri dönüş için ikisi birlikte gerekir: önce şema, sonra veri. `auth` tablolarının yapısı Supabase'e aittir; her Supabase projesinde zaten vardır, bu yüzden şema yedeğine alınmaz.

**Kapsam dışı:** Storage'daki dosyaların kendisi. Bucket'lar ayrıca, Supabase panelinden ya da Storage API ile indirilmeli.

## Güvenlik — okuyun

- **Veri yedeği şifre özetleri (hash) içerir.** `auth.users.encrypted_password` alanı yedekte bulunur. Özet de olsa bu dosya kimlik bilgisi gibi korunmalıdır.
- Veri yedeği kişisel veri de içerir: kullanıcı adları ve e-postaları, faturalar, tedarikçiler.
- **Yedekler repoya ve paylaşılan klasörlere konmaz.**
  - `scripts/db-backup/backups/` ve `scripts/db-backup/.env.local` `.gitignore`'da (13.10.2026'da `git check-ignore` ile doğrulandı).
  - Repo OneDrive klasöründe olduğu için `backups/` OneDrive'a eşitlenir. Yedek alındıktan sonra dosyaları OneDrive dışındaki, yalnızca sizin erişebildiğiniz bir klasöre taşıyın ya da `backups/` klasörünü eşitlemeden çıkarın.
  - Yedek dosyası e-postayla, sohbetle ya da paylaşılan sürücüyle gönderilmez.
- Bir yedeği geri yüklemek canlıyı değiştirir: CLAUDE.md kuralı gereği önce gösterilip onaylanır.

## Kurulum (bir kez)

1. **PostgreSQL 17 istemci araçları** (Docker gerekmez):
   - PostgreSQL 17 Windows kurulum programında yalnızca **Command Line Tools**'u seçin; sunucu kurmanız gerekmez.
   - Kontrol: yeni bir terminalde `pg_dump --version` → `pg_dump (PostgreSQL) 17.x`.
   - `pg_dump` PATH'te yoksa betik `C:\Program Files\PostgreSQL\17\bin\pg_dump.exe`'ye de bakar.
   - Sürüm canlıdaki PostgreSQL 17 ile aynı ya da daha yeni olmalı; eskiyse betik durur.
2. Bu klasördeki `.env.local.example` dosyasını aynı klasöre `.env.local` adıyla kopyalayın.
3. `SUPABASE_DB_URL` değerini doldurun:
   - Değeri Supabase panelinden alın: Project Settings → Database → Connection string → **Session pooler** (port 5432).
   - Doğrudan bağlantı adresi ücretsiz planda yalnızca IPv6 üzerinden erişilebilir olabilir (doğrulanamadı); Session pooler IPv4 ile çalışır.
   - Adresin içindeki şifre yüzde kodlamalı (percent-encoded) olmalı. Şifrede `@`, `#`, `/`, `%` gibi karakterler varsa kodlayın (ör. `@` → `%40`).
4. `.env.local` git'te yok sayılıyor. İçeriği kimseyle paylaşılmaz ve sohbete yazılmaz.

## Çalıştırma

```bash
npm run db:backup        # şema
npm run db:backup:data   # veri (public + auth)
```

Başarılı çalışmada son satır `Tamamlandi: …\backups\… (… KB)` olur. Bağlantı adresi ekrana yazılmaz.

**Eski yol:** `node scripts/db-backup/run-backup.mjs --cli` Supabase CLI ile döküm alır (`supabase db dump`). Docker gerektirir; yalnızca yedek kip olarak duruyor.

**Doğrulama durumu (13.10.2026):**
- Betik sözdizimi kontrol edildi.
- Gerçek döküm bu makinede alınmadı (PostgreSQL istemcisi ve `.env.local` yok).
- Doğrulanamayanlar:
  - Session pooler üzerinden `auth` şemasının tüm tablolarının okunup okunamadığı;
  - `--data-only` dökümünde yabancı anahtar döngüsü uyarısı çıkıp çıkmadığı.

  Hata çıkarsa çıktıyı paylaşın; bağlantı adresini ve şifreyi paylaşmayın.
