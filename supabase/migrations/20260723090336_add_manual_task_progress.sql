alter table public.daily_reports
  add column if not exists auto_created_from_progress boolean not null default false;

comment on column public.daily_reports.auto_created_from_progress is
  'True when the report shell was created automatically by a manual work-plan progress entry.';

alter table public.progress_daily
  add column if not exists source text not null default 'daily_report',
  add column if not exists entered_by uuid references public.profiles(id) on delete set null;

update public.progress_daily pd
set entered_by = dr.created_by
from public.daily_reports dr
where dr.id = pd.report_id
  and pd.entered_by is null;

alter table public.progress_daily
  drop constraint if exists progress_daily_source_check;

alter table public.progress_daily
  add constraint progress_daily_source_check
  check (source in ('daily_report', 'manual'));

create unique index if not exists progress_daily_report_task_daily_unique
  on public.progress_daily (report_id, task_id)
  where source = 'daily_report' and task_id is not null;

create unique index if not exists progress_daily_report_task_manual_actor_unique
  on public.progress_daily (report_id, task_id, entered_by)
  where source = 'manual' and task_id is not null and entered_by is not null;

drop policy if exists pd_insert on public.progress_daily;
create policy pd_insert on public.progress_daily
for insert to authenticated
with check (
  exists (
    select 1
    from public.daily_reports dr
    where dr.id = report_id
      and (
        public.get_my_role() = 'admin'
        or dr.created_by = (select auth.uid())
      )
  )
);

drop policy if exists pd_update on public.progress_daily;
create policy pd_update on public.progress_daily
for update to authenticated
using (
  exists (
    select 1
    from public.daily_reports dr
    where dr.id = report_id
      and (
        public.get_my_role() = 'admin'
        or dr.created_by = (select auth.uid())
      )
  )
)
with check (
  exists (
    select 1
    from public.daily_reports dr
    where dr.id = report_id
      and (
        public.get_my_role() = 'admin'
        or dr.created_by = (select auth.uid())
      )
  )
);

drop policy if exists pd_delete on public.progress_daily;
create policy pd_delete on public.progress_daily
for delete to authenticated
using (
  exists (
    select 1
    from public.daily_reports dr
    where dr.id = report_id
      and (
        public.get_my_role() = 'admin'
        or dr.created_by = (select auth.uid())
      )
  )
);

