
alter view public.vw_weekly_progress set (security_invoker = on);
alter view public.vw_monthly_progress set (security_invoker = on);
alter view public.vw_progress_timeline set (security_invoker = on);
alter view public.vw_delayed_tasks set (security_invoker = on);

