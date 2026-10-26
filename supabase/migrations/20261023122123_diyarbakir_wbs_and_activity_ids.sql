-- 1) WBS master (level 1) for Diyarbakir Faz1 / Faz2
with defs(code, name, disc, ord) as (
  values
   ('MOB','Mobilizasyon','MOB',1),
   ('MEC','Mekanik','MEC',2),
   ('DC','Elektriksel DC','DC',3),
   ('MV','Elektriksel OG','MV',4),
   ('SWY','Şalt Sahası','SWY',5),
   ('ENH','ENH','ENH',6),
   ('CCTV','Kamera ve Aydınlatma','CCTV',7),
   ('ACC','Kabul ve Evrak','ACC',8)
)
insert into public.project_wbs (project_id, wbs_code, name, level, discipline)
select p.project_id, d.code, d.name, 1, d.disc
from (values ('isdemir-diyarbakir-arazi-faz1'),('isdemir-diyarbakir-arazi-faz2')) as p(project_id)
cross join defs d
on conflict (project_id, wbs_code) do nothing;

-- 2) Map group_label -> WBS code, assign wbs_id and activity_id (only where still empty)
with mapped as (
  select t.id, t.project_id,
    case t.group_label
      when 'Mobilizasyon' then 'MOB'
      when 'Mekanik' then 'MEC'
      when 'Elektriksel — DC' then 'DC'
      when 'Elektriksel — DC › Trafo Merkezi' then 'DC'
      when 'Elektriksel — OG' then 'MV'
      when 'Şalt Sahası' then 'SWY'
      when 'ENH' then 'ENH'
      when 'Kamera & Aydınlatma' then 'CCTV'
      when 'KABUL' then 'ACC'
    end as code,
    t.planned_start, t.task_code
  from public.project_tasks t
  where t.project_id in ('isdemir-diyarbakir-arazi-faz1','isdemir-diyarbakir-arazi-faz2')
    and t.activity_id is null
),
numbered as (
  select m.*, (row_number() over (partition by m.project_id, m.code order by m.planned_start nulls last, m.task_code) * 10) as seq
  from mapped m where m.code is not null
)
update public.project_tasks t
set wbs_id = w.id,
    activity_id = s.prefix || '-' || n.code || '-' || lpad(n.seq::text, 4, '0')
from numbered n
join public.project_register_settings s on s.project_id = n.project_id
join public.project_wbs w on w.project_id = n.project_id and w.wbs_code = n.code
where t.id = n.id;