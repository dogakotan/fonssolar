# Proje Kontrol — şantiye şefi ve muhasebe nasıl girer? (karar notu, kod yok)

Tarih: 07.10.2026 · Dayanak: `frontend-tasarim-notu.md` (06.10), canlı `role_allowed_tabs` / `role_sidebar_items`
(07.10.2026 sorgusu), tasarım v3 §4.3 ve §4.7. Karar Faz B'de verilir (tasarım Bölüm 3, 27 Eki - 2 Kas haftası).

## 1. Sorun

"Proje Kontrol", `ProjeDetay` içinde 8. sekme olarak tasarlandı (`/dashboard/projeler/{id}/kontrol`). `ProjeDetay`'a
yalnızca `projeler` sekmesi olan roller ulaşır.

| Rol | Üst seviye sekmeler (canlı, 07.10.2026) | ProjeDetay'a ulaşır mı | Register görme yetkisi (tasarım 4.3, B1 seed'i) |
|---|---|---|---|
| admin | kısıtsız | Evet | Hepsi |
| proje_yoneticisi | genel, projeler, satin-alma, tickets, kullanicilar, proje-ekle, bildirimler, finans | Evet | Hepsi |
| santiye_sefi | genel, is-plani, daily-report, rapor-listesi, satin-alma, tickets, bildirimler | **Hayır** | Document, Drawing, RFI, Action, Risk, Interface, Change, Submittal, MA, Decision, Procurement, Subcontractor (V; bazılarında C/E) |
| muhasebe | genel, finans, satin-alma, bildirimler, odemeler | **Hayır** | Yalnızca Change, Claim, Procurement, Subcontractor, Payment (V). **Faz B-C register'larının hiçbiri değil** |

**Sonuç:**
- Şantiye şefinin Faz C pilotunda (Document, RFI, Action) kesinlikle bir girişe ihtiyacı var.
- Muhasebenin göreceği register'lar Faz D'de geliyor. Bugün giriş açmak boş bir ekran gösterir.

## 2. Seçenekler

### A · Üst seviye `kontrol` sekmesi (sidebar'da "Proje Kontrol")

Rolün `role_allowed_tabs` / `role_sidebar_items` satırına `kontrol` eklenir. `Sidebar.jsx`'e ikon ve etiket eklenir (CLAUDE.md notu: yalnızca DB satırı yetmez). `index.jsx`'te `<ProjeKontrolTab projectId={…} />` render edilir. URL: `/dashboard/kontrol?register=…&kayit=…`.

**Artıları:**
- Satın almadaki mevcut desenin aynısı (`<ProjeTabSatinAlma siteChiefView projectId={authProjectId}>`).
- Kapsam genişlemez: şantiye şefi ProjeDetay'ın diğer 7 sekmesini (Finans dahil) görmez.
- `role_allowed_tabs` DB tabanlı, kod değişmeden rol eklenir/çıkarılır.
- Şantiye şefi tek projeli, proje otomatik çözülür (`ScopeContext`).

**Eksileri:**
- Aynı ekrana iki yol olur (admin/PM için ProjeDetay içinden, diğerleri için üst seviye). Bildirim derin bağlantısı rol-farkında iki URL'den birini seçmeli (`goToInvoice` deseni).
- Çok projeli bir rol üst seviyeden girerse bir proje seçici gerekir.

### B · Mevcut bir sekmenin içine gömmek

Şantiye şefi için `is-plani` (register'lar aktiviteye bağlı) ya da `satin-alma` sekmesinin içinde bir alt sekme. Muhasebe için `finans` içinde.

**Artıları:**
- Yeni sidebar maddesi yok; "ayrı üst seviye ekran açma" tercihine (hafıza notu) en yakın.

**Eksileri:**
- Register'lar İş Planı'na ya da Satın Alma'ya ait değil. Kullanıcı RFI'yi İş Planı'nın içinde aramaz.
- Her rolde farklı bir yerde olur, bildirim derin bağlantıları ve testler karmaşıklaşır.
- `TabIsPlan` / `ProjeTabSatinAlma` büyür.

### C · Rol bazlı yönlendirme: şantiye şefine `projeler` vermek

Şantiye şefi `projeler`'e girer, liste RLS ile yalnızca kendi projesini gösterir, `/dashboard/kontrol` → `/dashboard/projeler/{kendi projesi}/kontrol` yönlendirmesi yapılır.

**Artıları:**
- Tek URL, tek giriş noktası; bildirimler tek yoldan gider.

**Eksileri:**
- ProjeDetay iç sekmelerinin rol bazlı yetki mekanizması yok (`frontend-tasarim-notu.md` §1): şantiye şefi Finans, Ekip vb. 7 sekmenin hepsini görür.
- Bunu kapatmak için önce ProjeDetay'a sekme bazlı yetki eklemek gerekir. Daha büyük ve riskli bir değişiklik, Faz B'nin kapsamı dışında.

## 3. Öneri

**A.** Bileşen tek kalır (`ProjeKontrolTab`), yalnızca iki giriş noktası olur:

1. **admin ve proje_yoneticisi:** `ProjeDetay` → `kontrol` sekmesi. Görünürlük `get_my_register_permissions`'tan en az bir `view` gelmesiyle belirlenir. Faz B'de yalnızca admin (tasarım).
2. **santiye_sefi:** Faz C sonunda (tasarım: "Proje Kontrol grubu … santiye_sefi rollerine açılır") üst seviye `kontrol` sekmesi açılır.
   - `role_allowed_tabs` / `role_sidebar_items`'a `('santiye_sefi','kontrol')` satırı eklenir. Bu bir veri migration'ıdır, SQL'i ayrıca onaylanır.
   - Proje `ScopeContext` / `profiles.project_id`'den gelir.
3. **muhasebe:** Şimdi **giriş açılmaz**. Faz B-C register'larında görme yetkisi olmadığı için ekran boş olurdu. Faz D'de (Change, Claim, Payment köprüsü) aynı A yolu açılır. Muhasebe çok projeli olduğu için o zaman bir proje seçici eklenir (mevcut `ScopeContext` deseni).
4. **Bildirimler:** `goToRegisterRecord(projectId, type, id)`:
   - `navigation.tabs` `projeler` içeriyorsa `/dashboard/projeler/{p}/kontrol?register=&kayit=` adresine gider;
   - içermiyor ama `kontrol` içeriyorsa `/dashboard/kontrol?register=&kayit=` adresine gider;
   - ikisi de yoksa bildirim türü o role hiç gönderilmez. CLAUDE.md: "alıcı rolün ilgili sekmeyi gerçekten görebildiğini doğrula".
5. **Testler (T26-T27):** 4 rol × iki giriş noktası. URL yenilenince aynı kayıt açılmalı.

Bu öneri, hafızadaki "yeni özelliği önce mevcut ekrana alt sekme olarak entegre et" tercihiyle kısmen çelişiyor. Admin ve PM için gerçekten mevcut ekrana (ProjeDetay) giriyor. Şantiye şefi için üst seviye sekme, ProjeDetay'a erişimi olmadığı ve yetki mekanizması olmadan açılamayacağı için gerekli. **Senin onayın gerekir.**
