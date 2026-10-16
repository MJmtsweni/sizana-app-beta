-- Google / Apple sign-in support.
--
-- public.users.username is NOT NULL, and handle_new_user copies it from
-- raw_user_meta_data->>'username' on every auth.users insert. Email sign-up
-- always sets that key; Google and Apple don't (they send full_name / name /
-- email instead), so a first social sign-in would fail with "Database error
-- saving new user" and roll back.
--
-- Rather than rewrite handle_new_user, this BEFORE INSERT trigger fills in a
-- username in the metadata before handle_new_user ever sees the row. It only
-- acts when username is missing, so email sign-ups are untouched. The user
-- confirms or changes the generated name on CompleteProfileScreen.

create or replace function public.default_username_from_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  candidate text;
begin
  if nullif(btrim(meta->>'username'), '') is not null then
    return new;
  end if;

  candidate := coalesce(
    nullif(btrim(meta->>'full_name'), ''),
    nullif(btrim(meta->>'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Sizana User'
  );
  candidate := left(candidate, 30);

  -- Avoid handing two people the same display name.
  if exists (select 1 from public.users where lower(username) = lower(candidate)) then
    candidate := left(candidate, 25) || floor(random() * 9000 + 1000)::int::text;
  end if;

  new.raw_user_meta_data := meta || jsonb_build_object('username', candidate);
  return new;
end;
$$;

drop trigger if exists before_auth_user_insert_default_username on auth.users;
create trigger before_auth_user_insert_default_username
  before insert on auth.users
  for each row execute function public.default_username_from_identity();
