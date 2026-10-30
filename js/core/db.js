// Oyun kaydı ve istatistik. Oda kimliği = çift kimliği.
// Supabase: RPC (supabase/schema.sql). Yerel mod: localStorage 'bizim.log.<oda>'.
// Cihaz üyeliği: RPC'lere kimlik eklenir; 42501 → yetkiKaybedildi (kapı ekranı).
import { isLocalMode, readStore, writeStore } from './identity.js';
import { getSupabase } from './room.js';
import { kimlik, yetkiKaybedildi, yetkiHatasiMi } from './uyelik.js';

const LOG_MAX = 500;
const logKey = (roomId) => 'bizim.log.' + roomId;

function readLog(roomId) {
  try {
    const v = JSON.parse(readStore('local', logKey(roomId)) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Saf: [{ game, at }] → [{ game, played, last_at }], en son oynanan önce. */
export function aggregateLog(entries) {
  const byGame = new Map();
  for (const e of entries || []) {
    if (!e || typeof e.game !== 'string') continue;
    const s = byGame.get(e.game) || { game: e.game, played: 0, last_at: null };
    s.played += 1;
    if (!s.last_at || String(e.at) > s.last_at) s.last_at = String(e.at);
    byGame.set(e.game, s);
  }
  return [...byGame.values()].sort((a, b) => (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0));
}

/** Sessizce dener; asla hata fırlatmaz. Oda yoksa bir şey yapmaz. */
export async function logGame(roomId, gameId, result) {
  if (!roomId || !gameId) return;
  try {
    if (isLocalMode()) {
      const log = readLog(roomId);
      log.push({ game: String(gameId), result: result ?? null, at: new Date().toISOString() });
      writeStore('local', logKey(roomId), JSON.stringify(log.slice(-LOG_MAX)));
      return;
    }
    const client = await getSupabase();
    const k = kimlik(roomId);
    const { error } = await client.rpc('log_game', { p_room: roomId, p_game: gameId, p_result: result ?? null, ...k });
    if (error) {
      if (yetkiHatasiMi(error)) yetkiKaybedildi(roomId, { kimlikli: !!k.p_cihaz });
      console.warn('[db] logGame:', error.message || error);
    }
  } catch (e) {
    console.warn('[db] logGame:', e?.message || e);
  }
}

/** → [{ game, played, last_at }]. Oda yoksa ya da hata olursa []. */
export async function roomStats(roomId) {
  if (!roomId) return [];
  if (isLocalMode()) return aggregateLog(readLog(roomId));
  try {
    const client = await getSupabase();
    const k = kimlik(roomId);
    const { data, error } = await client.rpc('room_stats', { p_room: roomId, ...k });
    if (error) {
      if (yetkiHatasiMi(error)) yetkiKaybedildi(roomId, { kimlikli: !!k.p_cihaz });
      throw error;
    }
    return (data || []).map((r) => ({ game: String(r.game), played: Number(r.played) || 0, last_at: r.last_at }));
  } catch (e) {
    console.warn('[db] roomStats:', e?.message || e);
    return [];
  }
}

/** Sunucu ayakta mı? Yerel modda her zaman true. */
export async function ping() {
  if (isLocalMode()) return true;
  try {
    const client = await getSupabase();
    const { data, error } = await client.rpc('ping');
    return !error && data === 'ok';
  } catch {
    return false;
  }
}
