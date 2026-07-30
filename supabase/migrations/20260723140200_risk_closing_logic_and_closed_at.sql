-- 1) Kapanma tarihi kolonu + hem manuel hem otomatik kapanışları tek noktadan yöneten trigger
alter table public.project_risks add column if not exists closed_at timestamptz;

create or replace function public.fn_set_risk_closed_at()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if new.status = 'kapatıldı' and (old.status is null or old.status is distinct from 'kapatıldı') then
    new.closed_at := now();
  elsif new.status is distinct from 'kapatıldı' then
    new.closed_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_risk_set_closed_at on public.project_risks;
create trigger trg_risk_set_closed_at
before insert or update on public.project_risks
for each row execute function public.fn_set_risk_closed_at();

-- 2) İş kalemi riski artık görev %100 ilerleme/tamamlandı/iptal olduğunda kapanır
-- (yalnızca plan bitiş tarihinin ileri alınmasıyla değil); malzeme fazla talebi
-- riski ise yalnızca p_close_material_risks=true geçildiğinde (yönetici onayı anında) kapanır.
create or replace function public.fn_recompute_auto_risks(p_project_id text, p_close_material_risks boolean default false)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
DECLARE
  t RECORD;
  m RECORD;
  v_gecikme int;
  v_sev text;
BEGIN
  -- === Kural 1: Görev gecikmesi ===
  FOR t IN
    SELECT id, task_code, task_name, planned_end, is_critical
    FROM project_tasks
    WHERE project_id = p_project_id
      AND status NOT IN ('tamamlandi','iptal')
      AND planned_end IS NOT NULL
      AND planned_end < CURRENT_DATE
  LOOP
    v_gecikme := CURRENT_DATE - t.planned_end;
    v_sev := CASE
      WHEN v_gecikme >= 8 THEN 'kritik'
      WHEN v_gecikme >= 4 THEN 'yüksek'
      ELSE 'orta'
    END;
    IF t.is_critical THEN
      v_sev := CASE v_sev WHEN 'orta' THEN 'yüksek' WHEN 'yüksek' THEN 'kritik' ELSE 'kritik' END;
    END IF;

    INSERT INTO project_risks (project_id, title, description, severity, status, mitigation, source, rule_code, subject_ref, category)
    VALUES (
      p_project_id,
      'Görev gecikti: ' || t.task_name || ' (' || t.task_code || ')',
      'Plan bitiş tarihi ' || to_char(t.planned_end, 'DD.MM.YYYY') || ' idi, ' || v_gecikme || ' gündür tamamlanmadı.' ||
        CASE WHEN t.is_critical THEN ' Bu görev kritik yol üzerinde.' ELSE '' END,
      v_sev, 'açık', NULL, 'otomatik', 'gorev_gecikmesi', t.task_code, 'is_kalemi'
    )
    ON CONFLICT (project_id, rule_code, subject_ref) WHERE source = 'otomatik'
    DO UPDATE SET
      description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      status = 'açık',
      updated_at = now();
  END LOOP;

  UPDATE project_risks r
  SET status = 'kapatıldı', updated_at = now()
  WHERE r.project_id = p_project_id
    AND r.source = 'otomatik'
    AND r.rule_code = 'gorev_gecikmesi'
    AND r.status <> 'kapatıldı'
    AND EXISTS (
      SELECT 1 FROM project_tasks pt
      WHERE pt.project_id = p_project_id
        AND pt.task_code = r.subject_ref
        AND (COALESCE(pt.progress_pct, 0) >= 100 OR pt.status IN ('tamamlandi','iptal'))
    );

  -- === Kural 2: Malzeme fazla talebi ===
  FOR m IN
    SELECT
      pi.id, pi.equipment, pi.planned_qty,
      COALESCE(SUM(pri.quantity), 0) AS requested_qty
    FROM procurement_items pi
    LEFT JOIN purchase_request_items pri ON pri.bom_item_id = pi.id
    LEFT JOIN purchase_requests pr ON pr.id = pri.request_id AND pr.status NOT IN ('reddedildi','iptal')
    WHERE pi.project_id = p_project_id
      AND pi.planned_qty IS NOT NULL AND pi.planned_qty > 0
    GROUP BY pi.id, pi.equipment, pi.planned_qty
  LOOP
    IF m.requested_qty > m.planned_qty THEN
      INSERT INTO project_risks (project_id, title, description, severity, status, mitigation, source, rule_code, subject_ref, category)
      VALUES (
        p_project_id,
        'Malzeme fazla talep edildi: ' || m.equipment,
        'Malzeme Listesi''nde planlanan miktar ' || m.planned_qty || ' iken, satın alma taleplerinde toplam ' || m.requested_qty || ' talep edildi.',
        'yüksek', 'açık', NULL, 'otomatik', 'malzeme_fazla_talep', m.id::text, 'satin_alma'
      )
      ON CONFLICT (project_id, rule_code, subject_ref) WHERE source = 'otomatik'
      DO UPDATE SET
        description = EXCLUDED.description,
        status = 'açık',
        updated_at = now();
    ELSIF p_close_material_risks THEN
      UPDATE project_risks
      SET status = 'kapatıldı', updated_at = now()
      WHERE project_id = p_project_id AND source = 'otomatik'
        AND rule_code = 'malzeme_fazla_talep' AND subject_ref = m.id::text
        AND status <> 'kapatıldı';
    END IF;
  END LOOP;
