-- Geri alma: 20261015173313_dyb_mt_km_birim_set
-- A) 10 iş kalemini eski birimine, hedefine ve aylık plan miktarlarına döndürür
--    (değerler 15.10.2026 canlı SELECT'inden).
-- B) Migration'ın eklediği "Birim değişikliği (15.10.2026): …" not satırını 20 kalemden siler
--    (A'daki 10 + 20261015171128'in 10 kalemi). 20261015171128'in birim/plan değişikliğine
--    dokunmaz; onun geri alması kendi ters SQL'inde.

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
