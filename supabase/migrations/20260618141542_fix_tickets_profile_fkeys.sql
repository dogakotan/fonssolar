
-- tickets.created_by ve assigned_to profiles tablosuna bağla
ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_created_by_fkey,
  DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT tickets_assigned_to_fkey 
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