END;
$function$;

-- 3) Satın alma talebi onaylandığı ANDA malzeme fazla talebi riskinin kapanmasına izin ver;
-- diğer durum geçişlerinde (ret/iptal/sonraki adımlar) yalnızca yeniden hesapla, kapatma.
create or replace function public.trg_recompute_risks_from_purchase_request()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
BEGIN
  IF NEW.status = 'onaylandi' AND (OLD.status IS DISTINCT FROM 'onaylandi') THEN
    PERFORM fn_apply_approved_material_excess(NEW.id);
    PERFORM fn_recompute_auto_risks(NEW.project_id, true);
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NEW.status IN ('reddedildi','iptal') AND OLD.status = 'onaylandi' THEN
    PERFORM fn_rollback_material_excess(NEW.id);
  END IF;

  PERFORM fn_recompute_auto_risks(COALESCE(NEW.project_id, OLD.project_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4) BOM planlanan miktar değişikliği (manuel) onaylandığında da malzeme fazla talebi
-- riskinin kapanmasına izin ver — bu da bir "yönetici onayı" anıdır.
-- (p_review_note DEFAULT NULL orijinal imzadan korunuyor — CREATE OR REPLACE bir
-- parametrenin default'unu kaldıramıyor.)
create or replace function public.review_procurement_item_change_request(p_id uuid, p_approve boolean, p_review_note text default null::text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
DECLARE
  v_row procurement_item_change_requests%ROWTYPE;
  v_new_item_id uuid;
  v_current_qty numeric;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  SELECT * INTO v_row FROM procurement_item_change_requests WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı';
  END IF;
  IF v_row.status <> 'bekliyor' THEN
    RAISE EXCEPTION 'Bu talep zaten sonuçlandırılmış.';
  END IF;

  IF p_approve AND v_row.procurement_item_id IS NOT NULL THEN
    SELECT planned_qty INTO v_current_qty
    FROM procurement_items WHERE id = v_row.procurement_item_id FOR UPDATE;

    IF v_current_qty IS DISTINCT FROM v_row.old_planned_qty THEN
      RAISE EXCEPTION 'Bu malzemenin planlanan miktarı talep oluşturulduktan sonra değişti (talep anında: %, şu an: %). Talebi reddedip güncel miktarla yeniden oluşturun.',
        coalesce(v_row.old_planned_qty::text, '—'), coalesce(v_current_qty::text, '—');
    END IF;
  END IF;

  UPDATE procurement_item_change_requests
  SET status = CASE WHEN p_approve THEN 'onaylandi' ELSE 'reddedildi' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_review_note
  WHERE id = p_id;

  IF p_approve THEN
    IF v_row.procurement_item_id IS NOT NULL THEN
      UPDATE procurement_items
      SET planned_qty = v_row.new_planned_qty, quantity = v_row.new_planned_qty::text, updated_at = now()
      WHERE id = v_row.procurement_item_id;
    ELSE
      INSERT INTO procurement_items (project_id, equipment, unit, category, planned_qty, quantity)
      VALUES (v_row.project_id, v_row.new_equipment, v_row.new_unit, v_row.new_category, v_row.new_planned_qty, v_row.new_planned_qty::text)
      RETURNING id INTO v_new_item_id;
    END IF;

    PERFORM fn_recompute_auto_risks(v_row.project_id, true);
  END IF;

  PERFORM notify_user(
    v_row.requested_by, auth.uid(), v_row.project_id, 'procurement_item_change_request', p_id,
    CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    CASE WHEN p_approve THEN
      (CASE WHEN v_row.procurement_item_id IS NULL THEN 'Yeni malzeme ekleme onaylandı' ELSE 'Malzeme miktarı değişikliği onaylandı' END)
    ELSE
      (CASE WHEN v_row.procurement_item_id IS NULL THEN 'Yeni malzeme ekleme reddedildi' ELSE 'Malzeme miktarı değişikliği reddedildi' END)
    END,
    coalesce(p_review_note, '')
  );
END;
$function$;
