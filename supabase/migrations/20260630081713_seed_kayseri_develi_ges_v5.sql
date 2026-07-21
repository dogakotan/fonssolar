
DO $$
DECLARE
  v_ss_id  UUID := 'e1e76bb3-cdcb-44d2-b4d9-e4f0e45667d1';
  v_proj   TEXT := 'test-kayseri-develi-ges';

  v_pi_mob   UUID := 'f1000001-0000-0000-0000-000000000001';
  v_pi_tev   UUID := 'f1000001-0000-0000-0000-000000000002';
  v_pi_yol   UUID := 'f1000001-0000-0000-0000-000000000003';
  v_pi_kolon UUID := 'f1000001-0000-0000-0000-000000000004';
  v_pi_kiris UUID := 'f1000001-0000-0000-0000-000000000005';
  v_pi_asik  UUID := 'f1000001-0000-0000-0000-000000000006';
  v_pi_panel UUID := 'f1000001-0000-0000-0000-000000000007';
  v_pi_dc    UUID := 'f1000001-0000-0000-0000-000000000008';
  v_pi_inv   UUID := 'f1000001-0000-0000-0000-000000000009';
  v_pi_og    UUID := 'f1000001-0000-0000-0000-000000000010';

  v_w_acik TEXT; v_w_pb TEXT; v_w_yag TEXT;
  v_ts_gon TEXT; v_ts_acik TEXT; v_ts_isl TEXT; v_ts_kap TEXT;
  v_sev_yuk TEXT;
  v_pr_onay TEXT; v_pr_satin TEXT; v_urg_cok TEXT;
  v_sh_muh TEXT; v_sh_isci TEXT;
  v_mt_vince TEXT; v_mt_gayk TEXT := 'gayk_delici';
  v_ms_cal TEXT; v_ms_ariza TEXT;

  v_rid    UUID;
  v_daynum INT;
  v_date   DATE;
  v_weath  TEXT;
  v_gstat  TEXT;
  v_workers INT;
BEGIN

v_w_acik  := 'a'   || chr(231) || chr(305) || 'k';
v_w_pb    := 'par' || chr(231) || 'al' || chr(305) || ' bulutlu';
v_w_yag   := 'ya'  || chr(287) || 'murlu';
v_ts_gon  := 'g'   || chr(246) || 'nderildi';
v_ts_acik := 'a'   || chr(231) || chr(305) || 'k';
v_ts_isl  := 'i'   || chr(351) || 'lemde';
v_ts_kap  := 'kapat' || chr(305) || 'ld' || chr(305);
v_sev_yuk := 'y'   || chr(252) || 'ksek';
v_pr_onay  := 'onayland' || chr(305);
v_pr_satin := 'sat' || chr(305) || 'n_al' || chr(305) || 'nd' || chr(305);
v_urg_cok  := chr(231) || 'ok_acil';
v_sh_muh  := 'm'   || chr(252) || 'hendis';
v_sh_isci := 'i'   || chr(351) || chr(231) || 'i';
v_mt_vince := 'vin' || chr(231);
v_ms_cal   := chr(231) || 'al' || chr(305) || chr(351) || chr(305) || 'yor';
v_ms_ariza := 'ar' || chr(305) || 'zal' || chr(305);

IF EXISTS (SELECT 1 FROM projects WHERE id = v_proj) THEN
  RAISE NOTICE 'Proje zaten mevcut: %', v_proj;
  RETURN;
END IF;

INSERT INTO projects (id, name, location, capacity_kwp, capacity_kwe,
  start_date, target_date, status, progress, project_type, total_days, created_at)
VALUES (v_proj, 'Kayseri Develi GES', 'Kayseri / Develi', 5500, 4700,
  '2026-04-30', '2026-10-31', 'aktif', 25, 'arazi_ges', 185,
  '2026-04-20T08:00:00+00:00');

