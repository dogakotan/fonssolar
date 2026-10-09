-- ============================================================================
-- FAZ B · B4 — identity_guard için yalnızca-admin düzeltme RPC'si — TASLAK (UYGULANMADI) · 07.10.2026
-- Plan: docs/proje-kontrol/faz-b-migration-plani.md · Tasarım: tasarim.md §4.2 A, §4.8 B4
-- Doğrulama: taslak-sql/b4_dogrulama.sql · Anlık görüntü: yedek-faz-b-07-10.sql §B4 (fn_project_tasks_identity_guard)
-- Test: tests/proje-kontrol-b4-activity.spec.js
-- Bağımlılık: B1 (register_raise), B2 (register_audit).
--
-- Sorun: trg_project_tasks_identity_guard atanmış activity_id'nin değişmesini (NULL'a dönmesi dahil) her
-- koşulda reddediyor; yanlış girilen bir Activity ID bugün yalnızca trigger kapatılarak düzeltilebilir.
-- Çözüm: guard, yalnızca bu RPC'nin aynı transaction içinde açtığı bayrak varken VE çağıran bağlam bu
-- fonksiyonun sahibi (SECURITY DEFINER) iken değişime izin verir. authenticated/service_role doğrudan
-- UPDATE'te bayrağı kullanamaz (current_user sahibi değildir). Her düzeltme gerekçesiyle register_audit'e yazılır.
-- Guard'ın WBS/alan kuralları değişmez.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

create or replace function public.fn_project_tasks_identity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.activity_id is not null
     and new.activity_id is distinct from old.activity_id then
    -- Yalnızca admin_correct_task_activity_id içinden (bayrak + fonksiyon sahibi bağlamı)
    if coalesce(current_setting('fons.activity_id_fix', true), '') <> 'on' then
      raise exception 'Atanmış Activity ID değiştirilemez: %', old.activity_id;
    elsif current_user is distinct from (select pg_get_userbyid(p.proowner) from pg_proc p
                                         where p.oid = to_regprocedure('public.admin_correct_task_activity_id(uuid,text,text)')) then
      raise exception 'Atanmış Activity ID değiştirilemez: %', old.activity_id;
    end if;
  end if;

  if new.wbs_id is not null
     and (tg_op = 'INSERT' or new.wbs_id is distinct from old.wbs_id) then
    if exists (select 1 from public.project_wbs w where w.id = new.wbs_id and not w.is_active) then
      raise exception 'Pasif WBS aktiviteye atanamaz';
    end if;
  end if;
  if new.area_id is not null
     and (tg_op = 'INSERT' or new.area_id is distinct from old.area_id) then
    if exists (select 1 from public.project_areas a where a.id = new.area_id and not a.is_active) then
      raise exception 'Pasif alan aktiviteye atanamaz';
    end if;
  end if;
  return new;
end;
$$;

create function public.admin_correct_task_activity_id(p_task_id uuid, p_new_activity_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_new text := nullif(btrim(coalesce(p_new_activity_id, '')), '');
  v_constraint text;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then
    perform public.register_raise('forbidden', 'Activity ID düzeltmesini yalnızca admin yapabilir');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    perform public.register_raise('validation', 'Gerekçe zorunlu', '{"fields":["p_reason"]}');
  end if;
  select id, project_id, activity_id into v_task from public.project_tasks where id = p_task_id for update;
  if not found then
    perform public.register_raise('not_found', 'Görev bulunamadı', jsonb_build_object('id', p_task_id));
  end if;
  if v_task.activity_id is not distinct from v_new then
    return jsonb_build_object('id', p_task_id, 'activity_id', v_new, 'changed', false);
  end if;

  perform set_config('fons.activity_id_fix', 'on', true);
  begin
    update public.project_tasks set activity_id = v_new where id = p_task_id;
  exception when check_violation or unique_violation then
    perform set_config('fons.activity_id_fix', 'off', true);
    get stacked diagnostics v_constraint = constraint_name;
    perform public.register_raise('validation', 'Activity ID biçimi geçersiz veya projede başka bir görevde kullanılıyor',
      jsonb_build_object('constraint', v_constraint, 'error', sqlerrm));
  end;
  perform set_config('fons.activity_id_fix', 'off', true);

  insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
  values (v_task.project_id, 'project_tasks', p_task_id, 'update',
          jsonb_build_object('activity_id', jsonb_build_array(v_task.activity_id, v_new)), p_reason);

  return jsonb_build_object('id', p_task_id, 'old_activity_id', v_task.activity_id, 'activity_id', v_new, 'changed', true);
end $$;

revoke all on function public.admin_correct_task_activity_id(uuid, text, text) from public, anon;
grant execute on function public.admin_correct_task_activity_id(uuid, text, text) to authenticated;

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL
-- ############################################################################
/*
begin;
-- Guard'ı 07.10.2026 haline döndür (yedek-faz-b-07-10.sql §B4 ile aynı gövde)
create or replace function public.fn_project_tasks_identity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.activity_id is not null
     and new.activity_id is distinct from old.activity_id then
    raise exception 'Atanmış Activity ID değiştirilemez: %', old.activity_id;
  end if;

  if new.wbs_id is not null
     and (tg_op = 'INSERT' or new.wbs_id is distinct from old.wbs_id) then
    if exists (select 1 from public.project_wbs w where w.id = new.wbs_id and not w.is_active) then
      raise exception 'Pasif WBS aktiviteye atanamaz';
    end if;
  end if;
  if new.area_id is not null
     and (tg_op = 'INSERT' or new.area_id is distinct from old.area_id) then
    if exists (select 1 from public.project_areas a where a.id = new.area_id and not a.is_active) then
      raise exception 'Pasif alan aktiviteye atanamaz';
    end if;
  end if;
  return new;
end;
$$;
drop function if exists public.admin_correct_task_activity_id(uuid, text, text);
commit;
*/
