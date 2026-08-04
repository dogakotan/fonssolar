-- GERİYE DÖNÜK YENİDEN İNŞA (04.08.2026) — bkz. 20260724104456 dosyasındaki not.
-- Bir faturaya bağlı satın alma talebinin id'sini, yalnızca o talebi açan
-- kullanıcı için döndüren dar kapsamlı yardımcı (bildirim deep-link'i için).

create or replace function public.get_invoice_linked_purchase_request(p_invoice_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pr_id uuid;
begin
  select i.purchase_request_id into v_pr_id
  from invoices i
  join purchase_requests pr on pr.id = i.purchase_request_id
  where i.id = p_invoice_id
    and pr.requested_by = auth.uid();

  return v_pr_id;
end;
$function$;

revoke all on function public.get_invoice_linked_purchase_request(uuid) from public, anon;
grant execute on function public.get_invoice_linked_purchase_request(uuid) to authenticated;
