-- Yeniden inşa edilmiş migration (15.09.2026, 4. tur) — bu dosya canlıda
-- (supabase_migrations.schema_migrations, version 20260812060349) uygulanmış
-- ama yerel bir karşılığı olmadığı fark edildi (proaktif migration-drift
-- taraması, bkz. CLAUDE.md "Migration tracking boşluğu"). İçerik canlı DB'nin
-- GÜNCEL şemasından (information_schema.columns/pg_constraint/pg_indexes)
-- yeniden kuruldu — tarihi SQL'in birebir aynısı garantisi yok, ama bir
-- `db reset`'i aynı nihai şemaya ulaştırır. Aylık Satın Alma Planı ekranının
-- (`ProjeTabAylikPlan.jsx`) veri kaynağı olan tablo — proje bazlı, ay bazlı
-- planlanan satın alma kalemlerini tutar.
--
-- Not: RLS policy'si burada BİLEREK sonradan (20260904082158,
-- `restrict_procurement_monthly_plan_rls_to_pm_admin`, zaten yerel dosyası
-- mevcut) tarafından değiştirilecek eski/gevşek haliyle yazıldı — o
-- migration'ın kendi yorumuna göre ("önceki policy muhasebe hariç herkese
-- yazma izni veriyordu") reconstruct edildi. Sıradaki migration bunu zaten
-- DROP+CREATE ile değiştirdiğinden, bir db reset'te nihai policy doğru
-- (admin/proje_yoneticisi'ne kısıtlı) durumda kalır.
--
-- Bu tablonun GERÇEK VERİSİ (`import_kaptan_demir_1ay_plan`, version
-- 20260812060410) kasıtlı olarak yeniden inşa edilmedi — gerçek bir müşteri
-- projesinin (Kaptan Demir Çelik) aylık satın alma planı verisi, git
-- geçmişine kalıcı olarak gömülmesi istenmedi (kullanıcı kararı, bkz.
-- CLAUDE.md "Migration tracking boşluğu"). Aynı nedenle bu tabloyu/project_tasks'ı
-- etkileyen 13 veri migration'ı daha (Adana Faz1 WBS yeniden yapılandırması +
-- WBS/Gantt senkron adımları) da yeniden inşa edilmedi.

create table if not exists public.procurement_monthly_plan (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  procurement_item_id uuid references public.procurement_items(id) on delete set null,
  ay_no integer not null check (ay_no > 0),
  kategori text,
  kalem_adi text not null,
  ozellik text,
  birim text,
  miktar numeric,
  not_metni text,
  durum text not null default 'planlandi'
    check (durum = any (array['planlandi', 'siparis_verildi', 'teslim_alindi'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_procurement_monthly_plan_project
  on public.procurement_monthly_plan(project_id);
create index if not exists idx_procurement_monthly_plan_item
  on public.procurement_monthly_plan(procurement_item_id);

alter table public.procurement_monthly_plan enable row level security;

drop policy if exists procurement_monthly_plan_access on public.procurement_monthly_plan;
create policy procurement_monthly_plan_access
on public.procurement_monthly_plan
for all
to public
using (has_project_access(project_id) and get_my_role() <> 'muhasebe')
with check (has_project_access(project_id) and get_my_role() <> 'muhasebe');
