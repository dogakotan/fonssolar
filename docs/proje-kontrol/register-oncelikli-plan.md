# Register öncelikli plan (Karar 66-74)

Tarih: 14.10.2026. Onay: kullanıcı, 14.10.2026. Hiçbir adım uygulanmadı.

## Sıra

1. **Yedek** (Karar 67): `pg_dump` ile şema + veri + auth. Kullanıcı PostgreSQL 17 Command Line Tools'u kurup `.env.local`'i (Session pooler) hazırlar ve iki komutu kendisi çalıştırır. Ayrıntı: `scripts/db-backup/README.md`.
2. **Adım 6a — canlıya DB omurgası** (Karar 68):
   - **Kapsam:** B1, B2, B4, F1 A1-A3 (A4 hariç), AID, Adım 4 SQL ve Adım 5'ten yalnızca A7 (Ç-6 RLS daraltması).
   - **Prova:** psql ile tam zincir provası:
     - aktif bağlantı kontrolü ve parmak izi;
     - tek işlem: B1 → B2 → B4 → F1 → AID → Adım 4 → A7;
     - `f1_dogrulama.sql` R1-R27, ardından ROLLBACK;
     - parmak izi; `lock_timeout` 3s, `statement_timeout` 180s, mesai dışı.
   - **Prova yönetimi:** prova SQL'i ve çalıştırma planı önce gösterilir; kullanıcı "başla" demeden koşulmaz.
   - **Kalıcı uygulama:** paket paket `apply_migration` ile:
     - her paketin SQL'i önce gösterilir, kullanıcı "uygula" deyince uygulanır, her seferinde yedek hatırlatılır;
     - her paketten sonra kendi doğrulaması koşulur;
     - en sonda mevcut ekranlar `PW_TARGET=live` ile kontrol edilir.
   - **Docx:** şema değiştiği için `fons_solar_*` docx'lerinin güncellenmesi gerekir (kural 7).
3. **Faz 2** (B5 hariç): B3, B6, dört göz, S4a (`four_eyes_enabled` admin fonksiyonu), S4b (Karar 64 istisnası), kalıcı G-01 çözümü. Test: Adım 2 yöntemi, canlıda ROLLBACK, psql ile (Karar 70).
4. **Faz 3:** RFI pilot → Document, Drawing (external link) → Action, Risk (kritik kapanış onayı, `created_by`, RSK, Karar 14/65) → Decision. UI testleri canlıda yalnızca TIZ, `PW_TARGET=live` (Karar 72).
5. **6b:** Docker ve yerel ortam, Adım 5 testleri, Adım 5 SQL + frontend, Excel v8 import deploy, Diyarbakır (Karar 74), F1 A4.
6. **Faz 4**, ardından **MVP canlıya alma**.
7. **Baseline migration:** Ocak 2027 (Karar 71).

## Dal (Karar 73)

- **`faz-2-3-register`:** `main`'den açıldı. Taslak SQL'ler, `docs/proje-kontrol/`, CLAUDE.md ve `scripts/db-backup/` buraya alındı. Faz 2-3 işleri bu dalda yapılır.
  - Çalışma kopyası ayrı bir klasörde (`git worktree`): `C:\Users\fonss\OneDrive\Masaüstü\GES_Dashboard-faz23`. Ana klasördeki commit'lenmemiş dosyalara dokunmamak için böyle açıldı.
- **`faz-a-proje-kontrol`:** Adım 5 frontend'i burada, 6b'ye kadar bekler.
- **Günlük rapor iptal filtresi:** ilk Faz 3 deploy'unda yeni dala alınır (Karar 69).

## 6a'nın mevcut ekranlara etkisi (13.10.2026 değerlendirmesi)

- Yeni kırılma yok. Koşullu riskler:
  - Activity ID ataması veya register'ın göreve bağlanması (Karar 69: 6b'ye kadar yapılmaz, register formlarında görev bağı alanı gizli);
  - iptal görev + eski günlük rapor formu;
  - Excel'de durumu "iptal" yapılan görev (oturumsuz import reddedilir, import yarım kalır).
- Kullanıcı duyurusu: 6b'ye kadar görev iptal edilmez, Excel'de görev durumu "iptal" yapılmaz.

## Test bildirimleri (Karar 72 eki; 14.10.2026 salt okunur kontrol)

