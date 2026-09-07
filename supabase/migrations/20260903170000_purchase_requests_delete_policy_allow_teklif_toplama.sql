-- "Talebi Sil" butonu artık siteChiefView'a bağlı değil, herhangi bir rolde
-- oluşturan kullanıcının kendi henüz-eskale-edilmemiş talebinde görünüyor
-- (bkz. TabSatinAlmaTalepListesi.jsx) — eski akış bucket'ının yanına yeni
-- akışın "henüz kimse dokunmadı" durumu olan 'teklif_toplama' eklendi.
-- admin/proje_yoneticisi zaten koşulsuz silebiliyordu (dal 1), bu değişmedi.
drop policy if exists purchase_requests_delete on public.purchase_requests;
create policy purchase_requests_delete on public.purchase_requests
for delete
using (
  get_my_role() = any (array['admin','proje_yoneticisi'])
  or (
    requested_by = auth.uid()
    and lower(replace(coalesce(status,''), ' ', '_')) = any (array['', 'bekliyor', 'beklemede', 'talep_olusturuldu', 'talep_oluşturuldu', 'fiyat_girildi', 'onay_bekliyor', 'teklif_toplama'])
  )
);
