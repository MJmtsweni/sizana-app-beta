-- EventsScreen's Upcoming/Past tabs need a date-range filter applied
-- *inside* nearby_events, not by the client filtering an already-fetched
-- page afterward — filtering post-hydration would make pages arbitrarily
-- sparse (e.g. a page of 20 nearby events where only 3 are "Upcoming")
-- and break the has-more-pages check, which relies on a full page meaning
-- more data exists.
create or replace function public.nearby_events(
  p_lat double precision,
  p_lng double precision,
  p_user_id uuid,
  p_radius_km double precision default 100,
  p_category text default null,
  p_after timestamptz default null,
  p_before timestamptz default null,
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
      and (p_after is null or e.event_date >= p_after)
      and (p_before is null or e.event_date < p_before)
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
