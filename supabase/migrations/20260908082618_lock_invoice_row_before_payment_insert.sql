-- fn_invoice_payment_before_insert kilitsiz bir SELECT ile remaining_amount
-- okuyordu; iki ödeme aynı faturaya eşzamanlı eklenirse ikisi de ayrı ayrı
-- geçerli görünüp birlikte faturayı fazla ödenmiş bırakabilirdi. FOR UPDATE
-- ile invoices satırı kilitlenir, ikinci eşzamanlı ekleme birincinin commit'ini
-- bekleyip güncel remaining_amount üzerinden doğru şekilde reddedilir.
create or replace function public.fn_invoice_payment_before_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text;
  v_remaining numeric;
  v_currency text;
begin
  select status, remaining_amount, currency into v_status, v_remaining, v_currency
    from public.invoices where id = NEW.invoice_id
    for update;

  if v_status not in ('odeme_bekliyor', 'kismen_odendi', 'ödendi') then
    raise exception 'Bu fatura ödeme takibi aşamasında değil (durum: %). Sadece onaylanmış ve ödeme bekleyen faturalara ödeme eklenebilir.', v_status;
  end if;

  if NEW.currency is distinct from v_currency then
    raise exception 'Ödeme para birimi (%) faturanın para birimiyle (%) eşleşmiyor.', NEW.currency, v_currency;
  end if;

  if NEW.amount > v_remaining then
    raise exception 'Ödeme tutarı (%) kalan fatura tutarını (%) aşamaz.', NEW.amount, v_remaining;
  end if;

  return NEW;
end;
$function$;
