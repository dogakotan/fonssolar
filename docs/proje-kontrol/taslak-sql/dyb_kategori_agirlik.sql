-- ============================================================================
-- DYB1 ve DYB2 kategori ağırlıkları — TASLAK, UYGULANMADI
-- Tarih: 14.10.2026. Koşul: PM onayı + Diyarbakır import'u yapılmış olmalı. Uygulama "uygula" ile.
-- Import yeni projeye Karar 89 varsayılanını (15 kategori) yazar; bu SQL onu projeye özel değerle değiştirir.
-- DYB1: şalt sahası görevleri elektrik_og'de (pilot kararı), OG %18. DYB2: ENH ve şalt DYB1'de, DYB2'de %0.
-- Fiziksel olmayanlar (mobilizasyon, evrak süreci, satın alma) ve görevi olmayan kategoriler %0; toplam 100.
-- Yalnızca bu iki projenin project_category_weights satırları ve projects.progress değişir.
-- İlerleme save_project_category_weights ile aynı formülle yeniden hesaplanır. Toplam 100 kontrolü ertelenmiş
--   trigger'la (trg_check_category_weights_sum) işlem sonunda.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;
set local lock_timeout = '3s';

delete from public.project_category_weights
 where project_id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2');

insert into public.project_category_weights (project_id, category, weight_pct)
select w.project_id, w.category::public.task_category, w.weight_pct
from (values
  ('isdemir-diyarbakir-arazi-faz1', 'kolon_montaji', 10), ('isdemir-diyarbakir-arazi-faz1', 'kiris_montaji', 8),
  ('isdemir-diyarbakir-arazi-faz1', 'asik_montaji', 7),   ('isdemir-diyarbakir-arazi-faz1', 'panel_montaji', 17),
  ('isdemir-diyarbakir-arazi-faz1', 'mekanik', 3),         ('isdemir-diyarbakir-arazi-faz1', 'elektrik_dc', 12),
  ('isdemir-diyarbakir-arazi-faz1', 'elektrik_ac', 4),     ('isdemir-diyarbakir-arazi-faz1', 'elektrik_og', 18),
  ('isdemir-diyarbakir-arazi-faz1', 'kosk_trafo', 5),      ('isdemir-diyarbakir-arazi-faz1', 'topraklama', 0),
  ('isdemir-diyarbakir-arazi-faz1', 'enh', 8),             ('isdemir-diyarbakir-arazi-faz1', 'devreye_alma', 8),
  ('isdemir-diyarbakir-arazi-faz1', 'mobilizasyon', 0),    ('isdemir-diyarbakir-arazi-faz1', 'evrak_sureci', 0),
  ('isdemir-diyarbakir-arazi-faz1', 'satin_alma', 0),

  ('isdemir-diyarbakir-arazi-faz2', 'kolon_montaji', 12), ('isdemir-diyarbakir-arazi-faz2', 'kiris_montaji', 10),
  ('isdemir-diyarbakir-arazi-faz2', 'asik_montaji', 9),   ('isdemir-diyarbakir-arazi-faz2', 'panel_montaji', 22),
  ('isdemir-diyarbakir-arazi-faz2', 'mekanik', 0),         ('isdemir-diyarbakir-arazi-faz2', 'elektrik_dc', 18),
  ('isdemir-diyarbakir-arazi-faz2', 'elektrik_ac', 0),     ('isdemir-diyarbakir-arazi-faz2', 'elektrik_og', 11),
  ('isdemir-diyarbakir-arazi-faz2', 'kosk_trafo', 7),      ('isdemir-diyarbakir-arazi-faz2', 'topraklama', 0),
  ('isdemir-diyarbakir-arazi-faz2', 'enh', 0),             ('isdemir-diyarbakir-arazi-faz2', 'devreye_alma', 11),
  ('isdemir-diyarbakir-arazi-faz2', 'mobilizasyon', 0),    ('isdemir-diyarbakir-arazi-faz2', 'evrak_sureci', 0),
  ('isdemir-diyarbakir-arazi-faz2', 'satin_alma', 0)
) as w(project_id, category, weight_pct);

update public.projects pr
   set progress = coalesce((
     select round(sum(w.weight_pct * coalesce(cat.avg_progress, 0)) / 100)::integer
       from public.project_category_weights w
       left join (select t.category, avg(t.progress_pct) as avg_progress
                    from public.project_tasks t where t.project_id = pr.id group by t.category) cat
              on cat.category = w.category
      where w.project_id = pr.id), 0)
 where pr.id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2');

commit;

-- ############################################################################
-- BÖLÜM B — GERİ AL (yorum bloğu; import'un yazdığı Karar 89 varsayılanına döner, iki projede aynı)
-- ############################################################################
/*
begin;
set local lock_timeout = '3s';
delete from public.project_category_weights
 where project_id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2');
insert into public.project_category_weights (project_id, category, weight_pct)
select p.id, w.category::public.task_category, w.weight_pct
from (values ('isdemir-diyarbakir-arazi-faz1'), ('isdemir-diyarbakir-arazi-faz2')) as p(id)
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
 where pr.id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2');
commit;
*/
