-- businesses had no DELETE policy at all, so BusinessScreen.tsx's
-- "Delete Listing" action (shown only to the business's creator_id) was
-- silently RLS-denied: the delete affected 0 rows, no error surfaced, and
-- the business just reappeared after the next fetch.
create policy "Creator can delete their business"
  on public.businesses
  for delete
  using (auth.uid() = creator_id);
