// supabase/schema.sql'in tamamını PGlite ile (gerçek Postgres, bellekte) iki kez kurar.
// sunucu-sql ve sunucu-uyelik testleri paylaşır. Supabase'e özgü şemalar (cron, net, vault, storage) taklit edilir.
// PGlite proje bağımlılığı değil: yoksa testler atlanır. Yol: PGLITE_YOLU ya da geliştirme makinesindeki kurulum.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PGLITE = process.env.PGLITE_YOLU
  || 'C:/Users/koseo/AppData/Local/Temp/pw/node_modules/@electric-sql/pglite/dist/index.js';
export const pgliteVar = existsSync(PGLITE);
export const ATLA = { skip: !pgliteVar && 'PGlite yok' };

// Dosyanın tamamı, SQL Editor'deki gibi baştan sona. PGlite'ta olmayanlar çıkarılır: eklentiler (pg_cron, pg_net
// aşağıda taklit edilir) ve PostgREST bildirimi.
const SQL = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  .replace(/^create extension .*$/gm, '')
  .replace(/^notify pgrst.*$/gm, '');

export const ODA = 'abcdefgh23';
export const ODA2 = 'zzzzzzzz22';
export const ab = (n, host = 'fcm.googleapis.com/fcm/send') => ({
  endpoint: `https://${host}/uc-${n}`,
  expirationTime: null,
  keys: { p256dh: 'B' + 'x'.repeat(86), auth: 'y'.repeat(22) },
});

/** once: şemadan önce çalışacak SQL (ör. canlıdaki eski fonksiyon imzaları). */
export async function kur({ once = '' } = {}) {
  const { PGlite } = await import(pathToFileURL(PGLITE).href);
  const db = new PGlite();
  // Supabase gibi: roller ve public şemada varsayılan yetkiler (anon'a da execute/tablo yetkisi verir).
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema cron;
    create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
    create function cron.schedule(p_ad text, p_zaman text, p_komut text) returns bigint language sql as $$
      insert into cron.job (jobname, schedule, command) values (p_ad, p_zaman, p_komut)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
      returning jobid $$;
    create schema net;
    create table net.istek (id serial primary key, url text, body jsonb, headers jsonb, zaman int);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
      headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$
      insert into net.istek (url, body, headers, zaman) values (url, body, headers, timeout_milliseconds) returning id $$;
    create schema vault;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint,
      allowed_mime_types text[]);
    create table storage.objects (id serial primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  if (once) await db.exec(once);
  // İki kez: ilk kurulum ve tekrar çalıştırma (idempotent) aynı sonucu vermeli.
  await db.exec(SQL);
  await db.exec(SQL);
  const q = async (s, p) => (await db.query(s, p)).rows;
  const hata = async (s, p) => {
    try { await db.query(s, p); } catch (e) { return e; }
    assert.fail(`hata bekleniyordu: ${s}`);
  };
  return { db, q, hata };
}
