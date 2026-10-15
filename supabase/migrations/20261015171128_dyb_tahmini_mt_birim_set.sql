-- DYB1/DYB2: birimi uzunluk tahmini ("mt (tahmini)") olan 10 iş kalemi "1 Set" olur.
-- Kullanıcı kararı (15.10.2026):
--   * yalnızca "mt (tahmini)" (10 kalem); "Adet (tahmini)" olan K2, N3, N4 aynen kalır;
--   * hedef 1 Set; aylık plan eski oranla dağıtılır (2 ondalık, en büyük kalan
--     yöntemiyle toplam tam 1);
--   * Excel kaynak bilgisi (source, source_qty, source_unit) değişmez.
-- Kalemlerde ilerleme kaydı yok; ilerleme kaydı varsa migration durur.
-- Tetiklenen: yalnızca updated_at ve kimlik koruması (risk/ilerleme tetikleyicileri
-- unit/target_qty/planned_qty'yi dinlemiyor; bildirim üretilmez).
-- Ters SQL: supabase/rollback/20261015171128_dyb_tahmini_mt_birim_set.down.sql

do $$
declare
  v_n int;
  v_bad int;
begin
  create temp table _set_hedef on commit drop as
  select t.id, t.target_qty as eski_hedef
  from public.project_tasks t
  join public.project_register_settings s on s.project_id = t.project_id
  where t.unit = 'mt (tahmini)'
    and (s.prefix, t.task_code) in (
      ('DYB1', 'E7'), ('DYB1', 'E8'), ('DYB1', 'E9'), ('DYB1', 'E15'), ('DYB1', 'E16'),
      ('DYB1', 'E17'), ('DYB1', 'K3'), ('DYB2', 'E15'), ('DYB2', 'E16'), ('DYB2', 'E17'));

  select count(*) into v_n from _set_hedef;
  if v_n <> 10 then
    raise exception 'Beklenen 10 iş kalemi, bulunan %', v_n;
  end if;

  select count(*) into v_bad from public.progress_daily pd join _set_hedef h on h.id = pd.task_id;
  if v_bad > 0 then
    raise exception 'İlerleme kaydı olan kalem var (% satır); birim değiştirilmez', v_bad;
  end if;

  -- Aylık planın toplamı eski hedefe eşit olmalı (oran toplamı 1).
  select count(*) into v_bad
  from (
    select h.id
    from _set_hedef h
    join public.task_monthly_plan m on m.task_id = h.id
    group by h.id, h.eski_hedef
    having sum(m.planned_qty) <> h.eski_hedef
  ) x;
  if v_bad > 0 then
    raise exception 'Aylık plan toplamı hedefe eşit olmayan % kalem var', v_bad;
  end if;

  with oranlar as (
    select m.id, m.task_id, m.planned_qty / h.eski_hedef as oran
    from public.task_monthly_plan m
    join _set_hedef h on h.id = m.task_id
  ),
  taban as (
    select id, task_id, floor(oran * 100) / 100 as alt, oran * 100 - floor(oran * 100) as kalan
    from oranlar
  ),
  dagitim as (
    select id, alt,
      row_number() over (partition by task_id order by kalan desc, id) as sira,
      round((1 - sum(alt) over (partition by task_id)) * 100) as eksik
    from taban
  )
  update public.task_monthly_plan m
  set planned_qty = round(d.alt + case when d.sira <= d.eksik then 0.01 else 0 end, 2)
  from dagitim d
  where d.id = m.id;

  update public.project_tasks t
  set unit = 'Set', target_qty = 1
  from _set_hedef h
  where h.id = t.id;

  select count(*) into v_bad
  from (
    select m.task_id
    from public.task_monthly_plan m
    join _set_hedef h on h.id = m.task_id
    group by m.task_id
    having sum(m.planned_qty) <> 1
  ) x;
  if v_bad > 0 then
    raise exception 'Dağıtım sonrası toplamı 1 olmayan % kalem var', v_bad;
  end if;
end
$$;