**Bulgular:**
- Register tablolarında (`rfis`, `documents`, `drawings`, `project_actions`, `decisions`, `project_risks`, submittal/approval) bildirim üreten trigger yok. Yalnızca numara, durum geçmişi, `updated_at` ve risk `closed_at` trigger'ları var.
- B1-B6 taslaklarında da `notify_*` çağrısı yok.
- **Sonuç:** Faz 2-3 taslaklarıyla bir RFI veya onay akışı bugün kimseye bildirim göndermez.
- Ama mevcut bildirim fonksiyonları **proje bazlı değil, rol bazlı**:
  - `notify_role(p_role_key, …)` o roldeki tüm profillere gider;
  - `notify_managers` tüm `is_manager` rollerine (admin, muhasebe) gider;
  - proje kimliği yalnızca bildirim satırına yazılır.

  Bu yüzden TIZ'de satın alma, fatura, ticket veya günlük rapor üreten her test bugün de gerçek kişilere bildirim gönderir.
- **TIZ "üyeliği":** proje erişimi rol bazlı.
  - Admin ve muhasebe (`is_manager`) ile PM (`cross_project`) her projeye erişir.
  - TIZ'e özel bağlı tek hesap: ev projesi TIZ olan 1 şantiye şefi hesabı (test hesabına benziyor).
  - `user_project_access`'te TIZ satırı yok.
- **Hesaplar** (rol bazında toplam / test e-postasına benzeyen; e-posta deseni ile, isim yok):

  | Rol | Toplam | Test e-postasına benzeyen |
  |---|---|---|
  | admin | 3 | 0 |
  | muhasebe | 2 | 0 |
  | proje_yoneticisi | 3 | 1 |
  | santiye_sefi | 2 | 2 |

  - Admin ve muhasebe tarafında test hesabı görünmüyor.
  - Playwright'ın `.env.test`'teki admin ve muhasebe hesaplarının gerçek kişilere mi ait olduğu doğrulanamadı (`.env.test` okunmuyor).

**Plan (Faz 3 UI testlerinden önce, kullanıcı onayıyla uygulanır):**
1. **Test hesapları:**
   - 4 rol için ayrı test hesapları: admin ve muhasebe için yeni; PM ve şantiye şefi için mevcut test hesapları ya da yenileri.
   - E-postalar ayırt edilebilir olur (ör. `…+e2e@…`).
   - Hesaplar `create-user` edge function ile açılır; şifreleri kullanıcı `.env.test`'e yazar. Şifreler sohbete yazılmaz.
   - Şantiye şefi test hesabının ev projesi TIZ.
2. **Test projesi ve test hesabı işaretleri** (küçük bir DB değişikliği; SQL gösterilip onaylanır):
   - `projects.is_test boolean default false` (TIZ, TKY = true);
   - `profiles.is_test_account boolean default false`.
3. **Bildirim süzgeci:** `notify_role`, `notify_managers` ve `notify_user` güncellenir.
   - **Kural:** `p_project_id` bir test projesiyse bildirim yalnızca test hesaplarına gider; gerçek projelerin bildirimi test hesaplarına gitmez.
   - **Uyumluluk:** imzalar değişmez (kural 2); yalnızca alıcı seçimine bir koşul eklenir.
   - **Doğrulama:** canlıda ROLLBACK ile test edilir; TIZ'de talep oluşturulunca yalnızca test hesaplarına bildirim düştüğü gösterilir.
4. **Erişim:** TIZ erişimini yalnızca test hesaplarıyla sınırlamak rol modeli yüzünden mümkün değil (Karar 63: admin/PM/muhasebe her projeye erişir). Bu yüzden asıl önlem bildirim süzgeci; erişim değiştirilmez.
5. **Faz 3'te register bildirimi eklenirse** aynı süzgeçten geçer; alıcılar rol bazlı değil, proje erişimine göre seçilir.

## Takvim (13.10.2026 tahmini; hafta sonu ve 29 Ekim çalışılmaz, girdiler en geç 2 iş gününde)

| Adım | Tarih |
|---|---|
| Yedek araçları | 14-15 Ekim |
| 6a | 16-19 Ekim |
| Faz 2 | 20-28 Ekim |
| İlk register ekranda (RFI pilot, canlıda TIZ) | **5 Kasım** |
| Faz 3 | 16 Kasım |
| 6b | 17-26 Kasım |
| Faz 4 | 27 Kasım - 10 Aralık |
| Canlıya alma hazırlığı | 11, 14, 15 Aralık |
| MVP canlı | **16 Aralık** (sıralı). Docker Faz 3 sırasında paralel kurulursa **14 Aralık** |
