-- Supabase performance advisor (auth_rls_initplan, WARN): profiles_select ve
-- purchase_requests_delete policy'leri get_my_role()/auth.uid()'i satır başına
-- yeniden değerlendiriyordu. Bu proje daha önce büyük bir initplan sarmalama
-- turu yapmıştı (db_perf_002_003_rls_initplan_and_policy_consolidation,
-- rls_hardening_wrap_auth_uid_and_merge_pr_update_policies) ama bu iki policy
-- o turdan SONRA eklendi/güncellendi (profiles_select 31.07'de proje_yoneticisi
-- için genişletildi, purchase_requests_delete 03.09'da teklif_toplama için
-- güncellendi) ve sarmalama atlanmış. Davranış değişmiyor — yalnızca
-- get_my_role()/auth.uid() çağrıları (select ...) ile sarmalanıp tek seferlik
-- initplan'a indirgeniyor.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select
to public
using (
  (select public.get_my_role()) = any (array['admin'::text, 'proje_yoneticisi'::text])
  or (select auth.uid()) = id
);

drop policy if exists "purchase_requests_delete" on public.purchase_requests;
create policy "purchase_requests_delete" on public.purchase_requests
for delete
to public
using (
  (select public.get_my_role()) = any (array['admin'::text, 'proje_yoneticisi'::text])
  or (
    requested_by = (select auth.uid())
    and lower(replace(coalesce(status, ''::text), ' '::text, '_'::text)) = any (array[
      ''::text, 'bekliyor'::text, 'beklemede'::text, 'talep_olusturuldu'::text,
      'talep_oluşturuldu'::text, 'fiyat_girildi'::text, 'onay_bekliyor'::text, 'teklif_toplama'::text
    ])
  )
);
