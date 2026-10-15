# 05.10.2026 canlı migration arşivi (salt kayıt — ÇALIŞTIRILMAZ)

Bu üç dosya, canlı `supabase_migrations.schema_migrations.statements` içeriğinin birebir kopyasıdır
(06.10.2026'da çekildi; md5 değerleri veritabanındaki `md5(array_to_string(statements, E'\n'))` ile eşleşti).
Yerel `supabase/migrations/` klasöründe karşılıkları yoktu; git geçmişinde, stash'te, worktree'de ve diskte
iz bulunamadı — kim/hangi oturumdan uygulandığı doğrulanamadı.

| Version | Ad | md5 |
|---|---|---|
| 20261005103850 | faz1_wbs_alan_activity | 74a35d9c4d0baa7abb7d762b37cc29f3 |
| 20261005125957 | project_control_phase1_core | b558e75fee2c419db08bf08bc7a2cbf5 |
| 20261005132810 | project_control_phase1b_hardening | b849aac961b14987b37c966fd5c7008c |

Bilinçli olarak `supabase/migrations/` altına konmadı: bu şemanın korunup korunmayacağı Karar #0'a bağlı
(bkz. CLAUDE.md "Proje Kontrol (Faz A)"). Karar "koru" olursa dosyalar aynı version adlarıyla oraya taşınır.

Dikkat: `faz1_wbs_alan_activity` "yalnızca ekleyici" değildir — `project_tasks`'ın 228 satırında
`baseline_start/end` alanlarını `planned_start/end` ile doldurur (veri güncellemesi).
`project_control_phase1_core` ise 03.08.2026'da kullanıcı kararıyla kaldırılan `project_tasks.is_critical`
kolonunu yeniden ekler.
