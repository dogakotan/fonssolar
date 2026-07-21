
-- 1) project_risks: otomatik/manuel ayrımı + doğal anahtar
ALTER TABLE project_risks ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manuel';
ALTER TABLE project_risks ADD COLUMN IF NOT EXISTS rule_code text;
ALTER TABLE project_risks ADD COLUMN IF NOT EXISTS subject_ref text;
DO $$ BEGIN
  ALTER TABLE project_risks ADD CONSTRAINT project_risks_source_check CHECK (source IN ('manuel','otomatik'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_project_risks_auto_key
  ON project_risks (project_id, rule_code, subject_ref) WHERE source = 'otomatik';

-- 2) Ana hesaplama fonksiyonu: iki kural (görev gecikmesi, malzeme fazla talebi)
CREATE OR REPLACE FUNCTION public.fn_recompute_auto_risks(p_project_id text)
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

    INSERT INTO project_risks (project_id, title, description, severity, status, mitigation, source, rule_code, subject_ref)
    VALUES (
      p_project_id,
      'Görev gecikti: ' || t.task_name || ' (' || t.task_code || ')',
      'Plan bitiş tarihi ' || to_char(t.planned_end, 'DD.MM.YYYY') || ' idi, ' || v_gecikme || ' gündür tamamlanmadı.' ||
        CASE WHEN t.is_critical THEN ' Bu görev kritik yol üzerinde.' ELSE '' END,
      v_sev, 'açık', NULL, 'otomatik', 'gorev_gecikmesi', t.task_code
    )
    ON CONFLICT (project_id, rule_code, subject_ref) WHERE source = 'otomatik'
    DO UPDATE SET
      description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      status = 'açık',
      updated_at = now();
  END LOOP;

  -- gecikmesi biten/tamamlanan görevlerin otomatik risklerini kapat
  UPDATE project_risks r
  SET status = 'kapatıldı', updated_at = now()
  WHERE r.project_id = p_project_id
    AND r.source = 'otomatik'
    AND r.rule_code = 'gorev_gecikmesi'
    AND r.status <> 'kapatıldı'
    AND NOT EXISTS (
      SELECT 1 FROM project_tasks pt
      WHERE pt.project_id = p_project_id
        AND pt.task_code = r.subject_ref
        AND pt.status NOT IN ('tamamlandi','iptal')
        AND pt.planned_end IS NOT NULL
        AND pt.planned_end < CURRENT_DATE
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
      INSERT INTO project_risks (project_id, title, description, severity, status, mitigation, source, rule_code, subject_ref)
      VALUES (
        p_project_id,
        'Malzeme fazla talep edildi: ' || m.equipment,
        'Malzeme Listesi''nde planlanan miktar ' || m.planned_qty || ' iken, satın alma taleplerinde toplam ' || m.requested_qty || ' talep edildi.',
        'yüksek', 'açık', NULL, 'otomatik', 'malzeme_fazla_talep', m.id::text
      )
      ON CONFLICT (project_id, rule_code, subject_ref) WHERE source = 'otomatik'
      DO UPDATE SET
        description = EXCLUDED.description,
        status = 'açık',
        updated_at = now();
    ELSE
      UPDATE project_risks
      SET status = 'kapatıldı', updated_at = now()
      WHERE project_id = p_project_id AND source = 'otomatik'
        AND rule_code = 'malzeme_fazla_talep' AND subject_ref = m.id::text
        AND status <> 'kapatıldı';
    END IF;
  END LOOP;
END;
$function$;

-- 3) Tetikleyiciler
CREATE OR REPLACE FUNCTION public.trg_recompute_risks_from_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM fn_recompute_auto_risks(COALESCE(NEW.project_id, OLD.project_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_tasks_recompute_risks ON project_tasks;
CREATE TRIGGER trg_tasks_recompute_risks
AFTER INSERT OR UPDATE OF planned_end, status, is_critical OR DELETE ON project_tasks
FOR EACH ROW EXECUTE FUNCTION trg_recompute_risks_from_task();

CREATE OR REPLACE FUNCTION public.trg_recompute_risks_from_purchase_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_project_id text;
BEGIN
  SELECT pr.project_id INTO v_project_id FROM purchase_requests pr WHERE pr.id = COALESCE(NEW.request_id, OLD.request_id);
  IF v_project_id IS NOT NULL THEN
    PERFORM fn_recompute_auto_risks(v_project_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_items_recompute_risks ON purchase_request_items;
CREATE TRIGGER trg_purchase_items_recompute_risks
AFTER INSERT OR UPDATE OR DELETE ON purchase_request_items
FOR EACH ROW EXECUTE FUNCTION trg_recompute_risks_from_purchase_item();

CREATE OR REPLACE FUNCTION public.trg_recompute_risks_from_purchase_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM fn_recompute_auto_risks(COALESCE(NEW.project_id, OLD.project_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_requests_recompute_risks ON purchase_requests;
CREATE TRIGGER trg_purchase_requests_recompute_risks
AFTER UPDATE OF status ON purchase_requests
FOR EACH ROW EXECUTE FUNCTION trg_recompute_risks_from_purchase_request();

-- günlük "kalp atışı": tarih ilerledikçe oluşan gecikmeleri yakalamak için günlük rapor girişine bağlı
CREATE OR REPLACE FUNCTION public.trg_recompute_risks_from_daily_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM fn_recompute_auto_risks(NEW.project_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_daily_report_recompute_risks ON daily_reports;
CREATE TRIGGER trg_daily_report_recompute_risks
AFTER INSERT ON daily_reports
FOR EACH ROW EXECUTE FUNCTION trg_recompute_risks_from_daily_report();