INSERT INTO progress_items (id, project_id, name, unit, target_qty, total_progress, category, order_index)
VALUES
  (v_pi_mob,   v_proj, 'Santiye Mobilizasyonu', '%',    100, 0, 'mobilizasyon', 10),
  (v_pi_tev,   v_proj, 'Arazi Tesviye',         '%',    100, 0, 'mobilizasyon', 11),
  (v_pi_yol,   v_proj, 'Ulasim Yollari',        '%',    100, 0, 'mobilizasyon', 12),
  (v_pi_kolon, v_proj, 'Kolon Cakimi',          'adet', 3800, 0, 'mekanik',      1),
  (v_pi_kiris, v_proj, 'Kiris Montaji',         'adet',  420, 0, 'mekanik',      2),
  (v_pi_asik,  v_proj, 'Asik Montaji',          'adet', 5500, 0, 'mekanik',      3),
  (v_pi_panel, v_proj, 'Panel Montaji',         'adet',11000, 0, 'mekanik',      4),
  (v_pi_dc,    v_proj, 'DC Kablo Cekimi',       'mt',  62000, 0, 'elektrik_dc',  5),
  (v_pi_inv,   v_proj, 'Inverter GES Pano',     'adet',   20, 0, 'elektrik_ac',  6),
  (v_pi_og,    v_proj, 'OG Hucre Montaji',      'adet',   10, 0, 'elektrik_og',  7);

INSERT INTO project_tasks (id, project_id, task_code, task_name, category,
  planned_start, planned_end, actual_start, progress_pct, status, responsible, team_size, group_label)
VALUES
  (gen_random_uuid(),v_proj,'MOB-01','Santiye Kurulumu', 'mobilizasyon','2026-04-30','2026-05-07','2026-04-30',100,'tamamlandi', 'Mehmet Demir', 8,'Mobilizasyon'),
  (gen_random_uuid(),v_proj,'MOB-02','Arazi Tesviye',    'mobilizasyon','2026-05-01','2026-05-20','2026-05-01', 95,'tamamlandi', 'Ali Kaya',    12,'Mobilizasyon'),
  (gen_random_uuid(),v_proj,'MOB-03','Ulasim Yollari',   'mobilizasyon','2026-05-05','2026-05-25','2026-05-05', 90,'tamamlandi', 'Hasan Celik',  6,'Mobilizasyon'),
  (gen_random_uuid(),v_proj,'MEK-01','Kolon Cakimi F1',  'mekanik',     '2026-05-10','2026-06-05','2026-05-10', 50,'tamamlandi', 'Murat Yildiz',18,'Mekanik'),
  (gen_random_uuid(),v_proj,'MEK-02','Kolon Cakimi F2',  'mekanik',     '2026-06-06','2026-06-30','2026-06-06', 20,'devam_ediyor','Murat Yildiz',18,'Mekanik'),
  (gen_random_uuid(),v_proj,'MEK-03','Kiris Montaji F1', 'mekanik',     '2026-05-20','2026-06-15','2026-05-20', 50,'tamamlandi', 'Kemal Arslan',10,'Mekanik'),
  (gen_random_uuid(),v_proj,'MEK-04','Asik Montaji F1',  'mekanik',     '2026-05-25','2026-06-20','2026-05-25', 30,'devam_ediyor','Emre Sahin',  12,'Mekanik'),
  (gen_random_uuid(),v_proj,'MEK-05','Panel Montaji F1', 'mekanik',     '2026-06-01','2026-07-15','2026-06-01',  8,'devam_ediyor','Fatih Ozturk',24,'Mekanik'),
  (gen_random_uuid(),v_proj,'ELK-01','DC Kablo Cekimi',  'elektrik_dc', '2026-06-10','2026-07-20','2026-06-10',  7,'devam_ediyor','Serkan Dogan',14,'Elektrik DC'),
  (gen_random_uuid(),v_proj,'ELK-02','Inverter ve Pano', 'elektrik_ac', '2026-07-15','2026-08-10', NULL,          0,'beklemede',  'Volkan Yilmaz',6,'Elektrik AC'),
  (gen_random_uuid(),v_proj,'ELK-03','OG Hucre',         'elektrik_og', '2026-08-01','2026-08-20', NULL,          0,'beklemede',  'Tolga Kilic',  4,'Elektrik OG'),
  (gen_random_uuid(),v_proj,'ENH-01','ENH Direk',        'enh',         '2026-07-01','2026-08-15', NULL,          0,'beklemede',  'Baran Ciftci', 8,'ENH'),
  (gen_random_uuid(),v_proj,'TOP-01','Topraklama',       'topraklama',  '2026-07-20','2026-08-10', NULL,          0,'beklemede',  'Serkan Dogan', 6,'Topraklama'),
  (gen_random_uuid(),v_proj,'DEV-01','Devreye Alma',     'devreye_alma','2026-10-01','2026-10-25', NULL,          0,'beklemede',  'Volkan Yilmaz',4,'Devreye Alma');

