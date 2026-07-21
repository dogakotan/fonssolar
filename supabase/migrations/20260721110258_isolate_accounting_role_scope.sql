alter function public.get_purchase_requests_list(text,date,boolean) rename to get_purchase_requests_list_internal;
alter function public.get_purchase_request_detail(uuid) rename to get_purchase_request_detail_internal;
alter function public.get_satin_alma_overview_all() rename to get_satin_alma_overview_all_internal;
alter function public.get_finans_overview(text,date) rename to get_finans_overview_internal;
alter function public.get_finans_overview_all(date) rename to get_finans_overview_all_internal;

revoke all on function public.get_purchase_requests_list_internal(text,date,boolean) from public, anon, authenticated;
revoke all on function public.get_purchase_request_detail_internal(uuid) from public, anon, authenticated;
revoke all on function public.get_satin_alma_overview_all_internal() from public, anon, authenticated;
revoke all on function public.get_finans_overview_internal(text,date) from public, anon, authenticated;
revoke all on function public.get_finans_overview_all_internal(date) from public, anon, authenticated;

create function public.get_purchase_requests_list(p_project_id text default null, p_filter_date date default null, p_only_pending boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_result jsonb; v_requests jsonb;
begin
  v_result := public.get_purchase_requests_list_internal(p_project_id,p_filter_date,p_only_pending);
  if public.get_my_role() = 'muhasebe' and coalesce((v_result->>'authorized')::boolean,false) then
    select coalesce(jsonb_agg(value order by value->>'created_at' desc),'[]'::jsonb) into v_requests
    from jsonb_array_elements(coalesce(v_result->'requests','[]'::jsonb))
    where value->>'status' in ('satin_alindi','fatura_bekliyor');
    v_result := jsonb_set(v_result,'{requests}',v_requests,true);
  end if;
  return v_result;
end;$function$;

create function public.get_purchase_request_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_result jsonb;
begin
  v_result := public.get_purchase_request_detail_internal(p_id);
  if public.get_my_role() = 'muhasebe'
     and coalesce(v_result->'request'->>'status','') not in ('satin_alindi','fatura_bekliyor') then
    return jsonb_build_object('authorized',false);
  end if;
  return v_result;
end;$function$;

create function public.get_satin_alma_overview_all()
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_result jsonb; v_requests jsonb;
begin
  v_result := public.get_satin_alma_overview_all_internal();
  if public.get_my_role() = 'muhasebe' then
    select coalesce(jsonb_agg(value order by value->>'created_at' desc),'[]'::jsonb) into v_requests
    from jsonb_array_elements(coalesce(v_result->'requests','[]'::jsonb))
    where value->>'status' in ('satin_alindi','fatura_bekliyor');
    v_result := jsonb_set(v_result,'{requests}',v_requests,true);
    v_result := jsonb_set(v_result,'{procurement_items}','[]'::jsonb,true);
  end if;
  return v_result;
end;$function$;

create function public.get_finans_overview(p_project_id text, p_as_of_date date default current_date)
returns jsonb language plpgsql security definer set search_path=public as $function$
begin
  if public.get_my_role() = 'muhasebe' then return jsonb_build_object('authorized',false); end if;
  return public.get_finans_overview_internal(p_project_id,p_as_of_date);
end;$function$;

create function public.get_finans_overview_all(p_as_of_date date default current_date)
returns jsonb language plpgsql security definer set search_path=public as $function$
begin
  if public.get_my_role() = 'muhasebe' then return jsonb_build_object('authorized',false); end if;
  return public.get_finans_overview_all_internal(p_as_of_date);
end;$function$;

revoke all on function public.get_purchase_requests_list(text,date,boolean) from public, anon;
revoke all on function public.get_purchase_request_detail(uuid) from public, anon;
revoke all on function public.get_satin_alma_overview_all() from public, anon;
revoke all on function public.get_finans_overview(text,date) from public, anon;
revoke all on function public.get_finans_overview_all(date) from public, anon;
grant execute on function public.get_purchase_requests_list(text,date,boolean) to authenticated;
grant execute on function public.get_purchase_request_detail(uuid) to authenticated;
grant execute on function public.get_satin_alma_overview_all() to authenticated;
grant execute on function public.get_finans_overview(text,date) to authenticated;
grant execute on function public.get_finans_overview_all(date) to authenticated;

drop policy if exists purchase_requests_select on public.purchase_requests;
create policy purchase_requests_select on public.purchase_requests for select to authenticated using (
  (public.get_my_role()='muhasebe' and status in ('satin_alindi','fatura_bekliyor'))
  or (public.get_my_role()<>'muhasebe' and (public.has_project_access(project_id) or (select auth.uid())=requested_by))
);

drop policy if exists pr_items_select on public.purchase_request_items;
create policy pr_items_select on public.purchase_request_items for select to authenticated using (
  exists(select 1 from public.purchase_requests pr where pr.id=purchase_request_items.request_id)
);

drop policy if exists procurement_items_access on public.procurement_items;
create policy procurement_items_access on public.procurement_items for all to authenticated
using (public.get_my_role()<>'muhasebe' and public.has_project_access(project_id))
with check (public.get_my_role()<>'muhasebe' and public.has_project_access(project_id));

drop policy if exists budget_lines_select on public.budget_lines;
drop policy if exists budget_lines_insert on public.budget_lines;
drop policy if exists budget_lines_update on public.budget_lines;
create policy budget_lines_select on public.budget_lines for select to authenticated using (public.get_my_role() in ('admin','proje_koordinatoru'));
create policy budget_lines_insert on public.budget_lines for insert to authenticated with check (public.get_my_role()='admin');
create policy budget_lines_update on public.budget_lines for update to authenticated using (public.get_my_role()='admin') with check (public.get_my_role()='admin');

drop policy if exists cost_allocations_select on public.cost_allocations;
drop policy if exists cost_allocations_insert on public.cost_allocations;
drop policy if exists cost_allocations_update on public.cost_allocations;
create policy cost_allocations_select on public.cost_allocations for select to authenticated using (public.get_my_role()='admin');
create policy cost_allocations_insert on public.cost_allocations for insert to authenticated with check (public.get_my_role()='admin');
create policy cost_allocations_update on public.cost_allocations for update to authenticated using (public.get_my_role()='admin') with check (public.get_my_role()='admin');

