drop policy if exists invoice_approvals_update on public.invoice_approvals;

create policy invoice_approvals_update
on public.invoice_approvals
for update
to authenticated
using (public.get_my_role() = 'admin')
with check (public.get_my_role() = 'admin');

create or replace function public.fn_validate_invoice_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_role text := public.get_my_role();
begin
  if old.status is distinct from new.status then
    if not (
      (old.status = 'bekliyor' and new.status = 'yönetici_onayında' and v_role in ('admin','muhasebe'))
      or (old.status = 'yönetici_onayında' and new.status in ('onaylandı','reddedildi') and v_role = 'admin')
      or (old.status = 'onaylandı' and new.status = 'ödendi' and v_role in ('admin','muhasebe'))
      or (old.status = 'reddedildi' and new.status = 'yönetici_onayında' and v_role in ('admin','muhasebe'))
    ) then
      raise exception 'Bu rol için geçersiz fatura durum geçişi: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_purchase_request_from_invoice()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.purchase_request_id is null then return new; end if;
  if tg_op = 'INSERT' then
    update public.purchase_requests set invoice_id=new.id,status='fatura_onay_bekliyor',updated_at=now()
    where id=new.purchase_request_id;
  elsif tg_op='UPDATE' and new.status is distinct from old.status then
    if new.status in ('onaylandı','ödendi') then
      update public.purchase_requests set status='faturasi_kesildi',updated_at=now()
      where id=new.purchase_request_id;
    elsif new.status='reddedildi' then
      update public.purchase_requests set invoice_id=new.id,status='fatura_onay_bekliyor',updated_at=now()
      where id=new.purchase_request_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.resubmit_rejected_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_invoice public.invoices%rowtype;
begin
  if public.get_my_role() not in ('admin','muhasebe') then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Fatura bulunamadı.'; end if;
  if v_invoice.status<>'reddedildi' then raise exception 'Yalnızca reddedilen faturalar yeniden gönderilebilir.'; end if;
  delete from public.invoice_approvals where invoice_id=p_invoice_id;
  insert into public.invoice_approvals(invoice_id,step,step_label,status)
  values(p_invoice_id,1,'Yönetici Onayı','bekliyor');
  update public.invoices set status='yönetici_onayında',updated_at=now() where id=p_invoice_id;
  perform public.notify_role('admin',auth.uid(),v_invoice.project_id,'invoice',v_invoice.id,'resubmitted',
    'Fatura yeniden onaya gönderildi: '||v_invoice.invoice_no,
    'Muhasebe reddedilen faturayı düzenleyerek yeniden gönderdi.');
end;
$$;

create or replace function public.delete_rejected_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_invoice public.invoices%rowtype;
begin
  if public.get_my_role() not in ('admin','muhasebe') then raise exception 'Bu işlem için yetkiniz yok.'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Fatura bulunamadı.'; end if;
  if v_invoice.status<>'reddedildi' then raise exception 'Yalnızca reddedilen faturalar silinebilir.'; end if;
  if v_invoice.purchase_request_id is not null then
    update public.purchase_requests set invoice_id=null,status='satin_alindi',updated_at=now()
    where id=v_invoice.purchase_request_id;
  end if;
  delete from public.invoices where id=p_invoice_id;
end;
$$;

revoke all on function public.resubmit_rejected_invoice(uuid) from public,anon;
revoke all on function public.delete_rejected_invoice(uuid) from public,anon;
grant execute on function public.resubmit_rejected_invoice(uuid) to authenticated;
grant execute on function public.delete_rejected_invoice(uuid) to authenticated;

create or replace function public.trg_notify_purchase_request_insert()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  perform public.notify_role('admin',new.requested_by,new.project_id,'purchase_request',new.id,'created',
    'Yeni satın alma talebi: '||new.title,'Talep yönetici onayı bekliyor.');
  return new;
end;
$$;

create or replace function public.trg_notify_purchase_request_status()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.status is distinct from old.status then
    perform public.notify_user(new.requested_by,auth.uid(),new.project_id,'purchase_request',new.id,'status_changed',
      'Talebinizin durumu güncellendi: '||new.title,'Yeni durum: '||new.status);
    if new.status='onaylandi' then
      perform public.notify_role('proje_yoneticisi',auth.uid(),new.project_id,'purchase_request',new.id,'approved',
        'Tedarik işlemi bekleyen talep: '||new.title,'Tedarikçi ve teslimat işlemlerinin tamamlanması bekleniyor.');
    elsif new.status='satin_alindi' then
      perform public.notify_role('muhasebe',auth.uid(),new.project_id,'purchase_request',new.id,'procurement_completed',
        'Fatura bekleyen satın alma: '||new.title,'Tedarik tamamlandı; fatura girişi bekleniyor.');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.trg_notify_invoice_insert()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  perform public.notify_role('admin',new.created_by,new.project_id,'invoice',new.id,'created',
    'Yeni fatura onay bekliyor: '||new.invoice_no,'Tutar: '||new.total_amount::text);
  return new;
end;
$$;

