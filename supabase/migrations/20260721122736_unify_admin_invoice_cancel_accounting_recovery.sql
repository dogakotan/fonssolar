create or replace function public.fn_validate_invoice_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
begin
  if old.status is distinct from new.status then
    if not (
      (old.status = 'bekliyor' and new.status = 'yönetici_onayında' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'yönetici_onayında' and new.status in ('onaylandı', 'reddedildi') and v_role = 'admin')
      or (old.status = 'onaylandı' and new.status = 'reddedildi' and v_role = 'admin')
      or (old.status = 'onaylandı' and new.status = 'ödendi' and v_role in ('admin', 'muhasebe'))
      or (old.status = 'reddedildi' and new.status = 'yönetici_onayında' and v_role = 'muhasebe')
    ) then
      raise exception 'Bu rol için geçersiz fatura durum geçişi: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.resubmit_rejected_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  if public.get_my_role() <> 'muhasebe' then
    raise exception 'Reddedilen faturayı yalnızca muhasebe yeniden gönderebilir.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Fatura bulunamadı.'; end if;
  if v_invoice.status <> 'reddedildi' then raise exception 'Yalnızca reddedilen faturalar yeniden gönderilebilir.'; end if;
  delete from public.invoice_approvals where invoice_id = p_invoice_id;
  insert into public.invoice_approvals(invoice_id, step, step_label, status)
  values (p_invoice_id, 1, 'Yönetici Onayı', 'bekliyor');
  update public.invoices set status = 'yönetici_onayında', updated_at = now() where id = p_invoice_id;
  perform public.notify_role(
    'admin', auth.uid(), v_invoice.project_id, 'invoice', v_invoice.id, 'status_changed',
    'Fatura yeniden onaya gönderildi: ' || v_invoice.invoice_no,
    'Muhasebe iptal edilen faturayı düzenleyerek yeniden gönderdi.'
  );
end;
$$;

create or replace function public.delete_rejected_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  if public.get_my_role() <> 'muhasebe' then
    raise exception 'İptal edilen faturayı yalnızca muhasebe silebilir.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Fatura bulunamadı.'; end if;
  if v_invoice.status <> 'reddedildi' then raise exception 'Yalnızca reddedilen faturalar silinebilir.'; end if;
  if v_invoice.purchase_request_id is not null then
    update public.purchase_requests
    set invoice_id = null, status = 'satin_alindi', updated_at = now()
    where id = v_invoice.purchase_request_id;
  end if;
  delete from public.invoices where id = p_invoice_id;
end;
$$;

