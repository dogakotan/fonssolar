-- İş Planı revizyonu Faz 1 (veri temeli), adım 4 + 5'in bağımlılık kısmı.
-- fn_task_dependencies_guard'a eklenenler:
--   1) Şantiye şefi öncül/ardıl ekleyemez ve değiştiremez (Karar İP-4). Silme zaten RLS'te yalnızca admin/PM.
--   2) Döngü kontrolü: yeni bağ "öncül → görev". Öncülün (doğrudan ya da dolaylı) öncülleri arasında görev
--      zaten varsa bağ döngü kurar ve reddedilir. Aynı projede eşzamanlı iki eklemenin birlikte döngü
--      kurmaması için proje bazlı advisory kilit alınır.
-- Mevcut kural (iki görev aynı projede, project_id görevden türetilir) aynen korunur.
set local lock_timeout = '3s';

create or replace function public.fn_task_dependencies_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
declare
  v_task_project text;
  v_pred_project text;
  v_task_code    text;
  v_pred_code    text;
begin
  if public.get_my_role() = 'santiye_sefi' then
    raise exception 'Şantiye şefi görev bağımlılıklarını (öncül/ardıl) değiştiremez; değişiklik için proje yöneticisine başvurun.'
      using errcode = '42501';
  end if;

  select pt.project_id, pt.task_code into v_task_project, v_task_code from project_tasks pt where pt.id = new.task_id;
  select pt.project_id, pt.task_code into v_pred_project, v_pred_code from project_tasks pt where pt.id = new.predecessor_id;
  if v_task_project is distinct from v_pred_project then
    raise exception 'Öncül ve ardıl görev aynı projede olmalı';
  end if;
  new.project_id := v_task_project;

  perform pg_advisory_xact_lock(hashtext('task_dependencies:' || v_task_project));

  if new.task_id = new.predecessor_id or exists (
    with recursive zincir(onceki_id) as (
      select dep.predecessor_id
        from task_dependencies dep
       where dep.task_id = new.predecessor_id
         and dep.id <> new.id
      union
      select dep.predecessor_id
        from task_dependencies dep
        join zincir z on dep.task_id = z.onceki_id
       where dep.id <> new.id
    )
    select 1 from zincir where onceki_id = new.task_id
  ) then
    raise exception 'Döngüsel bağımlılık: % görevi, % görevinin zaten (doğrudan ya da dolaylı) öncülü. % görevini % görevinin öncülü yapmak döngü oluşturur.',
      coalesce(v_task_code, new.task_id::text), coalesce(v_pred_code, new.predecessor_id::text),
      coalesce(v_pred_code, new.predecessor_id::text), coalesce(v_task_code, new.task_id::text)
      using errcode = '23514';
  end if;

  return new;
end
$fn$;

comment on function public.fn_task_dependencies_guard() is
  'task_dependencies BEFORE INSERT/UPDATE: aynı proje, şantiye şefi yazamaz (İP-4), döngü kontrolü (recursive CTE).';