create or replace function public.save_daily_report(
  p_project_id text,
  p_report_date date,
  p_created_by uuid,
  p_general_status text,
  p_worker_count integer,
  p_weather text,
  p_weather_note text,
  p_notes text,
  p_personnel jsonb,
  p_machinery jsonb,
  p_progress jsonb default '[]'::jsonb,
  p_daily_tasks jsonb default '[]'::jsonb,
  p_materials jsonb default '[]'::jsonb,
  p_issues jsonb default '[]'::jsonb,
  p_task_progress jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rid uuid;
  v_role text;
begin
  if p_created_by is distinct from auth.uid() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  v_role := public.get_my_role();
  if v_role not in ('admin', 'santiye_sefi', 'proje_yoneticisi') then
    raise exception 'Günlük rapor kaydetme yetkiniz yok.';
  end if;

  if not public.has_project_access(p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  insert into public.daily_reports (
    project_id, report_date, created_by,
    general_status, worker_count, weather, weather_note, notes,
    auto_created_from_progress, updated_at
  )
  values (
    p_project_id, p_report_date, p_created_by,
    p_general_status, p_worker_count, p_weather,
    nullif(p_weather_note, ''), nullif(p_notes, ''),
    false, now()
  )
  on conflict (project_id, report_date) do update set
    created_by                 = excluded.created_by,
    general_status             = excluded.general_status,
    worker_count               = excluded.worker_count,
    weather                    = excluded.weather,
    weather_note               = excluded.weather_note,
    notes                      = excluded.notes,
    auto_created_from_progress = false,
    updated_at                 = now()
  returning id into v_rid;

  delete from public.personnel_log_entries where report_id = v_rid;
  insert into public.personnel_log_entries (report_id, shift, department, count)
  select v_rid, item->>'shift', item->>'department', (item->>'count')::integer
  from jsonb_array_elements(p_personnel) as item
  where (item->>'count')::integer > 0;

  delete from public.machinery_logs where report_id = v_rid;
  insert into public.machinery_logs (report_id, machine_type, count, status, notes)
  select v_rid, item->>'machine_type', (item->>'count')::integer,
         item->>'status', nullif(item->>'notes', '')
  from jsonb_array_elements(p_machinery) as item
  where (item->>'count')::integer > 0;

  delete from public.progress_daily
  where report_id = v_rid and source = 'daily_report';

  insert into public.progress_daily (
    report_id, task_id, qty_added, note, source, entered_by
  )
  select v_rid, (item->>'task_id')::uuid, (item->>'qty_added')::numeric,
         nullif(item->>'note', ''), 'daily_report', p_created_by
  from jsonb_array_elements(p_task_progress) as item
  where coalesce((item->>'qty_added')::numeric, 0) > 0;

  delete from public.daily_tasks where report_id = v_rid;
  insert into public.daily_tasks (report_id, type, description, order_index)
  select v_rid, item->>'type', item->>'description',
         coalesce((item->>'order_index')::integer, 0)
  from jsonb_array_elements(p_daily_tasks) as item
  where nullif(item->>'description', '') is not null;

  delete from public.daily_report_material_usage where report_id = v_rid;
  insert into public.daily_report_material_usage (
    report_id, project_id, material_name, quantity_used, unit, description, reason
  )
  select v_rid, p_project_id, item->>'material_name',
         coalesce((item->>'quantity_used')::numeric, 0),
         coalesce(nullif(item->>'unit', ''), 'Adet'),
         nullif(item->>'description', ''), nullif(item->>'reason', '')
  from jsonb_array_elements(p_materials) as item
  where nullif(item->>'material_name', '') is not null;

  delete from public.daily_report_issues
  where report_id = v_rid
    and id not in (
      select nullif(item->>'id', '')::uuid
      from jsonb_array_elements(p_issues) as item
      where nullif(item->>'id', '') is not null
    );

  update public.daily_report_issues d
  set topic             = item->>'topic',
      priority          = coalesce(nullif(item->>'priority', ''), 'orta'),
      assigned_to       = nullif(item->>'assigned_to', ''),
      description       = nullif(item->>'description', ''),
      resolution_status = coalesce(nullif(item->>'resolution_status', ''), 'açık')
  from jsonb_array_elements(p_issues) as item
  where d.report_id = v_rid
    and d.id = nullif(item->>'id', '')::uuid;

  insert into public.daily_report_issues (
    report_id, project_id, topic, priority, assigned_to, description, resolution_status
  )
  select v_rid, p_project_id, item->>'topic',
         coalesce(nullif(item->>'priority', ''), 'orta'),
         nullif(item->>'assigned_to', ''), nullif(item->>'description', ''),
         coalesce(nullif(item->>'resolution_status', ''), 'açık')
  from jsonb_array_elements(p_issues) as item
  where nullif(item->>'topic', '') is not null
    and nullif(item->>'id', '') is null;

  return v_rid;
end;
$function$;

create or replace function public.get_daily_report_detail(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.user_can_access_report(p_report_id) then
    return jsonb_build_object('authorized', false);
  end if;

  return jsonb_build_object(
    'authorized', true,
    'report', (
      select jsonb_build_object(
        'id', dr.id,
        'project_id', dr.project_id,
        'report_date', dr.report_date,
        'created_by', dr.created_by,
        'weather', dr.weather,
        'notes', dr.notes,
        'general_status', dr.general_status,
        'worker_count', dr.worker_count,
        'weather_note', dr.weather_note,
        'weather_loss_day', dr.weather_loss_day,
        'auto_created_from_progress', dr.auto_created_from_progress,
        'created_at', dr.created_at,
        'updated_at', dr.updated_at,
        'profiles', case
          when p.full_name is not null then jsonb_build_object('full_name', p.full_name)
          else null
        end
      )
      from public.daily_reports dr
      left join public.profiles p on p.id = dr.created_by
      where dr.id = p_report_id
    ),
    'project', (
      select jsonb_build_object(
        'id', pr.id,
        'name', pr.name,
        'location', pr.location,
        'capacity_kwp', pr.capacity_kwp
      )
      from public.daily_reports dr
      join public.projects pr on pr.id = dr.project_id
      where dr.id = p_report_id
    ),
    'personnel', (
      select coalesce(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
      from public.personnel_log_entries pl
      where pl.report_id = p_report_id
    ),
    'machinery', (
      select coalesce(jsonb_agg(to_jsonb(ml)), '[]'::jsonb)
      from public.machinery_logs ml
      where ml.report_id = p_report_id
    ),
    'tasks', (
      select coalesce(jsonb_agg(to_jsonb(dt) order by dt.order_index), '[]'::jsonb)
      from public.daily_tasks dt
      where dt.report_id = p_report_id
    ),
    'progress', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', pd.id,
          'report_id', pd.report_id,
          'task_id', pd.task_id,
          'qty_added', pd.qty_added,
          'note', pd.note,
          'source', pd.source,
          'entered_by', pd.entered_by,
          'created_at', pd.created_at,
          'progress_items', jsonb_build_object(
            'name', pt.task_name,
            'unit', pt.unit,
            'target_qty', pt.target_qty,
            'total_progress', pt.total_progress
          )
        )
        order by pd.created_at
      ), '[]'::jsonb)
      from public.progress_daily pd
      left join public.project_tasks pt on pt.id = pd.task_id
      where pd.report_id = p_report_id
    ),
    'materials', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mu.id,
        'report_id', mu.report_id,
        'project_id', mu.project_id,
        'material_name', mu.material_name,
        'quantity_used', mu.quantity_used,
        'unit', mu.unit,
        'description', mu.description,
        'reason', mu.reason,
        'created_at', mu.created_at
      )), '[]'::jsonb)
      from public.daily_report_material_usage mu
      where mu.report_id = p_report_id
    ),
    'photos', (
      select coalesce(jsonb_agg(to_jsonb(ph)), '[]'::jsonb)
      from public.daily_report_photos ph
      where ph.report_id = p_report_id
    ),
    'issues', (
      select coalesce(jsonb_agg(to_jsonb(iss)), '[]'::jsonb)
      from public.daily_report_issues iss
      where iss.report_id = p_report_id
    )
  );
