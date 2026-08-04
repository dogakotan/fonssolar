-- project_tasks.dashboard_visible/dashboard_order: "öne çıkan görev" tasarımından
-- kalma alanlar, tek okuyucusu olan get_project_dashboard RPC'si zaten hiçbir
-- frontend dosyasından çağrılmıyordu (daha önce kaldırıldı).
-- project_tasks.is_critical: Gantt'ta görsel bir "kritik yol" vurgusu hiç yoktu,
-- yalnızca otomatik risk motorunun şiddet hesabını bir kademe yükseltiyordu ve
-- kafa karıştırıcı bulunduğu için kullanıcı kararıyla kaldırıldı.
alter table public.project_tasks
  drop column if exists dashboard_visible,
  drop column if exists dashboard_order,
  drop column if exists is_critical;
