-- 20260724153500_seed_financial_transactions_demo ile eklenen 4 demo satır,
-- cost_allocations senkron trigger'ı (sync_cost_allocation_from_financial_transaction,
-- 20260726162840_link_financial_transactions_to_cost_allocations) henüz yokken
-- insert edildiği için hiç cost_allocations karşılığı olmadan kalmıştı.
-- Trigger'ın normalde yapacağı upsert'in birebir aynısı, geriye dönük.
insert into cost_allocations (transaction_id, project_id, amount, category, note, allocated_at)
select id, project_id, amount, 'diger',
       'Faturasız ödeme kaydından otomatik (geriye dönük backfill, 04.08.2026 — trigger''dan önce seed edilmiş 4 kayıt)',
       now()
from financial_transactions
where id in (
  '4a2896fe-4e78-4ef7-b698-df13e6ee2933',
  'bd361074-97ed-4bae-bb9a-c43b9f37af2b',
  '5ebd1f5f-ce67-45c1-b496-56df0febea97',
  '61ab505d-ae36-47bd-8087-203eddca51d2'
)
on conflict (transaction_id) do update
  set amount = excluded.amount, project_id = excluded.project_id;
