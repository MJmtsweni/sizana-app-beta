-- Adds optional pagination to get_personalized_feed for ForumsScreen's
-- Explore-scope feed (the common, unbounded-fetch case pagination is meant
-- to fix). p_limit defaults to a high ceiling rather than a real page size
-- so every existing caller — including ForumsScreen's Home/Nearby scopes,
-- which filter/sort this same result set client-side by location and need
-- the (near-)complete set to do that correctly — keeps working unchanged
-- when it doesn't pass p_limit/p_offset explicitly.
create or replace function public.get_personalized_feed(
  user_interests_param text[],
  p_limit int default 1000,
  p_offset int default 0
)
returns setof forum_posts
language plpgsql
as $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM forum_posts
  ORDER BY
    cardinality(
      (SELECT ARRAY(
        SELECT unnest(tags)
        INTERSECT
        SELECT unnest(user_interests_param)
      ))
    ) DESC,
    created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;
