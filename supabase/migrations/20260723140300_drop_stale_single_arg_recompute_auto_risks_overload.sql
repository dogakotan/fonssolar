-- CREATE OR REPLACE FUNCTION fn_recompute_auto_risks(text, boolean default false) yeni bir
-- parametre eklediği için mevcut (text) imzalı fonksiyonu DEĞİŞTİRMEDİ, ayrı bir overload
-- olarak bıraktı — tek argümanla çağıran 3 trigger (task/daily_report/purchase_item) hâlâ
-- eski (kapanma mantığı güncellenmemiş) sürümü çağırıyordu. Eski overload kaldırılıyor ki
-- tüm çağrılar default'lu yeni fonksiyona düşsün.
drop function if exists public.fn_recompute_auto_risks(text);
