-- Account deletion, required by App Store Guideline 5.1.1(v) / Play Console
-- for any app that supports account creation. Deletes the auth login and
-- all personal data outright; content other users are actively engaged
-- with (a business with followers, a forum thread with replies) is
-- reattributed to a shared "Deleted User" placeholder rather than deleted
-- out from under them.

-- Fixed sentinel id for the placeholder. Not a real login — banned
-- indefinitely (banned_until = infinity) purely so it satisfies the
-- public.users -> auth.users foreign key.
-- public.users.username is NOT NULL, and a trigger (handle_new_user) auto-
-- inserts a public.users row from raw_user_meta_data->>'username' on every
-- auth.users insert — so that key has to be set here, or the trigger's own
-- insert fails and rolls back this whole insert too.
do $$
declare
  placeholder_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  if not exists (select 1 from auth.users where id = placeholder_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, banned_until, confirmation_token,
      recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      placeholder_id,
      'authenticated',
      'authenticated',
      'deleted-user@sizana.internal',
      extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"username":"Deleted User"}'::jsonb,
      now(), now(),
      'infinity',
      '', '', '', ''
    );
  end if;

  -- handle_new_user doesn't set bio/is_verified — fill those in separately.
  update public.users
  set bio = 'This account has been deleted.', is_verified = false
  where id = placeholder_id;
end $$;

-- SECURITY DEFINER so it can bypass RLS to clean up across every table a
-- user's content touches — but target_id comes only from auth.uid(), never
-- a parameter, so a caller can only ever delete their own account.
-- search_path is pinned per Postgres's SECURITY DEFINER hardening guidance
-- (an unpinned search_path lets a caller shadow objects to hijack behavior).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid := auth.uid();
  placeholder_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  if target_id is null then
    raise exception 'Not authenticated';
  end if;
  if target_id = placeholder_id then
    raise exception 'Cannot delete the placeholder account';
  end if;

  -- Public-facing content other users are engaged with (followers, RSVPs,
  -- replies) — reattributed, not deleted.
  update public.businesses set creator_id = placeholder_id where creator_id = target_id;
  update public.events set creator_id = placeholder_id where creator_id = target_id;
  update public.forum_posts set author_id = placeholder_id where author_id = target_id;
  update public.forum_comments set author_id = placeholder_id where author_id = target_id;
  update public.market_items set seller_id = placeholder_id where seller_id = target_id;
  update public.listings set seller_id = placeholder_id where seller_id = target_id;
  update public.clubs set owner_id = placeholder_id where owner_id = target_id;
  update public.posts set author_id = placeholder_id where author_id = target_id;

  -- Personal data with no cascade path — deleted outright.
  delete from public.messages where sender_id = target_id or receiver_id = target_id;
  delete from public.reports where reporter_id = target_id;

  -- Deletes the profile row, cascading (via existing ON DELETE CASCADE) to
  -- business_roles, event_rsvps, forum_comment_likes, forum_follows,
  -- forum_likes, notifications, user_followers, user_friends,
  -- user_reviews, push_tokens, business_followers.
  delete from public.users where id = target_id;

  -- Removes the login itself, cascading (via existing ON DELETE CASCADE)
  -- to auth.identities, auth.sessions, auth.mfa_factors, etc.
  delete from auth.users where id = target_id;
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
