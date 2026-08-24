-- Haversine-based "nearby" search for the three screens whose Nearby scope
-- previously fetched the *entire* table and ranked by distance client-side
-- (see pagination_2026-08-24 memory). Each RPC returns only (id, distance_km)
-- — the screen re-runs its normal .select() with joins on that id list, the
-- same two-step pattern get_personalized_feed already established for
-- ForumsScreen, rather than duplicating join logic in SQL.
--
-- No PostGIS: distance is computed with a plain haversine formula. A btree
-- index on (latitude, longitude) lets the bounding-box pre-filter in each
-- function prune most rows before the trig-heavy exact distance is computed
-- on what's left.

create index if not exists businesses_lat_lng_idx on public.businesses (latitude, longitude);
create index if not exists events_lat_lng_idx on public.events (latitude, longitude);
create index if not exists forum_posts_lat_lng_idx on public.forum_posts (latitude, longitude);

-- Degrees-of-latitude/longitude a bounding box needs to cover a given
-- radius, used to cheaply prune rows before the exact haversine calc below.
-- 1 degree latitude is a near-constant ~111km; longitude shrinks with
-- cos(latitude), so widen the box near the poles rather than at the equator.
create or replace function public._geo_bbox_delta(p_lat double precision, p_radius_km double precision, out d_lat double precision, out d_lng double precision)
language sql
immutable
as $$
  select
    p_radius_km / 111.0,
    p_radius_km / (111.0 * greatest(cos(radians(p_lat)), 0.01));
$$;

create or replace function public.nearby_businesses(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 100,
  p_category text default null,
  p_search text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table(id uuid, distance_km double precision)
language sql
stable
as $$
  with bbox as (select * from public._geo_bbox_delta(p_lat, p_radius_km)),
  candidates as (
    select
      b.id,
      6371 * acos(greatest(-1, least(1,
        cos(radians(p_lat)) * cos(radians(b.latitude)) * cos(radians(b.longitude) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(b.latitude))
      ))) as distance_km
    from public.businesses b, bbox
    where b.latitude is not null and b.longitude is not null
      and b.latitude between p_lat - bbox.d_lat and p_lat + bbox.d_lat
      and b.longitude between p_lng - bbox.d_lng and p_lng + bbox.d_lng
      and (p_category is null or p_category = 'All' or b.category = p_category)
      and (p_search is null or p_search = '' or b.name ilike '%' || p_search || '%')
  )
  select id, distance_km
  from candidates
  where distance_km <= p_radius_km
  order by distance_km asc
  limit p_limit offset p_offset;
$$;

create or replace function public.nearby_forum_posts(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 100,
  p_limit int default 20,
  p_offset int default 0
)
returns table(id uuid, distance_km double precision)
language sql
stable
as $$
  with bbox as (select * from public._geo_bbox_delta(p_lat, p_radius_km)),
  candidates as (
    select
      p.id,
      6371 * acos(greatest(-1, least(1,
        cos(radians(p_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(p.latitude))
      ))) as distance_km
    from public.forum_posts p, bbox
    where p.latitude is not null and p.longitude is not null
      and p.latitude between p_lat - bbox.d_lat and p_lat + bbox.d_lat
      and p.longitude between p_lng - bbox.d_lng and p_lng + bbox.d_lng
  )
  select id, distance_km
  from candidates
  where distance_km <= p_radius_km
  order by distance_km asc
  limit p_limit offset p_offset;
$$;

-- Folds in the private-event visibility rule that used to live only in
-- EventsScreen's client-side filter (and had a gap: it never accounted for
-- someone who can see a private event because they RSVP'd to it without
-- being the creator — see pagination_2026-08-24 memory). p_user_id is
-- required (not defaulted to null) so that gap can't silently reappear by
-- someone forgetting to pass it.
create or replace function public.nearby_events(
  p_lat double precision,
  p_lng double precision,
  p_user_id uuid,
  p_radius_km double precision default 100,
  p_category text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table(id uuid, distance_km double precision)
language sql
stable
as $$
  with bbox as (select * from public._geo_bbox_delta(p_lat, p_radius_km)),
  candidates as (
    select
      e.id,
      6371 * acos(greatest(-1, least(1,
        cos(radians(p_lat)) * cos(radians(e.latitude)) * cos(radians(e.longitude) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(e.latitude))
      ))) as distance_km
    from public.events e, bbox
    where e.latitude is not null and e.longitude is not null
      and e.latitude between p_lat - bbox.d_lat and p_lat + bbox.d_lat
      and e.longitude between p_lng - bbox.d_lng and p_lng + bbox.d_lng
      and (p_category is null or p_category = 'All' or e.category = p_category)
      and (
        not e.is_private
        or e.creator_id = p_user_id
        or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = p_user_id)
      )
  )
  select id, distance_km
  from candidates
  where distance_km <= p_radius_km
  order by distance_km asc
  limit p_limit offset p_offset;
$$;
