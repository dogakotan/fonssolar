# Karar 6 (yetki matrisi) ve Karar 10 (dört göz) — onaylı hal

Tarih: 13.10.2026. Kaynak: tasarım 4.3 önerisi + kullanıcı kararları (13.10.2026).
Uygulama: B1 seed'i (`taslak-sql/b1_register_permissions.sql` A2) güncellendi; canlıda BEGIN…ROLLBACK ile yeniden test edildi (§4).
Canlıya hiçbir şey uygulanmadı.

## 1. Karar 6 — rol × register matrisi

G görüntüle, O oluştur, D düzenle, S sil, On onayla. **E** evet, **H** hayır. ¹ yalnızca kendi kaydı (`edit_scope = own`).

| Register | Admin G | O | D | S | On | PM G | O | D | S | On | Ş.şefi G | O | D | S | On | Muh. G | O | D | S | On |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| document | E | E | E | E | E | E | E | E | H | E | E | E | E¹ | H | H | H | H | H | H | H |
| drawing | E | E | E | E | E | E | E | E | H | E | E | H | H | H | H | H | H | H | H | H |
| rfi | E | E | E | E | E | E | E | E | H | E | E | E | E¹ | H | H | H | H | H | H | H |
| submittal | E | E | E | E | E | E | E | E | H | E | E | H | H | H | H | H | H | H | H | H |
| material_approval | E | E | E | E | E | E | E | E | H | E | E | H | H | H | H | H | H | H | H | H |
| interface | E | E | E | E | E | E | E | E | H | E | E | H | H | H | H | H | H | H | H | H |
| decision | E | E | E | E | E | E | E | E | H | **H** | E | H | H | H | H | H | H | H | H | H |
| action | E | E | E | E | E | E | E | E | H | E | E | E | E¹ | H | H | H | H | H | H | H |
| risk | E | E | E | E | E | E | E | E | H | E | E | E | E¹ | H | H | H | H | H | H | H |
| change | E | E | E | E | E | E | E | E | H | **H** | H | H | H | H | H | E | H | H | H | H |
| claim | E | E | E | E | E | E | E | E | H | **H** | H | H | H | H | H | E | H | H | H | H |
| procurement | E | H | H | H | H | E | H | H | H | H | E | H | H | H | H | E | H | H | H | H |
| subcontractor | E | H | H | H | H | E | H | H | H | H | E | H | H | H | H | E | H | H | H | H |
| payment | E | H | H | H | H | E | H | H | H | H | H | H | H | H | H | E | H | H | H | H |
| ncr | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |
| inspection | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |

Tasarım 4.3 önerisinden farklar:
- **Şantiye şefi:**
  - risk düzenler (kendi kaydı);
  - document düzenler (kendi kaydı);
  - change görmez ve açmaz (değişiklik talebi Ticket ile);
  - interface açmaz.
- **PM:** decision, change, claim onaylamaz (change/claim Faz 5 başında yeniden bakılır).
- **Köprüler:** procurement, subcontractor, payment tüm rollerde en fazla G (yazma mevcut satın alma/finans akışlarından). Şantiye şefi payment'ı görmez (ilke).

Diğer kararlar:
- "P1" = Faz 3 kapsamı: document, drawing, rfi, action, risk, decision.
- Silme yalnızca admin; yalnızca taslak/reddedilmiş kayıt silinir, onaylı kayıt iptal edilir (B3).

## 2. Karar 10 — dört göz

| Konu | Kural | Nerede |
|---|---|---|
| Kapsam | Yalnızca decision, risk, change, claim. Oluşturan kullanıcı hesabı kendi kaydını onaylayamaz | B3 `approve_register_record` (zaten bu dört tip; uyumlu) |
| Admin'in kendi kaydı | Başka bir admin onaylar (seçenek a). Ön koşul: genel "Admin" hesabı onay yapamaz (§3) | B1 matrisi + §3 mekanizması |
| `four_eyes_enabled` | Kalır, varsayılan açık. Yalnızca admin değiştirir; değişiklik audit'e yazılır | B3'e eklenecek (§5) |
| Kritik risk kapanışı | Elle açılmış (`source = 'manuel'`) ve `severity = 'kritik'` riskte kapanış önce "onay bekliyor" durumuna geçer; PM veya admin onaylar, oluşturan onaylayamaz. Kritik olmayan risk onaysız kapanır. Otomatik riskler kapsam dışı; motor davranışı değişmez | Faz 3 Risk standardizasyonu (Karar 14 ile birlikte) |
| Decision | Kaydın onayı yalnızca admin (matris). İş durumu (`proposed → approved` vb.) yalnızca onaylı kayıtta değişir | B1 matrisi + B3 (uyumlu) |
| Change, Claim | Admin onayı ilkesi; ayrıntı Faz 5 başında | Faz 5 kontrol listesi |

Kritik risk kapanışı için Faz 3'te çözülecek ayrıntılar:
- **Oluşturan bilgisi:** `project_risks`'te `created_by` kolonu yok (13.10.2026 salt okunur kontrol). Eklenmeli. Eski kayıtlarda oluşturan boş kalır; bu kayıtlarda "oluşturan dışında" kontrolü yapılamaz. Önerim: PM ve admin onaylayabilir; karar Faz 3 tasarımında.
- **Bekleyen kapanışın durumu:** canlı status listesi `açık`, `azaltıldı`, `kabul_edildi`, `kapatıldı`. Bekleyen kapanış için ya yeni bir durum değeri ya da `record_state` (Karar 14) kullanılır.
- **`closed_at`:** yalnızca gerçek kapanışta yazılır; `fn_set_risk_closed_at` değişmez.

