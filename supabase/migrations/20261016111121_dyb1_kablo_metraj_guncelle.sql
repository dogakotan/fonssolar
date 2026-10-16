-- DYB1: kablo çekim kalemlerinin birimi ve miktarı malzeme listesindeki kablo metrajına göre güncellenir.
-- Kullanıcı kararı (16.10.2026): "diyarbakır-1 iş kalemi ve detaya bakıp birimi güncelle"; birim + miktar,
-- E3 (reglaj) E2 ile aynı.
--   E2  DC Kablo Çekimi (String)        2.020.000 mt           → 2.225.000 metre (1x6 mm² 1.600.000 + 1x10 mm² 625.000)
--   E3  Kablo Reglaj İşçilik            2.020.000 mt           → 2.225.000 metre (E2 ile aynı)
--   E8  DC Kablo Çekimi (Trafo Merkezi)   210.000 mt (tahmini) →   190.000 metre (1x400 mm² AL)
--   E16 OG Kablo Çekimi                    85.000 mt (tahmini) →    81.000 metre (1x150/25 21.000 + 1x400/35 60.000)
-- Kazı/kapatma kalemleri (hendek metresi) kapsam dışı. Görev adları değişmez.
-- Aylık plan aynı oranla ölçeklenir: tam sayıya yuvarlanır, eksik kalan en büyük küsurlu aylara
-- (eşitlikte önce erken ay) birer birer verilir; toplam yeni hedefe tam eşit. Excel kaynak bilgisi
-- (source, source_qty, source_unit) değişmez. Eski birim ve hedef görev notuna bir satır olarak eklenir.
-- Kalemlerde ilerleme kaydı yok; varsa migration durur.
-- Tetiklenen: yalnızca updated_at ve kimlik koruması; bildirim üretilmez.
-- Ters SQL: supabase/rollback/20261016111121_dyb1_kablo_metraj_guncelle.down.sql

do $$
declare
  v_n int;
  v_bad int;
begin
  create temp table _kablo on commit drop as
  select t.id, t.task_code, t.unit as eski_birim, t.target_qty as eski_hedef, y.yeni_hedef, y.kaynak
  from public.project_tasks t
  join public.project_register_settings s on s.project_id = t.project_id and s.prefix = 'DYB1'
  join (values
    ('E2',  'mt',           2020000::numeric, 2225000::numeric, 'DC Kablo 1x6 mm² 1.600.000 + 1x10 mm² 625.000 metre'),
    ('E3',  'mt',           2020000,          2225000,          'E2 ile aynı: DC Kablo 1x6 + 1x10 mm²'),
    ('E8',  'mt (tahmini)',  210000,           190000,          'DC Kablo 1x400 mm² AL 190.000 metre'),
    ('E16', 'mt (tahmini)',   85000,            81000,          'OG Kablo 1x150/25 21.000 + 1x400/35 60.000 metre')
  ) as y(kod, birim, hedef, yeni_hedef, kaynak)
    on y.kod = t.task_code and y.birim = t.unit and y.hedef = t.target_qty;

  select count(*) into v_n from _kablo;
  if v_n <> 4 then
    raise exception 'Beklenen 4 iş kalemi (birim ve hedef eşleşmeli), bulunan %', v_n;
  end if;

  select count(*) into v_bad from public.progress_daily pd join _kablo k on k.id = pd.task_id;
  if v_bad > 0 then
    raise exception 'İlerleme kaydı olan kalem var (% satır); miktar değiştirilmez', v_bad;
  end if;

  select count(*) into v_bad
  from (
    select k.id
    from _kablo k
    join public.task_monthly_plan m on m.task_id = k.id
    group by k.id, k.eski_hedef
    having sum(m.planned_qty) <> k.eski_hedef
  ) x;
  if v_bad > 0 then
    raise exception 'Aylık plan toplamı hedefe eşit olmayan % kalem var', v_bad;
  end if;

  with olcek as (
    select m.id, m.task_id, m.month, m.planned_qty * k.yeni_hedef / k.eski_hedef as ham, k.yeni_hedef
    from public.task_monthly_plan m
    join _kablo k on k.id = m.task_id
  ),
  taban as (
    select id, task_id, month, yeni_hedef, floor(ham) as alt, ham - floor(ham) as kusur
    from olcek
  ),
  dagitim as (
    select id, alt,
      row_number() over (partition by task_id order by kusur desc, month, id) as sira,
      yeni_hedef - sum(alt) over (partition by task_id) as eksik
    from taban
  )
  update public.task_monthly_plan m
  set planned_qty = d.alt + case when d.sira <= d.eksik then 1 else 0 end
  from dagitim d
  where d.id = m.id;

  -- SET ifadesindeki t.unit güncelleme öncesi değerdir (eski birim nota yazılır).
  update public.project_tasks t
  set unit = 'metre',
      target_qty = k.yeni_hedef,
      notes = concat_ws(E'\n', nullif(t.notes, ''),
        format('Metraj güncellemesi (16.10.2026): %s %s → %s metre (%s); aylık plan aynı oranla ölçeklendi.',
               replace(to_char(k.eski_hedef, 'FM999,999,999,990'), ',', '.'), t.unit,
               replace(to_char(k.yeni_hedef, 'FM999,999,999,990'), ',', '.'), k.kaynak))
  from _kablo k
  where k.id = t.id;

  select count(*) into v_bad
  from (
    select k.id
    from _kablo k
    join public.task_monthly_plan m on m.task_id = k.id
    group by k.id, k.yeni_hedef
    having sum(m.planned_qty) <> k.yeni_hedef
  ) x;
  if v_bad > 0 then
    raise exception 'Ölçek sonrası toplamı hedefe eşit olmayan % kalem var', v_bad;
  end if;
end
$$;
