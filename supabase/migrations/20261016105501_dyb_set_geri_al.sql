-- DYB1/DYB2: 15.10.2026'da 1 Set yapılan 20 iş kaleminin metrajları orijinal haline döner.
-- Kullanıcı kararı (16.10.2026): "dün 1 yaptığımız metrajları orijinal haline getir".
-- Sıra: önce 20261015173313'ün ters SQL'i (mt / mt (kazı) / Km, 10 kalem + 20 kalemden
-- not satırı), sonra 20261015171128'in ters SQL'i (mt (tahmini), 10 kalem). İki blok da
-- ilgili dosyaların (supabase/rollback/) birebir aynısı; her biri satır sayılarını
-- doğrular, tutmazsa tüm işlem geri alınır.
-- Ön yüzdeki "Set = 1" gösterimi birim Set olmayınca kendiliğinden kapanır.

-- 1) 20261015173313_dyb_mt_km_birim_set geri alma
do $$
declare v_n int;
begin
  with eski(prefix, kod, birim, hedef) as (values
    ('DYB1', 'E1', 'mt (kazı)', 2020000::numeric), ('DYB1', 'E2', 'mt', 2020000), ('DYB1', 'E3', 'mt', 2020000),
    ('DYB1', 'N1', 'Km', 42), ('DYB1', 'N5', 'Km', 42),
    ('DYB2', 'E1', 'mt (kazı)', 900000), ('DYB2', 'E2', 'mt', 900000), ('DYB2', 'E3', 'mt', 900000),
    ('DYB2', 'N1', 'Km', 42), ('DYB2', 'N2', 'Km', 42))
  update public.project_tasks t
  set unit = e.birim, target_qty = e.hedef
  from eski e, public.project_register_settings s
  where s.project_id = t.project_id and s.prefix = e.prefix and t.task_code = e.kod
    and t.unit = 'Set';
  get diagnostics v_n = row_count;
  if v_n <> 10 then raise exception 'Beklenen 10 iş kalemi, güncellenen %', v_n; end if;

  with eski(prefix, kod, ay, miktar) as (values
    ('DYB1', 'E1', date '2027-03-01', 462917::numeric), ('DYB1', 'E1', date '2027-04-01', 462917),
    ('DYB1', 'E1', date '2027-05-01', 547083), ('DYB1', 'E1', date '2027-06-01', 547083),
    ('DYB1', 'E2', date '2027-03-01', 460000), ('DYB1', 'E2', date '2027-04-01', 460000),
    ('DYB1', 'E2', date '2027-05-01', 550000), ('DYB1', 'E2', date '2027-06-01', 550000),
    ('DYB1', 'E3', date '2027-03-01', 460000), ('DYB1', 'E3', date '2027-04-01', 460000),
    ('DYB1', 'E3', date '2027-05-01', 550000), ('DYB1', 'E3', date '2027-06-01', 550000),
    ('DYB1', 'N1', date '2026-09-01', 42),
    ('DYB1', 'N5', date '2027-02-01', 12.0), ('DYB1', 'N5', date '2027-03-01', 14.0), ('DYB1', 'N5', date '2027-04-01', 16.0),
    ('DYB2', 'E1', date '2027-03-01', 220588), ('DYB2', 'E1', date '2027-04-01', 220588),
    ('DYB2', 'E1', date '2027-05-01', 220588), ('DYB2', 'E1', date '2027-06-01', 238236),
    ('DYB2', 'E2', date '2027-03-01', 25000), ('DYB2', 'E2', date '2027-04-01', 250000),
    ('DYB2', 'E2', date '2027-05-01', 312500), ('DYB2', 'E2', date '2027-06-01', 312500),
    ('DYB2', 'E3', date '2027-03-01', 25000), ('DYB2', 'E3', date '2027-04-01', 250000),
    ('DYB2', 'E3', date '2027-05-01', 312500), ('DYB2', 'E3', date '2027-06-01', 312500),
    ('DYB2', 'N1', date '2026-09-01', 42),
    ('DYB2', 'N2', date '2026-11-01', 42))
  update public.task_monthly_plan m
  set planned_qty = e.miktar
  from eski e, public.project_tasks t, public.project_register_settings s
  where m.task_id = t.id and s.project_id = t.project_id
    and s.prefix = e.prefix and t.task_code = e.kod and m.month = e.ay;
  get diagnostics v_n = row_count;
  if v_n <> 30 then raise exception 'Beklenen 30 aylık plan satırı, güncellenen %', v_n; end if;

  update public.project_tasks t
  set notes = nullif(regexp_replace(t.notes, E'\\n?Birim değişikliği \\(15\\.10\\.2026\\): [^\\n]*$', ''), '')
  from public.project_register_settings s
  where s.project_id = t.project_id and s.prefix in ('DYB1', 'DYB2')
    and t.notes like '%Birim değişikliği (15.10.2026)%';
  get diagnostics v_n = row_count;
  if v_n <> 20 then raise exception 'Beklenen 20 not satırı, silinen %', v_n; end if;
