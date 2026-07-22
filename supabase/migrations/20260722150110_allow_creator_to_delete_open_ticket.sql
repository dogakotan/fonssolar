create or replace function public.delete_own_open_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found or v_ticket.created_by <> (select auth.uid()) then
    raise exception 'Ticket bulunamadı veya silme yetkiniz yok.';
  end if;

  if v_ticket.status not in ('gönderildi', 'açık') then
    raise exception 'Yalnızca henüz işleme alınmamış ticket silinebilir.';
  end if;

  update public.daily_report_issues
  set ticket_id = null
  where ticket_id = p_ticket_id;

  update public.quality_inspection_findings
  set ticket_id = null
  where ticket_id = p_ticket_id;

  delete from public.tickets where id = p_ticket_id;
end;
$$;

revoke execute on function public.delete_own_open_ticket(uuid) from public, anon;
grant execute on function public.delete_own_open_ticket(uuid) to authenticated;

comment on function public.delete_own_open_ticket(uuid) is
  'Kullanıcının kendi oluşturduğu, henüz işleme alınmamış ticketı tamamen siler.';
