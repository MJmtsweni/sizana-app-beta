// Edge Function: send-push
//
// Triggered by a Supabase Database Webhook on INSERT into `public.notifications`
// (configure in Dashboard -> Database -> Webhooks, or via the SQL below).
// Looks up the receiver's registered push tokens and forwards the message to
// Expo's push API, which fans it out to APNs/FCM.
//
// Required secrets (set with `supabase secrets set`):
//   SUPABASE_URL              (auto-provided in the Edge Function runtime)
//   SUPABASE_SERVICE_ROLE_KEY (auto-provided in the Edge Function runtime)
//
// Deploy:
//   supabase functions deploy send-push
//
// Wire the webhook (SQL, run once against your project):
//   select
//     net.http_post(
//       url := '<your-project-ref>.functions.supabase.co/send-push',
//       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <service-role-key>'),
//       body := jsonb_build_object('record', row_to_json(new))
//     )
//   -- attached as an AFTER INSERT trigger on public.notifications, or configured
//   -- as a Database Webhook from the Dashboard (recommended — no SQL needed there).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Mirrors the copy in src/screens/main/NotificationsScreen.tsx's
// getTypeConfig() so in-app and push notification wording stay in sync.
const TYPE_MESSAGE: Record<string, string> = {
  like: 'liked your post.',
  comment: 'commented on your discussion.',
  follow: 'started following your business.',
  rsvp: 'is attending your event.',
  message: 'sent you a message.',
  business_inquiry: 'sent your business a new inquiry.',
  market_inquiry: 'asked about your listing.',
  review: 'left a review on your business.',
  seller_review: 'rated you as a marketplace seller.',
  user_follow: 'started following you.',
  friend_request: 'sent you a friend request.',
  friend_accept: 'accepted your friend request.',
  network_post: 'published a new forum post.',
  network_event: 'created a new event.',
  network_market: 'listed a new marketplace item.',
};

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;

    if (!record?.receiver_id) {
      return json({ skipped: 'no receiver_id on record' });
    }

    const [{ data: tokens, error: tokensError }, { data: actor }] = await Promise.all([
      supabase.from('push_tokens').select('token').eq('user_id', record.receiver_id),
      record.actor_id
        ? supabase.from('users').select('username').eq('id', record.actor_id).single()
        : Promise.resolve({ data: null } as any),
    ]);

    if (tokensError) throw tokensError;
    if (!tokens || tokens.length === 0) {
      return json({ skipped: 'receiver has no registered devices' });
    }

    const actorName = actor?.username || 'Someone';
    const body = `${actorName} ${TYPE_MESSAGE[record.type] ?? 'has new activity.'}`;

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title: 'Sizana',
      body,
      sound: 'notification.wav',
      data: { notificationId: record.id, type: record.type, targetId: record.target_id },
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await res.json();
    return json(result);
  } catch (e) {
    console.error('send-push error:', e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
