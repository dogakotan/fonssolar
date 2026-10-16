-- Ters SQL: 20261016111406_dyb2_kablo_metraj_guncelle
-- DYB2 E2, E3, E7, E16'nın birimini, hedefini ve aylık planını eski değerlerine döndürür,
-- notlardaki "Metraj güncellemesi (16.10.2026)" satırını siler.

do $$
declare
  v_n int;
begin
  create temp table _geri on commit drop as
  select t.id, y.birim, y.hedef
  from public.project_tasks t
  join public.project_register_settings s on s.project_id = t.project_id and s.prefix = 'DYB2'
  join (values
    ('E2', 'mt', 900000::numeric, 487500::numeric),
    ('E3', 'mt', 900000, 487500),
    ('E7', 'Trafo Merkezi', 5, 60000),
    ('E16', 'mt (tahmini)', 25000, 31200)
  ) as y(kod, birim, hedef, yeni_hedef)
    on y.kod = t.task_code and t.unit = 'metre' and t.target_qty = y.yeni_hedef;

  select count(*) into v_n from _geri;
  if v_n <> 4 then
    raise exception 'Beklenen 4 iş kalemi, bulunan %', v_n;
  end if;

  update public.task_monthly_plan m
  set planned_qty = y.qty
  from public.project_tasks t
  join public.project_register_settings s on s.project_id = t.project_id and s.prefix = 'DYB2'
  join (values
    ('E2', date '2027-03-01', 25000::numeric), ('E2', date '2027-04-01', 250000),
    ('E2', date '2027-05-01', 312500), ('E2', date '2027-06-01', 312500),
    ('E3', date '2027-03-01', 25000), ('E3', date '2027-04-01', 250000),
    ('E3', date '2027-05-01', 312500), ('E3', date '2027-06-01', 312500),
    ('E7', date '2027-03-01', 2.0), ('E7', date '2027-04-01', 3.0),
    ('E16', date '2027-06-01', 10000), ('E16', date '2027-07-01', 15000)
  ) as y(kod, ay, qty) on y.kod = t.task_code
  where m.task_id = t.id and m.month = y.ay and t.id in (select id from _geri);
  get diagnostics v_n = row_count;
  if v_n <> 12 then
    raise exception 'Beklenen 12 plan satırı, güncellenen %', v_n;
  end if;

  update public.project_tasks t
  set unit = g.birim,
      target_qty = g.hedef,
      notes = nullif(regexp_replace(t.notes, E'\\n?Metraj güncellemesi \\(16\\.10\\.2026\\)[^\\n]*', '', 'g'), '')
  from _geri g
  where g.id = t.id;
end
$$;