## 3. Genel "Admin" hesabı — onay yapamaması için mekanizma (öneri, uygulanmadı)

Canlıda 3 admin hesabı var (13.10.2026, salt okunur sayım). Biri kişiye bağlı değil. Kişi bazlı dört göz kuralı bu hesapla aşılabilir: kişi kendi hesabıyla açar, genel hesapla onaylar.

**Hesap için seçenekler (karar sizde):**
1. **Hesabı kapatmak:** auth'ta yasaklanır veya silinir. Kod değişikliği gerekmez; geçmiş kayıtlardaki kullanıcı kimliği kalır.
2. **Salt okunur / acil durum hesabına çevirmek:** aşağıdaki M1 veya M2 ile. Kullanım prosedürü ister: şifre kasada, her kullanım bildirimli.

**B1/B3 mekanizması:**

| | M1 — hesap bazlı istisna (önerim) | M2 — rol değişikliği |
|---|---|---|
| Nasıl | B1'e `register_approval_exclusions(user_id, reason, created_at, created_by)`. Listedeki hesapta `register_can(…, 'approve')` false döner. Listeyi yalnızca admin değiştirir; değişiklik audit'e yazılır | `roles`'a yeni rol (ör. `admin_acil`): `register_permissions`'ta yalnızca G, navigasyon satırları ayrı. Hesabın rolü değiştirilir |
| Etki alanı | Yalnızca register onayı. Hesap uygulamanın geri kalanında admin kalır | Bütün uygulama: `isAdmin` false olur, admin ekranları kapanır (fatura onayı, kullanıcı yönetimi dahil) |
| Kapsadığı yerler | B3'ün onay, ret ve yeniden açma fonksiyonları (`approve`/`reject`/`reopen_register_record`) ve Faz 3 kritik risk kapanış onayı. Bu sonuncusu da `register_can('risk','approve')` kullanmalı | Aynı, rol üzerinden |
| Maliyet | Küçük: bir tablo, `register_can`'e bir koşul, bir admin fonksiyonu, test | Rol satırı, navigasyon satırları, ön yüz kontrolü (navigasyon DB'den okunuyor); "salt okunur hesap" seçeneğine doğal karşılık |
| Test etkisi | `b3_dogrulama.sql`'deki ikinci admin listedeki hesaptan seçilmemeli | Aynı |

Not: genel hesap register dışındaki onay akışlarında da (fatura, BOM değişikliği) ikinci göz kontrolünü aşabilir. Bu Karar 10'un kapsamı dışında; hesap kararıyla birlikte değerlendirilmeli.

## 4. B1 yeniden testi (Adım 2 yöntemi, canlıda BEGIN…ROLLBACK, 13.10.2026)

| Oturum | İçerik | Sonuç |
|---|---|---|
| 0 | Aktif bağlantı (idle olmayan) / 5 dk'dan uzun işlem; parmak izi (`parmak_izi.sql`) | 0 / 0; parmak izi alındı |
| 1 | `lock_timeout=3s`, `statement_timeout=60s`; tek DO bloğu: B1 BÖLÜM A + `b1_dogrulama.sql` gövdesi; sonu hata → geri alındı | `DOGRULAMA SONUCU: OK \| B1 \| 13 kontrol grubu \| seed 64, Karar 6 matrisi birebir \| geçiş durumları canlı CHECK ile uyumlu` |
| 5 | Parmak izi | Oturum 0 ile birebir (fn/con/trg/idx/acl/pol/pub/view md5, sayaçlar, sequence'ler, projeler, TIZ verisi, bildirim 1233, `new_objs` 0) |

- Oturum 1'de çalıştırılan SQL, dosyalardan otomatik birleştirildi. Yalnızca yorum satırları çıkarıldı.
- Kural 10 ön kontrolü:
  - matris sorgusunun takma adları değişkenlerle çakışmıyor;
  - bayraklar `case` ile harfe çevriliyor (boolean metni yok);
  - okuma ve yazma ayrı ifadelerde.
- `f1_adim2_testler_oturum4.sql` T8a yalnızca rfi satırına bakıyor; rfi değişmedi, yeniden koşulmadı.
- `b3_dogrulama.sql`'e "PM decision onaylayamaz" kontrolü eklendi. B3 koşulmadı (Faz 2).

## 5. B3'e eklenecekler (Faz 2; bu turda yapılmadı)

1. `four_eyes_enabled` değişikliği: yalnızca admin, gerekçeli, audit'li bir fonksiyon (ör. `set_project_four_eyes`). Bugün `project_register_settings`'te yalnızca SELECT policy var; B3 yalnızca kolonu ekliyor.
2. §3 mekanizması (M1 veya M2) onaylanırsa B1/B3'e eklenir.
3. `b3_dogrulama.sql` ikinci admin seçimi, istisna listesindeki hesabı dışlamalı.
