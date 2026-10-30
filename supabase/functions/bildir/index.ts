// Edge Function 'bildir': odadaki diğer cihazlara anlık bildirim (Web Push + Android uygulamasına FCM).
// Dağıtım: npx supabase functions deploy bildir --no-verify-jwt --project-ref blgtlflryxknyalutugw
// Secret'lar: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT; FCM_SERVICE_ACCOUNT (yoksa FCM atlanır).
// Ayrıntı: _shared/isleyici.js, _shared/fcm.js.
import { bildirIsleyici } from '../_shared/isleyici.js';

const env = (ad: string): string | undefined => Deno.env.get(ad);

Deno.serve(bildirIsleyici({ env, fetchFn: fetch }));
