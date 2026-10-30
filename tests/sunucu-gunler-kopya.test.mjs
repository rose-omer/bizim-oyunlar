// Edge Function'lar js/core/gunler.js'in kopyasını kullanır (Supabase dağıtımı yalnız supabase/functions'ı alır).
// İki dosya bayt bayt aynı olmalı. Fark varsa: cp js/core/gunler.js supabase/functions/_shared/gunler.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('supabase/functions/_shared/gunler.js = js/core/gunler.js', () => {
  const asil = readFileSync(new URL('../js/core/gunler.js', import.meta.url));
  const kopya = readFileSync(new URL('../supabase/functions/_shared/gunler.js', import.meta.url));
  assert.ok(asil.equals(kopya), 'Kopya eski. Çalıştır: cp js/core/gunler.js supabase/functions/_shared/gunler.js');
});

test('kopya kendi başına çalışır (içe aktarma yok)', async () => {
  const src = readFileSync(new URL('../supabase/functions/_shared/gunler.js', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\s/m.test(src), 'gunler.js başka modül içe aktarmamalı');
  const g = await import('../supabase/functions/_shared/gunler.js');
  assert.equal(g.daysBetween('2026-01-01', '2026-10-30'), 302);
});
