# Docx güncelleme metni — 23.10.2026

İki belgeye işlenecek değişiklikler: `fons_solar_sistem_dokumantasyonu.docx` (A) ve `fons_solar_veritabani_dokumantasyonu.docx` (B).
Kaynak: canlıya uygulanan 9 migration (`20261023122123` … `20261023134000`). Kolon bilgileri canlı `information_schema`'dan okundu.
Müşteri verisi (proje adları, alan yapısı) belgeye yazılmaz; yalnızca yapı anlatılır.

---

## A. Sistem dokümantasyonu

### A.1 Sol menü (yeni alt bölüm: "Menü bölümleri")
Sol menü artık başlıklı bölümlere ayrılır. Bölümler ve sıraları veritabanından gelir (`sidebar_sections`), her menü öğesinin hangi bölümde olduğu `role_sidebar_items.section_key`'de durur. Bölümü olmayan öğe (ör. Genel Bakış) en üstte başlıksız gösterilir; rolün hiç öğesi olmayan bölüm çizilmez. Menü daraltıldığında başlık yerine ince bir çizgi görünür.

Bölümler: Proje, Proje kontrol, Doküman ve teknik, Ticari, Satın alma ve finans, İletişim, Yönetim.

### A.2 Register sayfaları
Her register'ın kendi menü öğesi ve sayfası vardır. Sayfalar yalnızca görüntüler; kayıt ekleme ve düzenleme yok.

| Bölüm | Sayfalar |
|---|---|
| Proje kontrol | RFI, Aksiyonlar, Kararlar, Riskler, Arayüzler |
| Doküman ve teknik | Dokümanlar, Çizimler, Teknik sunumlar, Malzeme onayları |
| Ticari | Değişiklikler, Claim |

Rol görünürlüğü (Karar 6): admin ve proje yöneticisi hepsini, şantiye şefi Ticari dışındakileri, muhasebe yalnızca Ticari'yi görür. Görmediği sayfaya adresle giren kullanıcı "Bu bölüme erişimin yok." mesajını görür.

Her sayfada:
- proje seçimi;
- arama;
- durum süzgeci;
- sütun seçimi;
- sayfalama;
- satıra tıklayınca bütün alanları ve durum geçmişini gösteren yan panel.

### A.3 Riskler sayfası
Riskler, proje risklerini (`project_risks`) register düzeninde listeler.
- **Kolonlar:** RSK numarası, başlık, durum, şiddet, olasılık, etki, skor, önlem termini, risk sahibi, WBS, alan, görev.
- **Sıra:** varsayılan olarak skora göre azalan.
- **Numara:** her risk, otomatik riskler dahil, `RSK-{PROJE KODU}-{SIRA}` numarası alır (Karar 14). Mevcut riskler oluşturulma sırasıyla numaralandı.
- **Durum geçmişi:** yan panelde gösterilir.

### A.4 Uyarılar
- **Menü rozetleri:** RFI, Aksiyonlar, Kararlar ve Claim menü öğelerinde gecikmiş kayıt sayısı gösterilir.
- **Genel Bakış kartları:** Genel Bakış ekranında uyarı kartları gösterilir; her kart ilgili sayfaya götürür, uyarı yoksa kart görünmez.
  - gecikmiş RFI;
  - gecikmiş karar;
  - gecikmiş aksiyon;
  - claim ihbar süresi;
  - kritik malzeme.
- **Veri kaynağı:** uyarılar `v_register_alerts` görünümünden gelir. Kullanıcı yalnızca görme yetkisi olan register'ların uyarısını görür.

### A.5 Durum geçmişi
Durum değişiklikleri on register'da otomatik kaydedilir: RFI, karar, aksiyon, değişiklik, claim, arayüz, teknik sunum, malzeme onayı, doküman, risk. Panelde eski → yeni durum, tarih ve değiştiren kişi görünür; panelden veya sistemden yapılan değişiklikte kişi "Sistem / panel" yazar.

### A.6 Activity ID otomatik atama
Yeni görev eklendiğinde Activity ID ve WBS otomatik atanır.
- **WBS kodu:** görevin grup etiketinden, yoksa kategorisinden türetilir: MOB, MEC, DC, AC, MV, SWY, ENH, CCTV, GND, ACC, PRC.
- **ID biçimi:** `{PROJE}-{WBS}-{NNNN}`, sıra onar artar.
- **Mevcut görevler:** aynı kuralla geriye dönük dolduruldu.

---

## B. Veritabanı dokümantasyonu

### B.1 Yeni tablo: `sidebar_sections`
| Kolon | Tip | Boş | Not |
|---|---|---|---|
| section_key | text | hayır | birincil anahtar |
| label | text | hayır | menüde görünen başlık |
| order_index | integer | hayır | tekil; bölüm sırası |

Yalnızca okunur (authenticated SELECT). Migration: `20261023130558_menu_bolumler`.