end;
$function$;

create or replace function public.get_project_gantt(
  p_project_id text,
  p_filter_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_scope record;
begin
  select * into v_scope from public.get_project_scope(p_project_id);
  if not v_scope.authorized then
    return jsonb_build_object('authorized', false);
  end if;

  return jsonb_build_object(
    'authorized', true,
    'project', (
      select jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'capacity_kwp', p.capacity_kwp,
        'location', p.location,
        'start_date', p.start_date,
        'target_date', p.target_date
      )
      from public.projects p
      where p.id = p_project_id
    ),
    'tasks', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', pt.id,
          'task_code', pt.task_code,
          'task_name', pt.task_name,
          'group_label', pt.group_label,
          'category', pt.category,
          'planned_start', pt.planned_start,
          'planned_end', pt.planned_end,
          'progress_pct', pt.progress_pct,
          'status', pt.status,
          'responsible_role', pt.responsible_role,
          'equipment_notes', pt.equipment_notes,
          'notes', pt.notes,
          'is_critical', pt.is_critical,
          'target_qty', pt.target_qty,
          'unit', pt.unit,
          'total_progress', pt.total_progress,
          'risk_severity', (
            select r.severity
            from public.project_risks r
            where r.project_id = pt.project_id
              and r.rule_code = 'gorev_gecikmesi'
              and r.subject_ref = pt.task_code
              and r.status <> 'kapatıldı'
            order by case r.severity
              when 'kritik' then 4
              when 'yüksek' then 3
              when 'orta' then 2
              when 'düşük' then 1
              else 0
            end desc
            limit 1
          )
        )
        order by pt.planned_start asc nulls last
      ), '[]'::jsonb)
      from public.project_tasks pt
      where pt.project_id = p_project_id
    ),
    'task_progress', (
      select coalesce(
        jsonb_object_agg(task_id::text, round(avg_pct::numeric, 4)),
        '{}'::jsonb
      )
      from (
        select
          pt.id as task_id,
          avg(
            least(
              100.0,
              coalesce(sums.total_qty, 0.0)
              / nullif(pt.target_qty::numeric, 0)
              * 100.0
            )
          ) as avg_pct
        from public.project_tasks pt
        left join lateral (
          select coalesce(sum(pd.qty_added), 0) as total_qty
          from public.progress_daily pd
          join public.daily_reports dr on dr.id = pd.report_id
          where pd.task_id = pt.id
            and dr.report_date <= p_filter_date
        ) sums on true
        where pt.project_id = p_project_id
          and pt.target_qty > 0
        group by pt.id
      ) tp
    ),
    'context', jsonb_build_object(
      'latest_report', (
        select jsonb_build_object('report_date', dr.report_date, 'notes', dr.notes)
        from public.daily_reports dr
        where dr.project_id = p_project_id
        order by dr.report_date desc
        limit 1
      ),
      'latest_purchase', (
        select jsonb_build_object(
          'id', pr.id,
          'title', pr.title,
          'status', pr.status,
          'created_at', pr.created_at
        )
        from public.purchase_requests pr
        where pr.project_id = p_project_id
        order by pr.created_at desc
        limit 1
      ),
      'top_risk', (
        select to_jsonb(r)
        from public.project_risks r
        where r.project_id = p_project_id
          and r.status <> 'kapatıldı'
        limit 1
      )
    )
  );
