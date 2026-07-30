-- Data API üzerinden kullanılan ödeme görünümü, temel tabloların RLS
-- politikalarını çağıran kullanıcının yetkileriyle uygular.
alter view public.v_invoice_payment_overview
  set (security_invoker = true);