end
$$;

-- 2) 20261015171128_dyb_tahmini_mt_birim_set geri alma
do $$
declare v_n int;
begin
  with eski(prefix, kod, hedef) as (values
    ('DYB1', 'E7', 105000::numeric), ('DYB1', 'E8', 210000), ('DYB1', 'E9', 105000),
    ('DYB1', 'E15', 85000), ('DYB1', 'E16', 85000), ('DYB1', 'E17', 85000), ('DYB1', 'K3', 14000),
    ('DYB2', 'E15', 25000), ('DYB2', 'E16', 25000), ('DYB2', 'E17', 25000))
  update public.project_tasks t
  set unit = 'mt (tahmini)', target_qty = e.hedef
  from eski e, public.project_register_settings s
  where s.project_id = t.project_id and s.prefix = e.prefix and t.task_code = e.kod
    and t.unit = 'Set';
  get diagnostics v_n = row_count;
  if v_n <> 10 then raise exception 'Beklenen 10 iş kalemi, güncellenen %', v_n; end if;

  with eski(prefix, kod, ay, miktar) as (values
    ('DYB1', 'E7', date '2026-11-01', 13125::numeric), ('DYB1', 'E7', date '2026-12-01', 19688),
    ('DYB1', 'E7', date '2027-03-01', 19687), ('DYB1', 'E7', date '2027-04-01', 26250),
    ('DYB1', 'E7', date '2027-05-01', 26250),
    ('DYB1', 'E8', date '2026-11-01', 26250), ('DYB1', 'E8', date '2026-12-01', 39375),
    ('DYB1', 'E8', date '2027-03-01', 39375), ('DYB1', 'E8', date '2027-04-01', 52500),
    ('DYB1', 'E8', date '2027-05-01', 52500),
    ('DYB1', 'E9', date '2026-11-01', 13125), ('DYB1', 'E9', date '2026-12-01', 19688),
    ('DYB1', 'E9', date '2027-03-01', 19687), ('DYB1', 'E9', date '2027-04-01', 26250),
    ('DYB1', 'E9', date '2027-05-01', 26250),
    ('DYB1', 'E15', date '2027-06-01', 42500), ('DYB1', 'E15', date '2027-07-01', 42500),
    ('DYB1', 'E16', date '2027-06-01', 42500), ('DYB1', 'E16', date '2027-07-01', 42500),
    ('DYB1', 'E17', date '2027-06-01', 42500), ('DYB1', 'E17', date '2027-07-01', 42500),
    ('DYB1', 'K3', date '2027-08-01', 14000),
    ('DYB2', 'E15', date '2027-06-01', 10000), ('DYB2', 'E15', date '2027-07-01', 15000),
    ('DYB2', 'E16', date '2027-06-01', 10000), ('DYB2', 'E16', date '2027-07-01', 15000),
    ('DYB2', 'E17', date '2027-06-01', 10000), ('DYB2', 'E17', date '2027-07-01', 15000))
  update public.task_monthly_plan m
  set planned_qty = e.miktar
  from eski e, public.project_tasks t, public.project_register_settings s
  where m.task_id = t.id and s.project_id = t.project_id
    and s.prefix = e.prefix and t.task_code = e.kod and m.month = e.ay;
  get diagnostics v_n = row_count;
  if v_n <> 28 then raise exception 'Beklenen 28 aylık plan satırı, güncellenen %', v_n; end if;
end
$$;
