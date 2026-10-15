-- Geri alma: 20261015171128_dyb_tahmini_mt_birim_set
-- 10 iş kalemini "mt (tahmini)" birimine, eski hedefine ve eski aylık plan
-- miktarlarına döndürür (değerler 15.10.2026 canlı SELECT'inden).

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
