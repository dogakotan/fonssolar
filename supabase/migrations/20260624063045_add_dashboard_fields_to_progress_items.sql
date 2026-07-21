ALTER TABLE progress_items ADD COLUMN IF NOT EXISTS dashboard_visible boolean NOT NULL DEFAULT false;
ALTER TABLE progress_items ADD COLUMN IF NOT EXISTS dashboard_order integer NOT NULL DEFAULT 0;

