create or replace function public.save_project_category_weights(
  p_project_id text,
  p_weights jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.get_my_role();
  v_count integer;
  v_distinct_count integer;
  v_total numeric;
  v_progress integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Oturum gerekli.';
  end if;

  if v_role not in ('admin', 'proje_yoneticisi') then
    raise exception 'Kategori ağırlıklarını değiştirme yetkiniz yok.';
  end if;

  if not public.has_project_access(p_project_id)
     or not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if p_weights is null or jsonb_typeof(p_weights) <> 'array'
     or jsonb_array_length(p_weights) = 0 then
    raise exception 'En az bir kategori ağırlığı gereklidir.';
  end if;

  select count(*), count(distinct x.category), sum(x.weight_pct)
    into v_count, v_distinct_count, v_total
  from jsonb_to_recordset(p_weights) as x(category text, weight_pct numeric);

  if v_count <> v_distinct_count then
    raise exception 'Kategori ağırlıkları yinelenemez.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_weights) as x(category text, weight_pct numeric)
    where x.category is null
       or x.weight_pct is null
       or x.weight_pct < 0
       or x.weight_pct > 100
  ) then
    raise exception 'Her ağırlık 0 ile 100 arasında olmalıdır.';
  end if;

  if abs(coalesce(v_total, 0) - 100) > 0.01 then
    raise exception 'Kategori ağırlıkları toplamı 100 olmalıdır (mevcut toplam: %).', coalesce(v_total, 0);
  end if;

  set constraints trg_check_category_weights_sum deferred;

  delete from public.project_category_weights
  where project_id = p_project_id;

  insert into public.project_category_weights (project_id, category, weight_pct)
  select p_project_id, x.category::public.task_category, x.weight_pct
  from jsonb_to_recordset(p_weights) as x(category text, weight_pct numeric);

  select round(sum(w.weight_pct * coalesce(cat.avg_progress, 0)) / 100)::integer
    into v_progress
  from public.project_category_weights w
  left join (
    select category, avg(progress_pct) as avg_progress
    from public.project_tasks
    where project_id = p_project_id
    group by category
  ) cat on cat.category = w.category
  where w.project_id = p_project_id;

  update public.projects
  set progress = coalesce(v_progress, 0)
  where id = p_project_id;
end;
$function$;

revoke all on function public.save_project_category_weights(text, jsonb) from public, anon;
grant execute on function public.save_project_category_weights(text, jsonb) to authenticated;
