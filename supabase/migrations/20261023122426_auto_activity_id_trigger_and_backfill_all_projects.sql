-- Mapping helpers: group_label first, task category as fallback
create or replace function public.fn_wbs_code_for_task(p_label text, p_category text)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    case
      when p_label ilike 'Şantiye Mobilizasyon%' or p_label ilike 'Mobilizasyon%' then 'MOB'
      when p_label ilike 'Mekanik%' then 'MEC'
      when p_label ilike 'Elektriksel — DC%' or p_label ilike '%› DC' then 'DC'
      when p_label ilike '%› AC' then 'AC'
      when p_label ilike 'Elektriksel — OG%' or p_label ilike '%› OG' then 'MV'
      when p_label ilike 'Şalt Sahası%' then 'SWY'
      when p_label = 'ENH' then 'ENH'
      when p_label ilike 'Kamera%' or p_label ilike '%› Güvenlik' then 'CCTV'
      when p_label ilike '%Topraklama' then 'GND'
      when p_label = 'KABUL' then 'ACC'
    end,
    case p_category
      when 'mobilizasyon' then 'MOB'
      when 'asik_montaji' then 'MEC' when 'kiris_montaji' then 'MEC'
      when 'kolon_montaji' then 'MEC' when 'panel_montaji' then 'MEC' when 'mekanik' then 'MEC'
      when 'elektrik_dc' then 'DC'
      when 'elektrik_ac' then 'AC'
      when 'elektrik_og' then 'MV' when 'kosk_trafo' then 'MV'
      when 'enh' then 'ENH'
      when 'topraklama' then 'GND'
      when 'devreye_alma' then 'ACC' when 'evrak_sureci' then 'ACC'
      when 'satin_alma' then 'PRC'
    end
  );
$$;

create or replace function public.fn_wbs_name(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'MOB' then 'Mobilizasyon' when 'MEC' then 'Mekanik' when 'DC' then 'Elektriksel DC'
    when 'AC' then 'Elektriksel AC' when 'MV' then 'Elektriksel OG' when 'SWY' then 'Şalt Sahası'
    when 'ENH' then 'ENH' when 'CCTV' then 'Kamera, Güvenlik ve Aydınlatma' when 'GND' then 'Topraklama'
    when 'ACC' then 'Devreye Alma, Kabul ve Evrak' when 'PRC' then 'Satın Alma'
    else p_code end;
$$;

-- Auto-assign WBS + Activity ID on new tasks
create or replace function public.fn_task_assign_activity_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_code text; v_prefix text; v_wbs uuid; v_next int;
begin
  if new.activity_id is not null then return new; end if;
  v_code := public.fn_wbs_code_for_task(new.group_label, new.category::text);
  if v_code is null then return new; end if;
  select prefix into v_prefix from public.project_register_settings where project_id = new.project_id;
  if v_prefix is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.project_id || ':' || v_code));
  insert into public.project_wbs (project_id, wbs_code, name, level, discipline)
  values (new.project_id, v_code, public.fn_wbs_name(v_code), 1, v_code)
  on conflict (project_id, wbs_code) do nothing;
  select id into v_wbs from public.project_wbs where project_id = new.project_id and wbs_code = v_code;
  select coalesce(max(substring(activity_id from '(\d+)$')::int), 0) + 10 into v_next
    from public.project_tasks
    where project_id = new.project_id and activity_id like v_prefix || '-' || v_code || '-%';
  new.activity_id := v_prefix || '-' || v_code || '-' || lpad(v_next::text, 4, '0');
  if new.wbs_id is null then new.wbs_id := v_wbs; end if;
  return new;
end $$;

revoke all on function public.fn_task_assign_activity_id() from public, anon, authenticated;

drop trigger if exists trg_project_tasks_assign_activity_id on public.project_tasks;
create trigger trg_project_tasks_assign_activity_id
  before insert on public.project_tasks
  for each row execute function public.fn_task_assign_activity_id();

-- Backfill: remaining projects (Adana Faz1/Faz2, test projects)
insert into public.project_wbs (project_id, wbs_code, name, level, discipline)
select distinct t.project_id, t.c, public.fn_wbs_name(t.c), 1, t.c
from (select project_id, public.fn_wbs_code_for_task(group_label, category::text) c
      from public.project_tasks where activity_id is null) t
where t.c is not null
on conflict (project_id, wbs_code) do nothing;

with todo as (
  select t.id, t.project_id, public.fn_wbs_code_for_task(t.group_label, t.category::text) code, t.planned_start, t.task_code
  from public.project_tasks t where t.activity_id is null
),
numbered as (
  select d.*, s.prefix,
    (row_number() over (partition by d.project_id, d.code order by d.planned_start nulls last, d.task_code) * 10)
      + coalesce((select max(substring(x.activity_id from '(\d+)$')::int) from public.project_tasks x
                  where x.project_id = d.project_id and x.activity_id like s.prefix || '-' || d.code || '-%'), 0) as seq
  from todo d join public.project_register_settings s on s.project_id = d.project_id
  where d.code is not null
)
update public.project_tasks t
set wbs_id = w.id,
    activity_id = n.prefix || '-' || n.code || '-' || lpad(n.seq::text, 4, '0')
from numbered n
join public.project_wbs w on w.project_id = n.project_id and w.wbs_code = n.code
where t.id = n.id;