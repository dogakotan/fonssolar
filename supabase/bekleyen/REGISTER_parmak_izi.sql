-- Register okuma fonksiyonları ve navigasyon provası: öncesi/sonrası salt okunur parmak izi (19.10.2026).
-- Prova ROLLBACK ile biter; bütün satırlar ÖNCE ile birebir olmalı (bildirim normal kullanımla artabilir).
select
  (select count(*) from notifications)                                                                 as bildirim,
  (select md5(coalesce(string_agg(to_jsonb(r)::text, '|' order by r.id), '')) from project_risks r)  as risk_md5,
  (select md5(string_agg(to_jsonb(t)::text, '|' order by t.id)) from project_tasks t)                as gorev_tam_md5,
  (select count(*) from projects)                                                                      as proje_n,
  (select string_agg(x.ad || '=' || x.n, ' ' order by x.ad) from (
     select 'doc' ad, count(*) n from documents union all select 'rev', count(*) from document_revisions
     union all select 'drw', count(*) from drawings union all select 'rfi', count(*) from rfis
     union all select 'dec', count(*) from decisions union all select 'act', count(*) from project_actions
     union all select 'ts', count(*) from technical_submittals union all select 'ma', count(*) from material_approvals
     union all select 'chg', count(*) from changes union all select 'clm', count(*) from claims
     union all select 'itf', count(*) from interfaces union all select 'hist', count(*) from register_status_history) x) as register_n,
  (select md5(coalesce(string_agg(to_jsonb(r)::text, '|' order by r.id), '')) from rfis r)            as rfi_md5,
  (select md5(coalesce(string_agg(to_jsonb(h)::text, '|' order by h.id), '')) from register_status_history h) as gecmis_md5,
  (select md5(coalesce(string_agg(c.project_id || ':' || c.register_code || ':' || c.last_value, '|'
                order by c.project_id, c.register_code), '')) from project_register_counters c)      as sayac_md5,
  (select md5(string_agg(s.project_id || ':' || s.prefix, '|' order by s.project_id)) from project_register_settings s) as onek_md5,
  (select md5(coalesce(string_agg(x.role_key || ':' || x.tab_key || ':' || x.order_index, '|' order by x.role_key, x.tab_key), ''))
     from role_allowed_tabs x)                                                                         as nav_sekme_md5,
  (select md5(coalesce(string_agg(y.role_key || ':' || y.item_key || ':' || y.order_index, '|' order by y.role_key, y.item_key), ''))
     from role_sidebar_items y)                                                                        as nav_sidebar_md5,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('get_register_list', 'get_register_status_history', 'register_view_allowed')) as register_fn_n,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace)                     as fonksiyon_n,
  (select md5(string_agg(g.table_name || ':' || g.grantee || ':' || g.privilege_type, '|' order by g.table_name, g.grantee, g.privilege_type))
     from information_schema.role_table_grants g where g.table_schema = 'public'
      and g.grantee in ('authenticated', 'anon'))                                                      as tablo_yetki_md5,
  (select count(*) from pg_stat_activity
    where pid <> pg_backend_pid()
      and (state like 'idle in transaction%' or (state = 'active' and now() - xact_start > interval '1 minute'))) as asili_islem,
  now()                                                                                                as zaman;
