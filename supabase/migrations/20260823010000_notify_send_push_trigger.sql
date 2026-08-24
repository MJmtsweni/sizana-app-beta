-- Fires the send-push Edge Function on every new notification row, so a
-- push actually reaches the receiver's device even when the app isn't open.
-- Uses pg_net (fire-and-forget async HTTP) rather than a Dashboard-managed
-- Database Webhook, so the whole pipeline is defined in migrations instead
-- of manual UI configuration.
--
-- The bearer token below is the project's anon key — safe to commit, it's
-- the same public key already bundled into the compiled app. It grants no
-- more than any client already has; the function itself uses the service
-- role key (injected by the Edge Function runtime, never stored here) to
-- read push_tokens across users.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_send_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://hsxlozolibprewffxtmx.functions.supabase.co/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGxvem9saWJwcmV3ZmZ4dG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzkwMjIsImV4cCI6MjA5Mjg1NTAyMn0.cI-Qqj6PvUYMUGg9cYeoEwBQYWQbxywkm1KGTJIIfDc'
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

drop trigger if exists notifications_send_push on public.notifications;
create trigger notifications_send_push
  after insert on public.notifications
  for each row execute function public.notify_send_push();
