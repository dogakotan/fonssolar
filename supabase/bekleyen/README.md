# supabase/bekleyen — canlıya uygulanmamış migration'lar

Bu klasördeki SQL dosyaları **canlıya uygulanmadı**; `supabase/migrations/` zincirinin dışındadır, `supabase db push`
ve yerel kurulum bunları uygulamaz. Uygulanınca (SQL gösterilip onay alındıktan sonra, `apply_migration` ile) aynı adla
`supabase/migrations/`'a taşınır. Ters SQL'ler `supabase/rollback/` altında.

| Dosya | İçerik | Durum |
|---|---|---|
| `20261020090000_register_okuma_rpc.sql` | `register_view_allowed` (Karar 6 "G" matrisi), `get_register_list`, `get_register_status_history` — SECURITY INVOKER, anon/PUBLIC EXECUTE yok | Prova 19.10.2026 13:44 UTC 11/11 (`…_prova.sql`), parmak izi birebir; ters SQL `supabase/rollback/` |
| `20261020090100_register_navigasyon.sql` | `role_allowed_tabs` (PM, şef, muhasebe) ve `role_sidebar_items` (dört rol) `register` satırları | Aynı provada (K10), ters SQL sonrası satır kümesi birebir |

Yardımcılar: `register_prova_sablon.sql` + `node scripts/uret-register-prova.cjs` provayı üretir;
`REGISTER_parmak_izi.sql` öncesi/sonrası parmak izi.

Sıra (uygulama kararı verilirse): okuma fonksiyonları → ön yüz (`TabRegister`) yayında → navigasyon satırları.
Navigasyon önce uygulanırsa menüde görünen sekme "Veri yüklenemedi" gösterir.
