-- Ters SQL: 20261016111121_dyb1_kablo_metraj_guncelle
-- DYB1 E2, E3, E8, E16'nın birimini, hedefini ve aylık planını eski değerlerine döndürür,
-- notlardaki "Metraj güncellemesi (16.10.2026)" satırını siler.

do $$
declare
  v_n int;
begin
  create temp table _geri on commit drop as
  select t.id, y.birim, y.hedef
  from public.project_tasks t
  join public.project_register_settings s on s.project_id = t.project_id and s.prefix = 'DYB1'
  join (values
    ('E2', 'mt', 2020000::numeric, 2225000::numeric),
    ('E3', 'mt', 2020000, 2225000),
    ('E8', 'mt (tahmini)', 210000, 190000),
    ('E16', 'mt (tahmini)', 85000, 81000)
  ) as y(kod, birim, hedef, yeni_hedef)
    on y.kod = t.task_code and t.unit = 'metre' and t.target_qty = y.yeni_hedef;

  select count(*) into v_n from _geri;
  if v_n <> 4 then
    raise exception 'Beklenen 4 iş kalemi, bulunan %', v_n;
  end if;

  update public.task_monthly_plan m
  set planned_qty = y.qty
  from public.project_tasks t
  join public.project_register_settings s on s.project_id = t.project_id and s.prefix = 'DYB1'
  join (values
    ('E2', date '2027-03-01', 460000::numeric), ('E2', date '2027-04-01', 460000),
    ('E2', date '2027-05-01', 550000), ('E2', date '2027-06-01', 550000),
    ('E3', date '2027-03-01', 460000), ('E3', date '2027-04-01', 460000),
    ('E3', date '2027-05-01', 550000), ('E3', date '2027-06-01', 550000),
    ('E8', date '2026-11-01', 26250), ('E8', date '2026-12-01', 39375),
    ('E8', date '2027-03-01', 39375), ('E8', date '2027-04-01', 52500),
    ('E8', date '2027-05-01', 52500),
    ('E16', date '2027-06-01', 42500), ('E16', date '2027-07-01', 42500)
  ) as y(kod, ay, qty) on y.kod = t.task_code
  where m.task_id = t.id and m.month = y.ay and t.id in (select id from _geri);
  get diagnostics v_n = row_count;
  if v_n <> 15 then
    raise exception 'Beklenen 15 plan satırı, güncellenen %', v_n;
  end if;

  update public.project_tasks t
  set unit = g.birim,
      target_qty = g.hedef,
      notes = nullif(regexp_replace(t.notes, E'\\n?Metraj güncellemesi \\(16\\.10\\.2026\\)[^\\n]*', '', 'g'), '')
  from _geri g
  where g.id = t.id;
end
$$;
