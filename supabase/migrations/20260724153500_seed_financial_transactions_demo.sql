insert into public.financial_transactions
  (transaction_no,transaction_type,project_id,supplier_id,beneficiary_name,transaction_date,due_date,amount,currency,description,document_type,invoice_expected,status)
values
  ('FIN-2026-0001','avans','test-izmir-ges-2026','aaaaaaaa-0000-0000-0000-000000000001',null,current_date-6,current_date+8,350000,'TRY','Panel sevkiyatı öncesi tedarikçi avansı','dekont',true,'odeme_bekliyor'),
  ('FIN-2026-0002','masraf','test-izmir-ges-2026','aaaaaaaa-0000-0000-0000-000000000004',null,current_date-3,current_date+4,82500,'TRY','Şantiye konstrüksiyon ek malzeme gideri','fis',true,'odeme_bekliyor'),
  ('FIN-2026-0003','hakedis','test-kayseri-develi-ges','aaaaaaaa-0000-0000-0000-000000000003',null,current_date-2,current_date+12,210000,'TRY','Arazi nakliye ve mobilizasyon hakedişi','sozlesme',false,'odeme_bekliyor'),
  ('FIN-2026-0004','vergi_harc','test-kayseri-develi-ges',null,'Develi Belediyesi',current_date,current_date,47500,'TRY','Ruhsat ve proje onay harcı','makbuz',false,'odeme_bekliyor')
on conflict (transaction_no) do nothing;

insert into public.financial_transaction_payments
  (transaction_id,payment_date,amount,currency,payment_method,reference_no,note)
select id,current_date-4,150000,'TRY','havale','TRX-FIN-0001','İlk avans ödemesi'
from public.financial_transactions ft
where transaction_no='FIN-2026-0001'
  and not exists (
    select 1 from public.financial_transaction_payments p
    where p.transaction_id=ft.id and p.reference_no='TRX-FIN-0001'
  );
