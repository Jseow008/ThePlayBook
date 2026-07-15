-- Reconciliation-only capture of the public category aggregation RPC that
-- exists in production and is used by the landing and public content pages,
-- but was never represented in the repository migration sequence.
CREATE OR REPLACE FUNCTION public.get_category_stats()
RETURNS TABLE(category text, count bigint)
LANGUAGE sql
SET search_path TO 'public'
AS $function$
  select category, count(*) as count
  from content_item
  where status = 'verified'
  and deleted_at is null
  and category is not null
  group by category
  order by count desc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_category_stats()
TO anon, authenticated, service_role;
