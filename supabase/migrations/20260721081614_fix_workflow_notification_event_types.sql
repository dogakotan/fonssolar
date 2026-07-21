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
  perform public.notify_role('admin',auth.uid(),v_invoice.project_id,'invoice',v_invoice.id,'status_changed',
    'Fatura yeniden onaya gönderildi: '||v_invoice.invoice_no,
    'Muhasebe reddedilen faturayı düzenleyerek yeniden gönderdi.');
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
      perform public.notify_role('muhasebe',auth.uid(),new.project_id,'purchase_request',new.id,'status_changed',
        'Fatura bekleyen satın alma: '||new.title,'Tedarik tamamlandı; fatura girişi bekleniyor.');
    end if;
  end if;
  return new;
end;
$$;

