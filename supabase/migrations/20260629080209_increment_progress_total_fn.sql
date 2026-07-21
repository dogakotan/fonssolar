
CREATE OR REPLACE FUNCTION increment_progress_total(p_item_id uuid, p_qty numeric)
RETURNS void LANGUAGE sql AS $$
  UPDATE progress_items
  SET total_progress = COALESCE(total_progress, 0) + p_qty,
      updated_at = now()
  WHERE id = p_item_id;
$$;

