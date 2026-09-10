-- Root-cause fix for the request_no collision bug.
--
-- The previous implementation incremented purchase_request_no_counters.last_value
-- inside the same transaction/subtransaction as the caller's INSERT. When that
-- INSERT later failed for any reason (unique_violation) and PL/pgSQL's
-- exception handler rolled back to its implicit savepoint, the counter
-- increment was rolled back too -- handing the exact same number out again on
-- the very next call. Reproduced live and confirmed deterministic (100%, not
-- intermittent) via a forced-collision test.
--
-- Real Postgres SEQUENCEs are explicitly designed so that nextval() is never
-- undone by a later rollback -- this is precisely the guarantee this counter
-- needs. One sequence per year preserves the existing "resets to 001 each
-- year" numbering behavior. The advisory lock is no longer needed: sequence
-- nextval() is natively concurrency-safe without any application-level
-- locking.

-- Seed the 2026 sequence to continue exactly where the old counter left off.
create sequence if not exists public.purchase_request_no_seq_2026 start with 1047;

create or replace function public.fn_next_purchase_request_no(p_year integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seq_name text := 'purchase_request_no_seq_' || p_year::text;
  v_next bigint;
begin
  if not exists (
    select 1 from pg_sequences where schemaname = 'public' and sequencename = v_seq_name
  ) then
    execute format('create sequence if not exists public.%I start with 1', v_seq_name);
  end if;

  v_next := nextval(('public.' || v_seq_name)::regclass);

  return 'SAT-' || p_year || '-' || lpad(v_next::text, 3, '0');
end;
$function$;
