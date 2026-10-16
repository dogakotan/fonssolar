-- This allocator is an internal helper used by the two SECURITY DEFINER
-- purchase-request RPCs. Authenticated clients must not call it directly,
-- because arbitrary calls can consume sequence values without creating requests.
-- The RPCs remain able to call it as their postgres owner.
REVOKE EXECUTE ON FUNCTION public.fn_next_purchase_request_no(integer) FROM authenticated;
