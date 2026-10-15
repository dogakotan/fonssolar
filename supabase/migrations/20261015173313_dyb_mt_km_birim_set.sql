-- DYB1/DYB2: birimi mt, mt (kazı) ve Km olan 10 iş kalemi "1 Set" olur (20261015171128'in devamı).
-- Kullanıcı kararı (15.10.2026): "mt ve km'leri de set yapalım". Kapsam yalnızca DYB1/DYB2:
--   DYB1 E1 (mt (kazı)), E2, E3 (mt), N1, N5 (Km); DYB2 E1 (mt (kazı)), E2, E3 (mt), N1, N2 (Km).
--   ADN1 DC02 / ADN2 EDC-01 (m) ve ilerlemesi olan TIZ E2 / TKY ELK-01 (mt) kapsam dışı.
-- A) Bu 10 kalem: hedef 1 Set; aylık plan eski oranla dağıtılır (2 ondalık, en büyük kalan
--    yöntemi, eşitlikte önce erken ay; toplam tam 1). Excel kaynak bilgisi
--    (source, source_qty, source_unit) değişmez. Eski birim ve hedef görev notuna bir satır
--    olarak eklenir.
-- B) 20261015171128 ile zaten 1 Set olan 10 kalemin ("mt (tahmini)") notuna da aynı satır
--    eklenir (o migration not yazmamıştı). Birim/hedef/plan değişmez.
-- Kalemlerde ilerleme kaydı yok; ilerleme kaydı varsa migration durur.
-- Tetiklenen: yalnızca updated_at ve kimlik koruması; bildirim üretilmez.
-- Ters SQL: supabase/rollback/20261015173313_dyb_mt_km_birim_set.down.sql

do $$
declare
  v_n int;
  v_bad int;
begin
  -- A) mt / mt (kazı) / Km → 1 Set
  create temp table _set_hedef on commit drop as
  select t.id, t.target_qty as eski_hedef
  from public.project_tasks t
  join public.project_register_settings s on s.project_id = t.project_id
  where t.unit in ('mt', 'mt (kazı)', 'Km')
    and (s.prefix, t.task_code) in (
      ('DYB1', 'E1'), ('DYB1', 'E2'), ('DYB1', 'E3'), ('DYB1', 'N1'), ('DYB1', 'N5'),
      ('DYB2', 'E1'), ('DYB2', 'E2'), ('DYB2', 'E3'), ('DYB2', 'N1'), ('DYB2', 'N2'));

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
    select m.id, m.task_id, m.month, m.planned_qty / h.eski_hedef as oran
    from public.task_monthly_plan m
    join _set_hedef h on h.id = m.task_id
  ),
  taban as (
    select id, task_id, month, floor(oran * 100) / 100 as alt, oran * 100 - floor(oran * 100) as kalan
    from oranlar
  ),
  dagitim as (
    select id, alt,
      row_number() over (partition by task_id order by kalan desc, month, id) as sira,
      round((1 - sum(alt) over (partition by task_id)) * 100) as eksik
    from taban
  )
  update public.task_monthly_plan m
  set planned_qty = round(d.alt + case when d.sira <= d.eksik then 0.01 else 0 end, 2)
  from dagitim d
  where d.id = m.id;

  -- SET ifadesindeki t.unit güncelleme öncesi değerdir (eski birim nota yazılır).
  update public.project_tasks t
  set unit = 'Set',
      target_qty = 1,
      notes = concat_ws(E'\n', nullif(t.notes, ''),
        format('Birim değişikliği (15.10.2026): %s %s → 1 Set; aylık plan eski oranla dağıtıldı.',
               replace(to_char(h.eski_hedef, 'FM999,999,999,990'), ',', '.'), t.unit))
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

  -- B) 20261015171128'in 10 kalemine not satırı (eski değerler o migration'ın ters SQL'inden)
  with eski(prefix, kod, hedef) as (values
    ('DYB1', 'E7', 105000::numeric), ('DYB1', 'E8', 210000), ('DYB1', 'E9', 105000),
    ('DYB1', 'E15', 85000), ('DYB1', 'E16', 85000), ('DYB1', 'E17', 85000), ('DYB1', 'K3', 14000),
    ('DYB2', 'E15', 25000), ('DYB2', 'E16', 25000), ('DYB2', 'E17', 25000))
  update public.project_tasks t
  set notes = concat_ws(E'\n', nullif(t.notes, ''),
        format('Birim değişikliği (15.10.2026): %s mt (tahmini) → 1 Set; aylık plan eski oranla dağıtıldı.',
               replace(to_char(e.hedef, 'FM999,999,999,990'), ',', '.')))
  from eski e, public.project_register_settings s
  where s.project_id = t.project_id and s.prefix = e.prefix and t.task_code = e.kod
    and t.unit = 'Set' and t.target_qty = 1
    and coalesce(t.notes, '') not like '%Birim değişikliği (15.10.2026)%';
  get diagnostics v_n = row_count;
  if v_n <> 10 then
    raise exception 'B: beklenen 10 iş kalemi, güncellenen %', v_n;
  end if;
end
$$;
