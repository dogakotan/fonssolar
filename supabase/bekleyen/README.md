# supabase/bekleyen — canlıya uygulanmamış migration'lar

Bu klasördeki SQL dosyaları **canlıya uygulanmadı**; `supabase/migrations/` zincirinin dışındadır, `supabase db push`
ve yerel kurulum bunları uygulamaz. Uygulanınca (SQL gösterilip onay alındıktan sonra, `apply_migration` ile) aynı adla
`supabase/migrations/`'a taşınır. Ters SQL'ler `supabase/rollback/` altında.

| Dosya | İçerik | Durum |
|---|---|---|
| ~~`20261020090000_register_okuma_rpc.sql`~~ | `register_view_allowed`, `get_register_list`, `get_register_status_history` | **Uygulandı 20.10.2026** (canlı sürüm `20261020080127`); dosya `supabase/migrations/20261020080127_register_okuma_rpc.sql`, ters SQL `supabase/rollback/20261020080127_register_okuma_rpc.down.sql`. Prova dosyası (`…_prova.sql`) burada kalır; adındaki numara eski |
| ~~`20261020090100_register_navigasyon.sql`~~ | `role_allowed_tabs` (PM, şef, muhasebe) ve `role_sidebar_items` (dört rol) `register` satırları — **Uygulandı 20.10.2026** (`20261020083341`), dosya `supabase/migrations/` | Aynı provada (K10), ters SQL sonrası satır kümesi birebir |

Yardımcılar: `register_prova_sablon.sql` + `node scripts/uret-register-prova.cjs` provayı üretir;
`REGISTER_parmak_izi.sql` öncesi/sonrası parmak izi.

Sıra (uygulama kararı verilirse): okuma fonksiyonları → ön yüz (`TabRegister`) yayında → navigasyon satırları.
Navigasyon önce uygulanırsa menüde görünen sekme "Veri yüklenemedi" gösterir.
