// Edge Function 'hatirlat': her gün 09:00 ve 20:00 (Türkiye) pg_cron çağırır (schema.sql 6. bölüm).
// Dağıtım: npx supabase functions deploy hatirlat --no-verify-jwt --project-ref blgtlflryxknyalutugw
// Secret'lar: VAPID_* ve HATIRLAT_ANAHTAR (vault'taki 'hatirlat_anahtar' ile aynı değer).
import { hatirlatIsleyici } from '../_shared/isleyici.js';

const env = (ad: string): string | undefined => Deno.env.get(ad);

Deno.serve(hatirlatIsleyici({ env, fetchFn: fetch }));
