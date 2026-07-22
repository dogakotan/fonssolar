alter table public.tickets
  add column if not exists closed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

update public.tickets
set closed_at = coalesce(resolved_at, updated_at, created_at)
where status in ('kapatıldı', 'çözüldü')
  and closed_at is null;

update public.tickets
set cancelled_at = coalesce(resolved_at, updated_at, created_at)
where status = 'iptal_edildi'
  and cancelled_at is null;

create or replace function public.trg_set_ticket_result_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('kapatıldı', 'çözüldü') then
      new.closed_at := now();
      new.cancelled_at := null;
      new.resolved_at := new.closed_at;
    elsif new.status = 'iptal_edildi' then
      new.cancelled_at := now();
      new.closed_at := null;
      new.resolved_at := new.cancelled_at;
    else
      new.closed_at := null;
      new.cancelled_at := null;
      new.resolved_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_ticket_result_timestamps on public.tickets;
create trigger set_ticket_result_timestamps
before update of status on public.tickets
for each row
execute function public.trg_set_ticket_result_timestamps();

comment on column public.tickets.closed_at is
  'Ticket kapatıldığında veya çözüldüğünde kaydedilen tarih.';
comment on column public.tickets.cancelled_at is
  'Ticket iptal edildiğinde kaydedilen tarih.';

revoke execute on function public.trg_set_ticket_result_timestamps() from public, anon, authenticated;
