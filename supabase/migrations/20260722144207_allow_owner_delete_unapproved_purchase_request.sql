-- Şantiye şefi yalnızca kendi oluşturduğu ve henüz yönetici tarafından
-- onaylanmamış satın alma talebini silebilir. Mevcut admin silme politikası
-- ayrı ve değişmeden kalır.
create policy purchase_requests_owner_delete_unapproved
on public.purchase_requests
for delete
to authenticated
using (
  requested_by = (select auth.uid())
  and lower(replace(coalesce(status, ''), ' ', '_')) in (
    '',
    'bekliyor',
    'beklemede',
    'talep_olusturuldu',
    'talep_oluşturuldu',
    'fiyat_girildi',
    'onay_bekliyor'
  )
);

grant delete on public.purchase_requests to authenticated;
