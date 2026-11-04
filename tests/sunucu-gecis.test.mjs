// supabase/gecis/: canlı geçiş betikleri PGlite'ta (canlıya benzer açık kova + eski politika).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kur, ATLA, pgliteIcin, ODA } from './sunucu-pglite.mjs';

const dosya = (ad) => pgliteIcin(readFileSync(new URL(`../supabase/gecis/${ad}.sql`, import.meta.url), 'utf8'));
const U = '0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab';
const YOL = `${ODA}/${U}.webp`;
const GENEL = `https://x.supabase.co/storage/v1/object/public/photos/${YOL}`;
const CANLI = `
  insert into storage.buckets (id, name, public, file_size_limit) values ('photos', 'photos', true, 5242880);
  create policy "photos_insert_anon" on storage.objects for insert to anon, authenticated with check (bucket_id = 'photos');
`;
const durum = async (q) => ({
  acik: (await q(`select public from storage.buckets where id = 'photos'`))[0].public,
  politika: (await q(`select policyname from pg_catalog.pg_policies where schemaname = 'storage'`)).map((x) => x.policyname),
});

test('kova-kapat ve kova-ac: kapanır, geri açılır, iki kez çalışır', ATLA, async () => {
  const { db, q } = await kur({ once: CANLI });
  await db.exec(dosya('kova-kapat'));
  await db.exec(dosya('kova-kapat'));
  assert.deepEqual(await durum(q), { acik: false, politika: [] });
  await db.exec(dosya('kova-ac'));
  await db.exec(dosya('kova-ac'));
  assert.deepEqual(await durum(q), { acik: true, politika: ['photos_insert_anon'] });
});

test('temizlik-baslat ve durdur: işler kurulur, kalkar; on-kontrol hata vermez ve yazmaz', ATLA, async () => {
  const { db, q } = await kur({ once: CANLI });
  await db.exec(dosya('on-kontrol'));
  await db.exec(dosya('temizlik-baslat'));
  await db.exec(dosya('temizlik-baslat'));
  const isler = async () => (await q(`select jobname from cron.job where jobname like '%temizle' order by 1`)).map((x) => x.jobname);
  assert.deepEqual(await isler(), ['biz-cop-temizle', 'biz-medya-temizle']);
  await db.exec(dosya('temizlik-durdur'));
  assert.deepEqual(await isler(), []);
  assert.doesNotMatch(readFileSync(new URL('../supabase/gecis/on-kontrol.sql', import.meta.url), 'utf8').replace(/--.*$/gm, ''),
    /\b(insert|update|delete|drop|alter|create)\b/i);
});

test('adres-tasi ve adres-geri: özgün veri yedeklenir, çevrilir, değişmeyen geri döner, değişene dokunulmaz', ATLA, async () => {
  const { db, q } = await kur({ gecis: true });
  const put = (id, d) => q(`select * from public.doc_put($1, 'ani', $2, $3::jsonb, null)`, [ODA, id, JSON.stringify(d)]);
  const data = async (id) => (await q(`select data from public.room_doc where id = $1`, [id]))[0].data;
  await put('a', { foto: GENEL });
  await put('b', { foto: GENEL });
  await db.exec(dosya('adres-tasi'));
  await db.exec(dosya('adres-tasi')); // ikinci çalışma yedeği bozmaz
  assert.deepEqual(await data('a'), { foto: `kova:${YOL}` });
  assert.deepEqual((await q(`select data from public.medya_tasima_yedek where id = 'a'`))[0].data, { foto: GENEL });
  await put('b', { foto: `kova:${YOL}`, not: 'sonradan' });
  await db.exec(dosya('adres-geri'));
  assert.deepEqual(await data('a'), { foto: GENEL });
  assert.deepEqual(await data('b'), { foto: `kova:${YOL}`, not: 'sonradan' });
});
