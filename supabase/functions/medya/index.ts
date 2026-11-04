// Edge Function 'medya': imzalı okuma adresi, cihaz yetkili yükleme, silme kuyruğu. Ayrıntı: _shared/medya.js.
// Dağıtım: npx supabase functions deploy medya --no-verify-jwt --project-ref blgtlflryxknyalutugw
// Secret gerekmez: SUPABASE_URL ve servis anahtarı Supabase'in kendi ortamından gelir.
import { medyaIsleyici } from '../_shared/medya.js';

const env = (ad: string): string | undefined => Deno.env.get(ad);

Deno.serve(medyaIsleyici({ env, fetchFn: fetch }));
