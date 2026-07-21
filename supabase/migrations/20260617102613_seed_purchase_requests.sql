
INSERT INTO public.purchase_requests (id, project_id, requested_by, title, urgency, status, notes)
VALUES
  ('cccccccc-0001-0000-0000-000000000001','kaptan-usak-ges','84cce00a-487a-47e9-9b6d-e41bc62bcaf5',
   'DC Kablo - 2. Parti','acil','bekliyor','Topraklama hattı için acil ihtiyaç'),
  ('cccccccc-0002-0000-0000-000000000001','kaptan-usak-ges','84cce00a-487a-47e9-9b6d-e41bc62bcaf5',
   'Güneş Paneli Temizleme Seti','normal','bekliyor','Bakım için gerekli'),
  ('cccccccc-0003-0000-0000-000000000001','kaptan-usak-ges','84cce00a-487a-47e9-9b6d-e41bc62bcaf5',
   'İnverter Yedek Parça','çok_acil','bekliyor','İnverter 3 arızalı');

INSERT INTO public.pr_items (request_id, name, quantity, unit, unit_price) VALUES
  ('cccccccc-0001-0000-0000-000000000001','DC Kablo 4mm²',500,'Metre',12.50),
  ('cccccccc-0001-0000-0000-000000000001','Kablo Bağlantı Klemensi',100,'Adet',8.00),
  ('cccccccc-0002-0000-0000-000000000001','Panel Temizleme Fırçası',10,'Adet',450.00),
  ('cccccccc-0002-0000-0000-000000000001','Temizleme Solüsyonu',20,'Litre',85.00),
  ('cccccccc-0003-0000-0000-000000000001','IGBT Modül',3,'Adet',12500.00),
  ('cccccccc-0003-0000-0000-000000000001','Kondansatör',6,'Adet',2800.00);