FOR v_date IN
  SELECT d::date
  FROM generate_series('2026-04-30'::date, '2026-06-29'::date, '1 day') d
  WHERE EXTRACT(DOW FROM d) != 0
LOOP
  v_daynum  := v_date - '2026-04-30'::date;
  v_workers := LEAST(140, 25 + v_daynum * 2);

  v_weath := CASE (v_daynum % 7)
    WHEN 2 THEN v_w_pb
    WHEN 4 THEN v_w_pb
    WHEN 5 THEN CASE WHEN v_daynum % 14 = 5 THEN v_w_yag ELSE v_w_acik END
    ELSE v_w_acik
  END;

  v_gstat := CASE
    WHEN v_daynum % 13 = 0 THEN 'kritik'
    WHEN v_daynum % 9  = 0 THEN 'dikkat'
    ELSE 'normal'
  END;

  v_rid := gen_random_uuid();

  INSERT INTO daily_reports (id, project_id, report_date, created_by,
    weather, general_status, worker_count, notes, created_at)
  VALUES (v_rid, v_proj, v_date, v_ss_id, v_weath, v_gstat, v_workers,
    CASE
      WHEN v_daynum = 0       THEN 'Santiye kurulumu yapildi, ilk ekip sahaya girdi.'
      WHEN v_daynum = 1       THEN 'Konteyner ve depo alani hazir hale getirildi.'
      WHEN v_daynum % 13 = 0  THEN 'Ekipman arizasi, bakim ekibi cagirildi.'
      WHEN v_daynum % 9  = 0  THEN 'Yagis nedeniyle ogleden sonra calisma durduruldu.'
      WHEN v_daynum % 6  = 0  THEN 'Gunluk hedef asildi, ekip performansi iyi.'
      ELSE NULL
    END,
    v_date::timestamptz + '07:30:00'::interval);

  INSERT INTO personnel_log_entries (id, report_id, shift, department, count) VALUES
    (gen_random_uuid(), v_rid, v_sh_muh,  'idari',    2),
    (gen_random_uuid(), v_rid, 'usta',    'mekanik',  GREATEST(4,(v_workers*0.25)::int)),
    (gen_random_uuid(), v_rid, v_sh_isci, 'mekanik',  GREATEST(8,(v_workers*0.40)::int)),
    (gen_random_uuid(), v_rid, v_sh_isci, 'elektrik', GREATEST(3,(v_workers*0.18)::int));

  INSERT INTO machinery_logs (id, report_id, machine_type, count, status, notes) VALUES
    (gen_random_uuid(), v_rid, v_mt_gayk,  2,
      CASE WHEN v_daynum % 13 = 0 THEN v_ms_ariza ELSE v_ms_cal END,
      CASE WHEN v_daynum % 13 = 0 THEN 'Hidrolik ariza' ELSE NULL END),
    (gen_random_uuid(), v_rid, v_mt_vince, 1, v_ms_cal, NULL),
    (gen_random_uuid(), v_rid, 'kamyon',   CASE WHEN v_daynum > 30 THEN 3 ELSE 2 END, v_ms_cal, NULL),
    (gen_random_uuid(), v_rid, 'jcb',      1, v_ms_cal, NULL);

  IF v_daynum <= 9 THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_mob,v_rid,10,NULL,v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum BETWEEN 2 AND 22 THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_tev,v_rid,5,NULL,v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum BETWEEN 3 AND 23 THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_yol,v_rid,5,NULL,v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum BETWEEN 10 AND 52 THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_kolon,v_rid,
        CASE WHEN v_daynum%13=0 THEN 25 ELSE 60 END,
        NULL,v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum BETWEEN 20 AND 52 THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_kiris,v_rid,8,NULL,v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum >= 25 THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_asik,v_rid,12,NULL,v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum >= 33 THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_panel,v_rid,28,NULL,v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum >= 42 THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_dc,v_rid,220,NULL,v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum IN (50,53,54,56,57) THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_inv,v_rid,1,'Inverter kurulumu',v_date::timestamptz+'17:00:00');
  END IF;
  IF v_daynum IN (53,55,57) THEN
    INSERT INTO progress_daily (id,item_id,report_id,qty_added,note,created_at) VALUES
      (gen_random_uuid(),v_pi_og,v_rid,1,'OG hucre montaji',v_date::timestamptz+'17:00:00');
  END IF;

