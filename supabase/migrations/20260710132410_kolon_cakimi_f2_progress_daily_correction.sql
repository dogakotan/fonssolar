insert into progress_daily (report_id, item_id, qty_added, note)
select '44e464bf-02ba-43eb-b096-7936eda843d0',
       id,
       157,
       'Kolon Cakimi kalemi F1/F2 olarak ayrıştırıldı — F2 payı (manuel düzeltme, sahadan gelen sayıma göre)'
from progress_items
where name = 'Kolon Cakimi F2' and project_id = 'test-kayseri-develi-ges';

