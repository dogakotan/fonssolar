-- Canlı testte bulunan pre-existing hata: LEFT JOIN'in ON koşulundaki
-- "pr.status NOT IN ('reddedildi','iptal')" yalnızca pr.* kolonlarını NULL yapıyordu,
-- SUM(pri.quantity) bu satırları hâlâ topluyordu — yani reddedilen/iptal edilen bir
-- talebin miktarı "malzeme fazla talebi" hesabından asla düşmüyordu. FILTER (WHERE
-- pr.id IS NOT NULL) ile SUM artık yalnızca hâlâ geçerli (reddedilmemiş/iptal
-- edilmemiş) taleplerin miktarını sayıyor.
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
      COALESCE(SUM(pri.quantity) FILTER (WHERE pr.id IS NOT NULL), 0) AS requested_qty
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
