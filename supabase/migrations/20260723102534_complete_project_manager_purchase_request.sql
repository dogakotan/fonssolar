create or replace function public.complete_project_manager_purchase_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlemi yalnızca proje yöneticisi tamamlayabilir.';
  end if;

  select * into v_request
  from public.purchase_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'onaylandi' then
    raise exception 'Yalnızca proje yöneticisinde bekleyen talepler tamamlanabilir.';
  end if;

  update public.purchase_requests
  set status = 'satin_alindi',
      purchase_date = coalesce(purchase_date, current_date),
      purchased_by = v_actor,
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'project_id', v_request.project_id,
    'status', 'satin_alindi'
  );
end;
$function$;

revoke all on function public.complete_project_manager_purchase_request(uuid)
from public, anon;
grant execute on function public.complete_project_manager_purchase_request(uuid)
to authenticated;
