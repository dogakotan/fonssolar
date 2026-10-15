-- ============================================================================
-- ADN1 ve ADN2 kategori ağırlıkları → Karar 89 listesi — TASLAK, UYGULANMADI
-- Tarih: 14.10.2026. Koşul: PM onayı (kullanıcı bildirecek). Uygulama "uygula" ile.
-- Gerçek müşteri projeleri (Kaptan Demir Çelik Adana GES-1/GES-2). Yalnızca bu iki projenin
--   project_category_weights satırları ve projects.progress değişir; başka hiçbir şeye dokunulmaz.
-- İlerleme, save_project_category_weights ile aynı formülle yeniden hesaplanır
--   (round(sum(ağırlık × kategori ortalama progress_pct) / 100)). 14.10'da iki projede de ilerleme 0.
-- Toplam 100 kontrolü ertelenmiş trigger'la işlem sonunda (trg_check_category_weights_sum).
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;
set local lock_timeout = '3s';

delete from public.project_category_weights
 where project_id in ('kaptan-demir-adana-arazi-faz1', 'kaptan-demir-adana-arazi-faz2');

insert into public.project_category_weights (project_id, category, weight_pct)
select p.id, w.category::public.task_category, w.weight_pct
from (values ('kaptan-demir-adana-arazi-faz1'), ('kaptan-demir-adana-arazi-faz2')) as p(id)
cross join (values
  ('kolon_montaji', 10), ('kiris_montaji', 8), ('asik_montaji', 7), ('panel_montaji', 17), ('mekanik', 5),
  ('elektrik_dc', 10), ('elektrik_ac', 10), ('elektrik_og', 8),
  ('kosk_trafo', 5), ('topraklama', 5), ('enh', 7), ('devreye_alma', 8),
  ('mobilizasyon', 0), ('evrak_sureci', 0), ('satin_alma', 0)
) as w(category, weight_pct);

update public.projects pr
   set progress = coalesce((
     select round(sum(w.weight_pct * coalesce(cat.avg_progress, 0)) / 100)::integer
       from public.project_category_weights w
       left join (select t.category, avg(t.progress_pct) as avg_progress
                    from public.project_tasks t where t.project_id = pr.id group by t.category) cat
              on cat.category = w.category
      where w.project_id = pr.id), 0)
 where pr.id in ('kaptan-demir-adana-arazi-faz1', 'kaptan-demir-adana-arazi-faz2');

commit;

-- ############################################################################
-- BÖLÜM B — GERİ AL (yorum bloğu; 14.10.2026 öncesi değerler, iki projede aynı)
-- ############################################################################
/*
begin;
set local lock_timeout = '3s';
delete from public.project_category_weights
 where project_id in ('kaptan-demir-adana-arazi-faz1', 'kaptan-demir-adana-arazi-faz2');
insert into public.project_category_weights (project_id, category, weight_pct)
select p.id, w.category::public.task_category, w.weight_pct
from (values ('kaptan-demir-adana-arazi-faz1'), ('kaptan-demir-adana-arazi-faz2')) as p(id)
cross join (values
  ('kolon_montaji', 10), ('kiris_montaji', 10), ('asik_montaji', 10), ('panel_montaji', 20),
  ('elektrik_dc', 10), ('elektrik_ac', 10), ('elektrik_og', 10),
  ('kosk_trafo', 5), ('topraklama', 5), ('devreye_alma', 10)
) as w(category, weight_pct);
update public.projects pr
   set progress = coalesce((
     select round(sum(w.weight_pct * coalesce(cat.avg_progress, 0)) / 100)::integer
       from public.project_category_weights w
       left join (select t.category, avg(t.progress_pct) as avg_progress
                    from public.project_tasks t where t.project_id = pr.id group by t.category) cat
              on cat.category = w.category
      where w.project_id = pr.id), 0)
 where pr.id in ('kaptan-demir-adana-arazi-faz1', 'kaptan-demir-adana-arazi-faz2');
commit;
*/
