-- Phase 8: database-backed rate limiting for anonymous and credential endpoints.
--
-- Design notes
--  * Fixed windows: simple, atomic (one upsert), and correct across serverless instances, unlike in-memory counters.
--    The known trade-off is that a client can burst up to 2x the limit across a window boundary.
--  * service_role only. If anon could call this, anyone could burn another visitor's bucket and lock them out.
--  * Callers hash the client address before building the bucket name, so no raw IPs are stored.
--  * Old windows are removed by purge_rate_limits(); schedule it daily (pg_cron).

create table public.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

create function public.rate_limit_check(p_bucket text, p_limit integer, p_window_seconds integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) not between 1 and 200 or p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit parameters' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_hits as r (bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'remaining', greatest(p_limit - v_hits, 0),
    'retry_after', case when v_hits <= p_limit then 0
                        else ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::int end);
end $$;

create function public.purge_rate_limits() returns integer
language sql security definer set search_path = '' as $$
  with d as (delete from public.rate_limit_hits where window_start < now() - interval '1 day' returning 1) select count(*)::int from d
$$;

revoke execute on function public.rate_limit_check(text, integer, integer), public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.rate_limit_check(text, integer, integer), public.purge_rate_limits() to service_role;
