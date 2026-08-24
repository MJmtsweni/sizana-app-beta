-- Lets a 'business_inquiry' / 'market_inquiry' notification carry which
-- business or listing it was about, so re-opening it later (from the
-- notification center, or a future push tap) can deep-link straight into
-- that conversation with the right context instead of just the inbox list.
-- ON DELETE SET NULL: if the business/listing is later removed, old
-- notification rows should keep existing rather than being deleted too.
alter table public.notifications
  add column if not exists business_id uuid references public.businesses(id) on delete set null,
  add column if not exists item_id uuid references public.market_items(id) on delete set null;

create index if not exists notifications_business_id_idx on public.notifications(business_id);
create index if not exists notifications_item_id_idx on public.notifications(item_id);
