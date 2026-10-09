# Veritabanı yedeği (`scripts/db-backup`)

Supabase ücretsiz planda otomatik yedek yok. Elle alınan bu yedekler tek güvence. Faz B'deki migration'lardan önce
(özellikle veri değiştirenlerden önce) iki yedek de alınmalı.

| Komut | Ne alır | Dosya |
|---|---|---|
| `npm run db:backup` | **Yalnızca şema**: tablolar, kolonlar, kısıtlar, indeksler, fonksiyonlar, trigger'lar, RLS policy'leri. **Veri yok.** (`supabase db dump`) | `backups/dump_YYYY-MM-DD-HH-MM-SS.sql` |
| `npm run db:backup:data` | **Yalnızca veri**: tabloların satırları (`supabase db dump --data-only --use-copy`). Şema yok | `backups/data_YYYY-MM-DD-HH-MM-SS.sql` |

Tam geri dönüş için ikisi birlikte gerekir: önce şema, sonra veri.

**Kapsam dışı:**
- Storage'daki dosyaların kendisi. Bucket'lar ayrıca, Supabase panelinden ya da Storage API ile indirilmeli.
- Kullanıcı hesapları (`auth` şeması): `supabase db dump` varsayılan olarak yalnızca uygulama şemalarını alır.

**Doğrulama durumu (07.10.2026):**
- Bayraklar (`--data-only`, `--use-copy`, `--db-url`) `npx supabase@latest db dump --help` çıktısında doğrulandı.
- Yedek komutları bu oturumda çalıştırılmadı (`.env.local` yok). Gerçek döküm doğrulanamadı.

## Kurulum (bir kez)

1. Bu klasördeki `.env.local.example` dosyasını aynı klasöre `.env.local` adıyla kopyalayın.
2. `SUPABASE_DB_URL` değerini doldurun. Değeri Supabase panelinden alın: Project Settings → Database → Connection string, "Session pooler" ya da doğrudan bağlantı (veritabanı şifresiyle).
   - CLI adresin yüzde kodlamalı (percent-encoded) olmasını ister. Şifrede `@`, `#`, `/`, `%` gibi karakterler varsa bunları kodlayın (ör. `@` → `%40`).
3. `.env.local` git'te yok sayılıyor (`.gitignore`), içeriği kimseyle paylaşılmaz ve sohbete yazılmaz.
4. Supabase CLI ayrıca kurulmaz; betik `npx supabase@latest` kullanır.
   - Not: CLI dökümü Docker gerektirebilir. Hata verirse Docker Desktop'ın açık olduğunu kontrol edin (doğrulanamadı).

## Çalıştırma

```bash
npm run db:backup        # şema
npm run db:backup:data   # veri
```

Başarılı çalışmada son satır `Tamamlandi: …\backups\… (… KB)` olur. Dosyalar `scripts/db-backup/backups/` altına yazılır; bu klasör git'te yok sayılıyor.

## Dikkat

- **Veri dökümü kişisel veri içerir** (kullanıcı adları, faturalar, tedarikçiler).
- Repo OneDrive klasöründe olduğu için `backups/` OneDrive'a eşitlenir. Bunu istemiyorsanız dökümleri OneDrive dışındaki bir klasöre taşıyın ya da klasörü eşitlemeden çıkarın.
- Bir yedeği geri yüklemek canlıyı değiştirir: CLAUDE.md kuralı gereği önce gösterilip onaylanır.
