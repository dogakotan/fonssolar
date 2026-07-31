-- Kök neden: Tickets listesi/detayı "Oluşturan"/"Son işlem" alanları
-- profiles.full_name'i doğrudan client-side sorgu (embed veya ayrı .from('profiles'))
-- ile okuyordu — profiles_select RLS'i (admin/proje_yoneticisi/kendi satırı)
-- santiye_sefi gibi rollerin BAŞKA bir kullanıcının adını okumasını
-- engellediğinden, kendi açtıkları ticket dışındaki tüm satırlarda bu alan
-- sessizce boş (—) geliyordu. Yalnızca id+full_name döndüren, RLS'i bypass eden
-- (SECURITY DEFINER) dar kapsamlı bir RPC — e-posta/rol gibi hassas alanları
-- açığa çıkarmıyor, profiles_select'i genel olarak gevşetmeye gerek kalmadı.
create or replace function public.get_profile_names(p_ids uuid[])
returns table(id uuid, full_name text)
language sql
security definer
set search_path to 'public'
as $$
  select id, full_name from public.profiles where id = any(p_ids);
$$;

revoke all on function public.get_profile_names(uuid[]) from public;
grant execute on function public.get_profile_names(uuid[]) to authenticated;