end;
$function$;

create or replace function public.trg_notify_daily_report()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_project_name text;
  v_author text;
begin
  if new.auto_created_from_progress then
    return new;
  end if;

  select name into v_project_name
  from public.projects
  where id = new.project_id;

  select full_name into v_author
  from public.profiles
  where id = new.created_by;

  perform public.notify_managers(
    new.project_id,
    new.created_by,
    'daily_report',
    new.id,
    case when tg_op = 'INSERT' then 'created' else 'status_changed' end,
    coalesce(v_project_name, 'Proje') ||
      case when tg_op = 'INSERT' then ' için günlük rapor girildi' else ' günlük raporu güncellendi' end,
    coalesce(v_author, 'Bir kullanıcı') || ' tarafından ' ||
      new.report_date::text ||
      case when tg_op = 'INSERT' then ' tarihli rapor oluşturuldu.' else ' tarihli rapor güncellendi.' end
  );
  return new;
end;
$function$;

drop trigger if exists trg_daily_reports_notify on public.daily_reports;
create trigger trg_daily_reports_notify
after insert or update on public.daily_reports
for each row execute function public.trg_notify_daily_report();

create or replace function public.add_task_progress(
  p_task_id uuid,
  p_qty numeric,
  p_note text default null,
  p_report_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_task public.project_tasks%rowtype;
  v_report_id uuid;
  v_report_was_submitted boolean := false;
  v_current_total numeric;
  v_project_name text;
  v_actor_name text;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  v_role := public.get_my_role();
  if v_role not in ('santiye_sefi', 'proje_yoneticisi') then
    raise exception 'İlerleme girişi yalnızca şantiye şefi ve proje yöneticisi tarafından yapılabilir.';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'İlerleme miktarı sıfırdan büyük olmalıdır.';
  end if;

  select * into v_task
  from public.project_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'İş kalemi bulunamadı.';
  end if;

  if not public.has_project_access(v_task.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if coalesce(v_task.target_qty, 0) <= 0 then
    raise exception 'Bu iş kalemi için ölçülebilir ilerleme hedefi tanımlanmamış.';
  end if;

  select coalesce(sum(pd.qty_added), 0)
  into v_current_total
  from public.progress_daily pd
  where pd.task_id = p_task_id;

  if v_current_total + p_qty > v_task.target_qty
     and nullif(btrim(p_note), '') is null then
    raise exception 'Hedef aşımı için açıklama girmeniz gerekir.';
  end if;

  select dr.id, not dr.auto_created_from_progress
  into v_report_id, v_report_was_submitted
  from public.daily_reports dr
  where dr.project_id = v_task.project_id
    and dr.report_date = p_report_date
  for update;

  if v_report_id is null then
    insert into public.daily_reports (
      project_id, report_date, created_by, weather, general_status,
      worker_count, auto_created_from_progress
    )
    values (
      v_task.project_id, p_report_date, v_actor, 'açık', 'normal',
      0, true
    )
    returning id into v_report_id;
  else
    update public.daily_reports
    set updated_at = now()
    where id = v_report_id;
  end if;

  insert into public.progress_daily (
    report_id, task_id, qty_added, note, source, entered_by
  )
  values (
    v_report_id, p_task_id, p_qty, nullif(btrim(p_note), ''), 'manual', v_actor
  )
  on conflict (report_id, task_id, entered_by)
    where source = 'manual' and task_id is not null and entered_by is not null
  do update set
    qty_added = public.progress_daily.qty_added + excluded.qty_added,
    note = case
      when excluded.note is null then public.progress_daily.note
      when public.progress_daily.note is null then excluded.note
      else public.progress_daily.note || ' · ' || excluded.note
    end;

  select name into v_project_name
  from public.projects
  where id = v_task.project_id;

  select full_name into v_actor_name
  from public.profiles
  where id = v_actor;

  insert into public.notifications (
    recipient_id, actor_id, project_id, entity_type, entity_id,
    event_type, title, body
  )
  select
    p.id,
    v_actor,
    v_task.project_id,
    'daily_report',
    v_report_id,
    'status_changed',
    case
      when v_report_was_submitted then coalesce(v_project_name, 'Proje') || ' günlük raporu güncellendi'
      else coalesce(v_project_name, 'Proje') || ' iş planına ilerleme girildi'
    end,
    coalesce(v_actor_name, 'Bir kullanıcı') || ' tarafından ' ||
      v_task.task_name || ' iş kalemine ' ||
      trim(to_char(p_qty, 'FM9999999990D99')) || ' ' || coalesce(v_task.unit, 'birim') ||
      ' ilerleme eklendi.'
  from public.profiles p
  where p.role_key = 'admin'
    and p.id is distinct from v_actor
  on conflict (recipient_id, entity_type, entity_id)
    where entity_id is not null
  do update set
    actor_id = excluded.actor_id,
    project_id = excluded.project_id,
    event_type = excluded.event_type,
    title = excluded.title,
    body = excluded.body,
    is_read = false,
    read_at = null,
    created_at = now();

  return jsonb_build_object(
    'report_id', v_report_id,
    'task_id', p_task_id,
    'qty_added', p_qty,
    'report_updated', v_report_was_submitted
  );
end;
$function$;

revoke all on function public.add_task_progress(uuid, numeric, text, date)
from public, anon;
grant execute on function public.add_task_progress(uuid, numeric, text, date)
to authenticated;

revoke all on function public.save_daily_report(
  text, date, uuid, text, integer, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.save_daily_report(
  text, date, uuid, text, integer, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
