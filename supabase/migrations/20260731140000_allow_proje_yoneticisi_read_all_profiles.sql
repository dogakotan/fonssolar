-- Kök neden: Kullanıcılar sayfası (isAdmin || role==='proje_yoneticisi'ye açık,
-- bkz. TabKullanicilar.jsx'teki "diğer roller (proje_yoneticisi dahil) salt-okunur
-- görür" yorumu) profiles tablosunu doğrudan client-side sorguluyor, ama
-- profiles_select RLS'i yalnızca admin OR auth.uid()=id'ye izin veriyordu —
-- proje_yoneticisi olarak giriş yapan biri sayfada yalnızca KENDİ satırını
-- görüyordu (1 kullanıcı), diğer roller (ticket/satın alma/rapor kayıtlarında adı
-- geçen kullanıcılar) veride vardı ama RLS onları görünmez kılıyordu — veri
-- modelinde bir kopukluk yoktu, salt görünürlük izni eksikti.
drop policy "profiles_select" on public.profiles;

create policy "profiles_select" on public.profiles
for select
using (get_my_role() in ('admin', 'proje_yoneticisi') or auth.uid() = id);