END LOOP;

INSERT INTO tickets (id,project_id,created_by,title,description,category,severity,status,created_at) VALUES
  (gen_random_uuid(),v_proj,v_ss_id,'Kazik makinesi hidrolik arizasi', 'Faz-1 vincinde hidrolik sorunu.',  'mekanik',  v_sev_yuk, v_ts_kap, '2026-05-14T09:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'Zemin sertligi beklenenden fazla','B4 blokunda rok delgi yetersiz.',  'mekanik',  v_sev_yuk, v_ts_kap, '2026-05-22T10:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'Panel tedarik gecikmesi',         'Panel sevkiyati 2 hafta gec.',     'genel',    'orta',    v_ts_isl, '2026-06-10T08:30:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'TEDAS izin sureci uzuyor',        'TEDAS onay bekleniyor.',           'genel',    'orta',    v_ts_acik,'2026-06-15T11:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'KKD eksikligi tespit edildi',     'Baret ve yelek eksik.',            'genel',    v_sev_yuk, v_ts_isl, '2026-06-20T07:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'DC kablo miktar yetersizligi',    'Siparis edilen miktar az kaldi.',  'elektrik', 'orta',    v_ts_gon, '2026-06-25T09:00:00+00:00');

INSERT INTO purchase_requests (id,project_id,requested_by,title,urgency,status,notes,created_at) VALUES
  (gen_random_uuid(),v_proj,v_ss_id,'Rok Delgi Matkap Ucu (80 adet)', 'acil',    v_pr_satin,'B bloku rok delgi icin.',           '2026-05-08T08:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'Kolon Celik Profil Ek Siparis',  'acil',    v_pr_onay, '200 adet ek profil.',                '2026-05-18T09:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'Konteyner Ofis Klimasi',         'normal',  v_pr_satin,'Yaz icin klima.',                    '2026-05-25T10:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'Isci KKD Takviye (50 set)',      'normal',  v_pr_onay, 'Artan personel icin KKD.',           '2026-06-01T08:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'Panel Montaj Vidasi (5000 adet)','acil',    'bekliyor','Panel montaji icin vida takviyesi.', '2026-06-12T09:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'DC Kablo MC4 Konnektur (500 ad)',v_urg_cok,'bekliyor','DC kablo icin konnektur.',           '2026-06-22T08:00:00+00:00'),
  (gen_random_uuid(),v_proj,v_ss_id,'Ekstra Vince Kiralama (1 hafta)','acil',   'bekliyor','Panel montaji icin ek vince.',        '2026-06-25T10:00:00+00:00');

RAISE NOTICE 'Kayseri Develi GES test projesi basariyla olusturuldu!';
END $$;

