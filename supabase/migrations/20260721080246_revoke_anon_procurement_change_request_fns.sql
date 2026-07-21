REVOKE ALL ON FUNCTION public.create_procurement_item_change_request(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_procurement_item_change_request(uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.review_procurement_item_change_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_procurement_item_change_request(uuid, boolean, text) TO authenticated;

