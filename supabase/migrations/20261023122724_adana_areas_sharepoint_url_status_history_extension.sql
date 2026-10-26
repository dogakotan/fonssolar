-- ===== A) Adana Faz1 Area Master, derived from existing task group labels =====
insert into public.project_areas (project_id, area_code, name, area_type)
values ('kaptan-demir-adana-arazi-faz1', 'TR1', 'TR-1 3000 kVA', 'diger')
on conflict (project_id, area_code) do nothing;

insert into public.project_areas (project_id, area_code, parent_id, name, area_type)
select 'kaptan-demir-adana-arazi-faz1', 'INV' || n, p.id, 'Inverter-' || n, 'inverter_station'
from generate_series(1, 9) n
join public.project_areas p on p.project_id = 'kaptan-demir-adana-arazi-faz1' and p.area_code = 'TR1'
on conflict (project_id, area_code) do nothing;

-- Link tasks to areas by label
update public.project_tasks t
set area_id = a.id
from public.project_areas a
where t.project_id = 'kaptan-demir-adana-arazi-faz1'
  and t.area_id is null
  and a.project_id = t.project_id
  and (
    (a.area_code ~ '^INV[1-9]$' and t.group_label like '%Inverter-' || substring(a.area_code from 4) || ' %')
    or (a.area_code = 'TR1' and (t.group_label like '%TR-1-3000 kVA › OG' or t.group_label like '%TR-1-3000 kVA › Topraklama'))
  );

-- Area <-> WBS links that actually occur in the tasks
insert into public.area_wbs (project_id, area_id, wbs_id)
select distinct t.project_id, t.area_id, t.wbs_id
from public.project_tasks t
where t.project_id = 'kaptan-demir-adana-arazi-faz1' and t.area_id is not null and t.wbs_id is not null
on conflict do nothing;

-- ===== B) SharePoint web link on document revisions =====
alter table public.document_revisions
  add column if not exists web_url text check (web_url is null or web_url ~ '^https://');

-- ===== C) Status history for submittal, material approval, document =====
drop trigger if exists trg_technical_submittals_status_history on public.technical_submittals;
create trigger trg_technical_submittals_status_history
  after insert or update of status on public.technical_submittals
  for each row execute function public.fn_log_register_status('submittal');

drop trigger if exists trg_material_approvals_status_history on public.material_approvals;
create trigger trg_material_approvals_status_history
  after insert or update of status on public.material_approvals
  for each row execute function public.fn_log_register_status('material_approval');

drop trigger if exists trg_documents_status_history on public.documents;
create trigger trg_documents_status_history
  after insert or update of status on public.documents
  for each row execute function public.fn_log_register_status('document');

create or replace function public.get_register_status_history(p_register text, p_record_id uuid)
returns jsonb language plpgsql stable set search_path to 'public' as $function$
declare
  v_proje   text;
  v_liste   jsonb;
begin
  if not public.register_view_allowed(public.get_my_role(), p_register) then
    return jsonb_build_object('authorized', false);
  end if;
  if p_register not in ('rfi','decision','action','change','claim','interface','submittal','material_approval','document') then
    return jsonb_build_object('authorized', true, 'tracked', false, 'history', '[]'::jsonb);
  end if;

  v_proje := case p_register
    when 'rfi'               then (select t.project_id from public.rfis t where t.id = p_record_id)
    when 'decision'          then (select t.project_id from public.decisions t where t.id = p_record_id)
    when 'action'            then (select t.project_id from public.project_actions t where t.id = p_record_id)
    when 'change'            then (select t.project_id from public.changes t where t.id = p_record_id)
    when 'claim'             then (select t.project_id from public.claims t where t.id = p_record_id)
    when 'interface'         then (select t.project_id from public.interfaces t where t.id = p_record_id)
    when 'submittal'         then (select t.project_id from public.technical_submittals t where t.id = p_record_id)
    when 'material_approval' then (select t.project_id from public.material_approvals t where t.id = p_record_id)
    when 'document'          then (select t.project_id from public.documents t where t.id = p_record_id)
  end;
  if v_proje is null or not public.has_project_access(v_proje) then
    return jsonb_build_object('authorized', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'old_status', h.old_status, 'new_status', h.new_status,
           'changed_by', h.changed_by, 'changed_at', h.changed_at)
           order by h.changed_at, (h.old_status is not null), h.id), '[]'::jsonb)
    into v_liste
    from public.register_status_history h
   where h.record_id = p_record_id and h.register_code = p_register;

  return jsonb_build_object('authorized', true, 'tracked', true, 'history', v_liste);
end $function$;