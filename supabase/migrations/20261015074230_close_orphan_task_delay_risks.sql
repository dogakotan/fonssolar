-- Görev silinince gorev_gecikmesi riski açık kalıyordu (subject_ref = task_code,
-- görev artık yok, mevcut kapatma adımı EXISTS ile göreve baktığı için hiç
-- eşleşmiyordu). fn_recompute_auto_risks'e "görevi projede artık bulunmayan
-- açık otomatik gecikme riskini kapat" adımı eklenir. project_tasks DELETE
-- zaten trg_tasks_recompute_risks ile bu fonksiyonu çağırdığından, bundan
-- sonra silinen her görevin riski aynı anda kapanır. Bugün açık kalmış
-- sahipsiz riskler için tek seferlik aynı UPDATE çalıştırılır.
-- Ayrıca gecikme riski açan döngü ilerlemesi %100 olan görevi atlar: önceden
-- durumu "tamamlandı" yapılmamış ama ilerlemesi %100 olan görevin riski her
-- çalışmada önce yeniden açılıp sonra kapanıyor, closed_at her seferinde
-- kayıyordu (TIZ E1).
-- Fonksiyonun geri kalanı canlıdaki tanımla birebir aynıdır (15.10.2026).

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_recompute_auto_risks(p_project_id text, p_close_material_risks boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t RECORD;
  m RECORD;
  v_gecikme int;
  v_sev text;
BEGIN
  FOR t IN
    SELECT id, task_code, task_name, planned_end
    FROM project_tasks
    WHERE project_id = p_project_id
      AND status NOT IN ('tamamlandi','iptal')
      AND planned_end IS NOT NULL
      AND planned_end < CURRENT_DATE
      AND COALESCE(progress_pct, 0) < 100
  LOOP
    v_gecikme := CURRENT_DATE - t.planned_end;
    v_sev := CASE
      WHEN v_gecikme >= 8 THEN 'kritik'
      WHEN v_gecikme >= 4 THEN 'yüksek'
      ELSE 'orta'
    END;

    INSERT INTO project_risks (project_id, title, description, severity, status, mitigation, source, rule_code, subject_ref, category)
    VALUES (
      p_project_id,
      'Görev gecikti: ' || t.task_name || ' (' || t.task_code || ')',
      'Plan bitiş tarihi ' || to_char(t.planned_end, 'DD.MM.YYYY') || ' idi, ' || v_gecikme || ' gündür tamamlanmadı.',
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

  -- Görevi projede artık bulunmayan (silinmiş) açık gecikme riskleri kapanır.
  -- subject_ref boşsa dokunulmaz (kodsuz görevin riski yanlışlıkla kapanmasın).
  UPDATE project_risks r
  SET status = 'kapatıldı', updated_at = now()
  WHERE r.project_id = p_project_id
    AND r.source = 'otomatik'
    AND r.rule_code = 'gorev_gecikmesi'
    AND r.status <> 'kapatıldı'
    AND r.subject_ref IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM project_tasks pt
      WHERE pt.project_id = p_project_id
        AND pt.task_code = r.subject_ref
    );

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

-- Tek seferlik: bugün açık kalmış sahipsiz gecikme riskleri (yukarıdaki adımla
-- aynı koşul, tüm projeler). closed_at fn_set_risk_closed_at ile dolar.
UPDATE public.project_risks r
SET status = 'kapatıldı', updated_at = now()
WHERE r.source = 'otomatik'
  AND r.rule_code = 'gorev_gecikmesi'
  AND r.status <> 'kapatıldı'
  AND r.subject_ref IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_tasks pt
    WHERE pt.project_id = r.project_id
      AND pt.task_code = r.subject_ref
  );
