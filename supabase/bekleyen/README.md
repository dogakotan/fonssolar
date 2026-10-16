# supabase/bekleyen — canlıya uygulanmamış migration'lar

Bu klasördeki SQL dosyaları **canlıya uygulanmadı**. `supabase/migrations/` zincirinin dışında
tutulurlar; `supabase db push` ve yerel kurulum bunları **uygulamaz**.

Bir dosya canlıya uygulanınca (SQL gösterilip onay alındıktan sonra, `apply_migration` ile) aynı adla
`supabase/migrations/` klasörüne taşınır. Ters SQL'leri `supabase/rollback/` altında.

| Dosya | İçerik | Durum (15.10.2026) |
|---|---|---|
| `20261015130200_isdemir_wbs_from_group_label.sql` | İsdemir görevlerine WBS (grup etiketinden) | DYB2'nin 7 görevi silindikten sonra yeniden üretilecek (İP-10, İP-11) |
| `20261015130300_isdemir_baseline_freeze.sql` | İsdemir baseline dondurma | Bu fazda uygulanmaz (İP-11) |

`130000` ve `130100` 16.10.2026'da uygulandı: `supabase/migrations/20261016115400_task_dependencies_cycle_and_site_chief_guard.sql`,
`supabase/migrations/20261016115418_project_tasks_site_chief_plan_guard.sql`.

Ayrıntı: `docs/is-plani-kararlar.md`, `docs/is-plani-faz1-veri-temeli.md`.
