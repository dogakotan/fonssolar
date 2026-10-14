-- ============================================================================
-- Varsayılan kategori ağırlıkları — 15 kategori (Karar 89) — TASLAK, uygulama "uygula" ile
-- Tarih: 14.10.2026. Plan: docs/proje-kontrol/proje-ekleme-hotfix-plani.md §6.
-- Değişen nesne: yalnızca public.fn_seed_default_category_weights() (AFTER INSERT ON projects trigger'ı
--   trg_seed_default_category_weights'ın fonksiyonu). Tablo, trigger tanımı, kısıtlar ve mevcut projelerin
--   ağırlıkları DEĞİŞMEZ; yalnızca bundan sonra açılan projeler yeni listeyi alır.
-- Aynı liste Excel import'unda supabase/functions/import-project-excel/mapping.ts CANONICAL_CATEGORY_WEIGHTS'te
--   (hotfix/proje-ekleme dalında güncellenir); ikisi aynı kalmalı.
-- CREATE OR REPLACE fonksiyonun sahibini, yetkilerini (postgres, service_role) ve SECURITY DEFINER/search_path'ini korur.
-- Toplam 100 (trg_check_category_weights_sum ertelenmiş kontrolü); %0 değerler CHECK (0-100) içinde.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;
set local lock_timeout = '3s';

create or replace function public.fn_seed_default_category_weights()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  -- Varsayılan liste 14.10.2026 (Karar 89): 15 kategori, toplam 100; fiziksel olmayanlar %0.
  INSERT INTO project_category_weights (project_id, category, weight_pct)
  SELECT NEW.id, w.category::task_category, w.weight_pct
  FROM (VALUES
    ('kolon_montaji', 10), ('kiris_montaji', 8), ('asik_montaji', 7), ('panel_montaji', 17), ('mekanik', 5),
    ('elektrik_dc', 10), ('elektrik_ac', 10), ('elektrik_og', 8),
    ('kosk_trafo', 5), ('topraklama', 5), ('enh', 7), ('devreye_alma', 8),
    ('mobilizasyon', 0), ('evrak_sureci', 0), ('satin_alma', 0)
  ) AS w(category, weight_pct)
  WHERE NOT EXISTS (SELECT 1 FROM project_category_weights WHERE project_id = NEW.id);
  RETURN NEW;
END;
$function$;

commit;

-- ############################################################################
-- BÖLÜM B — GERİ AL (yorum bloğu; özgün gövde karakteri karakterine; ROLLBACK testinde md5 ile doğrulandı)
-- ############################################################################
/*
begin;
set local lock_timeout = '3s';
create or replace function public.fn_seed_default_category_weights()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  INSERT INTO project_category_weights (project_id, category, weight_pct)
  SELECT NEW.id, w.category::task_category, w.weight_pct
  FROM (VALUES
    ('kolon_montaji', 10), ('kiris_montaji', 10), ('asik_montaji', 10), ('panel_montaji', 20),
    ('elektrik_dc', 10), ('elektrik_ac', 10), ('elektrik_og', 10),
    ('kosk_trafo', 5), ('topraklama', 5), ('devreye_alma', 10)
  ) AS w(category, weight_pct)
  WHERE NOT EXISTS (SELECT 1 FROM project_category_weights WHERE project_id = NEW.id);
  RETURN NEW;
END;
$function$;
commit;
*/