### B.2 Değişen tablolar
| Tablo | Yeni kolon | Tip | Not |
|---|---|---|---|
| role_sidebar_items | section_key | text, boş olabilir | `sidebar_sections`'a bağlı; boşsa bölümsüz |
| project_risks | risk_no | text | `RSK-…`; proje içinde tekil (boş değilse) |
| project_risks | risk_owner | uuid | `profiles(id)` |
| project_risks | mitigation_due_date | date | önlem termini |
| project_risks | cost_impact / cost_currency | numeric / text (varsayılan TRY) | TRY, USD, EUR |
| project_risks | time_impact_days | integer | |
| project_risks | risk_score | integer, üretilmiş | olasılık × etki |
| decisions | decision_due_date | date | karar termini |
| decisions | cost_impact / cost_currency / time_impact_days | | riskteki gibi |
| rfis | has_time_impact / has_cost_impact | boolean, varsayılan false | |
| purchase_requests | required_on_site_date, planned_fat_date, planned_shipment_date, eta_date | date | sahada gerekli tarih ve sevkiyat tarihleri |
| purchase_requests | is_critical | boolean, varsayılan false | kritik malzeme uyarısı |
| document_revisions | web_url | text | yalnızca `https://` ile başlayabilir (SharePoint bağlantısı) |

### B.3 Görünüm: `v_register_alerts` (security_invoker)
Kolonlar:
- project_id;
- alert_type;
- register_code;
- record_id;
- record_no;
- title;
- due_date;
- days_overdue;
- severity.

| alert_type | Kaynak | Koşul |
|---|---|---|
| rfi_overdue | rfis | açık/incelemede, termin geçmiş |
| decision_overdue | decisions | önerildi, karar termini geçmiş |
| action_overdue | project_actions | açık/devam ediyor, termin geçmiş |
| claim_notice_due | claims | ihbar bekliyor, son tarih 7 gün içinde |
| critical_material_due | purchase_requests | kritik, teslim edilmemiş, sahada gerekli tarih 30 gün içinde |
| risk_mitigation_overdue | project_risks | açık, önlem termini geçmiş |

- **Rol süzgeci:** register satırları `register_view_allowed(get_my_role(), …)` ile süzülür.
- **İstisna:** `critical_material_due` satırı rol süzgeçsizdir; satın alma tablosunun kendi okuma kuralına tabidir.
- **Yetki:** anon yetkisi yok.

### B.4 Fonksiyon ve tetikleyiciler
- `register_view_allowed(rol, register)`: risk eklendi (admin, proje yöneticisi, şantiye şefi).
- `get_register_list`: `risk` dalı eklendi (numara = risk_no, skora göre sıralı).
- `get_register_status_history`: submittal, material_approval, document, risk eklendi.
- Risk numarası:
  - `trg_project_risks_assign_no`: elle girilen riskte, ekleme öncesi.
  - `trg_project_risks_assign_no_auto` + `fn_risk_assign_no_after`: otomatik riskte, ekleme sonrası.
- Durum geçmişi tetikleyicileri: `trg_project_risks_status_history`, `trg_technical_submittals_status_history`, `trg_material_approvals_status_history`, `trg_documents_status_history` (hepsi `fn_log_register_status`).
- `fn_task_assign_activity_id` + `trg_project_tasks_assign_activity_id` (görev ekleme öncesi); yardımcılar `fn_wbs_code_for_task`, `fn_wbs_name`.

### B.5 Güvenlik kuralları (RLS)
- **Okuma kuralı:** dokuz tabloda okuma artık proje erişimi **ve** rol görünürlüğü ister (`user_has_project_access(project_id) AND register_view_allowed(...)`).
  - Tablolar: `rfis`, `decisions`, `project_actions`, `documents`, `drawings`, `document_revisions`, `technical_submittals`, `material_approvals`, `register_status_history`.
  - Sonuç: muhasebe RFI, karar, aksiyon ve doküman kayıtlarını okuyamaz.
- **`project_risks`:**
  - okuma: proje erişimi (mevcut ekranlar okuduğu için daraltılmadı);
  - ekleme/güncelleme: `can_write_project_control`;
  - silme: `can_manage_project_control`.
- **Değişiklik ve claim:** yazma ve silme `can_manage_project_control` (admin, proje yöneticisi).
- **Arayüz ve doküman revizyonları:** yazma `can_write_project_control`, silme `can_manage_project_control`.

### B.6 Migration listesi
`20261023122123_diyarbakir_wbs_and_activity_ids`, `20261023122151_project_risks_align_policies_and_fields`, `20261023122202_registers_add_missing_fields_decision_rfi_procurement`, `20261023122215_register_write_policies_changes_claims_interfaces_revisions`, `20261023122426_auto_activity_id_trigger_and_backfill_all_projects`, `20261023122514_v_register_alerts_view`, `20261023122724_adana_areas_sharepoint_url_status_history_extension`, `20261023130558_menu_bolumler`, `20261023134000_register_role_hardening_risk_numbering_alert_filter`.

Acil geri dönüş dosyası `supabase/rollback/20261023134000_…down.sql` vardır; **uygulanmayacak**.
