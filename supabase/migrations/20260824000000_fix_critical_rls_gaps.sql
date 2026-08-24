-- Two live, exploitable RLS gaps found in the 2026-08-24 audit:
--
-- 1) conversation_list was a SECURITY DEFINER view over direct_messages with
--    no per-user filter, and anon/authenticated both had SELECT on it — so
--    anyone with the public anon key could read every user's DMs, no login
--    required. direct_messages/conversation_list are leftovers from the old
--    chat implementation (superseded by messages + InboxScreen/ThreadScreen);
--    nothing in the app queries them anymore, so we drop both outright
--    rather than try to re-scope a view nothing uses.
drop view if exists public.conversation_list;
drop table if exists public.direct_messages;

-- 2) business_roles' only INSERT policy checked nothing but
--    auth.role() = 'authenticated' — any logged-in user could insert
--    {business_id: <any business>, user_id: <self>, role: 'owner'} for a
--    business they don't own, then use that row to pass the businesses
--    UPDATE policy and business_gallery policy (both trust business_roles
--    membership), fully hijacking someone else's business. The app only
--    ever inserts this row once, immediately after creating a business
--    (see BusinessScreen.tsx), so restrict it to exactly that case:
--    the caller can only claim a role for themselves, and only if the
--    business has no role rows yet (i.e. they're the first/creator).
drop policy if exists "System assigns initial role" on public.business_roles;

create policy "Creator becomes initial owner"
  on public.business_roles
  for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.business_roles br
      where br.business_id = business_roles.business_id
    )
  );
