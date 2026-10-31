// Oyunlarımız sayfası ve ana sayfa önerileri: saf mantık (DOM yok, Node'da test edilir).
import { daysBetween, parseDay } from '../../js/core/gunler.js';

/** Grup sırası ve adları. ton = base.css --tint-N (grup rengi). */
export const GRUPLAR = [
  { id: 'tanisalim', ad: 'Tanışalım', ton: '1' },
  { id: 'masa', ad: 'Masa oyunları', ton: '5' },
  { id: 'zeka', ad: 'Kelime ve zekâ', ton: '6' },
  { id: 'yarat', ad: 'Birlikte yarat', ton: '4' },
];
export const DIGER = { id: 'diger', ad: 'Diğer', ton: '2' };

/** Grup üyeliği: tek harita (oyun id → grup id). Grup içi sıra = buradaki sıra. Haritada olmayan oyun "Diğer"e düşer. */
export const OYUN_GRUBU = {
  tanis: 'tanisalim', aynikafa: 'tanisalim', kimdaha: 'tanisalim', hicyaptin: 'tanisalim', derin: 'tanisalim', dogruluk: 'tanisalim',
  dama: 'masa', tavla: 'masa', satranc: 'masa', dorttas: 'masa', amiral: 'masa', pisti: 'masa',
  kelime: 'zeka', duello: 'zeka', sudoku: 'zeka', hafiza: 'zeka',
  yapboz: 'yarat', ciz: 'yarat',
};

const grupOf = (id) => GRUPLAR.find((g) => g.id === OYUN_GRUBU[id]) || DIGER;

/** -> [{ id, ad, ton, oyunlar: [game] }]. Boş grup çıkmaz; "Diğer" en sonda. */
export function grupla(games) {
  const list = games || [];
  const byId = new Map(list.map((g) => [g.id, g]));
  const out = GRUPLAR.map((gr) => ({
    ...gr,
    oyunlar: Object.keys(OYUN_GRUBU).filter((id) => OYUN_GRUBU[id] === gr.id && byId.has(id)).map((id) => byId.get(id)),
  }));
  out.push({ ...DIGER, oyunlar: list.filter((g) => grupOf(g.id) === DIGER) });
  return out.filter((gr) => gr.oyunlar.length);
}

/** Oyunun grup rengi ('1'–'6'; .game-tile[data-tint]). */
export function grupRengi(gameId) {
  return grupOf(gameId).ton;
}

/** Kart alt satırı: "2 kişi · 10 dk". */
export function kartAlt(g) {
  return [g?.players ? `${g.players} kişi` : '', g?.minutes || ''].filter(Boolean).join(' · ');
}

/** Gruplar arasında sırayla dolaşan sabit sıra: her gün ardışık iki oyun farklı gruptan gelir. */
export function gunlukSira(games) {
  const gruplar = grupla(games).map((gr) => gr.oyunlar);
  const out = [];
  for (let i = 0; out.length < (games || []).length; i++) {
    for (const oyunlar of gruplar) if (oyunlar[i]) out.push(oyunlar[i]);
  }
  return out;
}

const GUN0 = '2026-01-01';

/**
 * Ana sayfada önerilen oyunlar: son oynanan (varsa) + günlük dönen oyunlar, en çok n.
 * Günlük seçim tarihe göre kararlıdır: her gün sıra iki adım ilerler.
 */
export function onerilenler(games, { bugun, son = null, n = 3 } = {}) {
  const sira = gunlukSira(games);
  const L = sira.length;
  if (!L) return [];
  const out = [];
  const sonOyun = son ? sira.find((g) => g.id === son) || null : null;
  if (sonOyun) out.push(sonOyun);
  const gun = parseDay(bugun) ? daysBetween(GUN0, bugun) : 0;
  const bas = (((gun * 2) % L) + L) % L;
  for (let i = 0; i < L && out.length < n; i++) {
    const g = sira[(bas + i) % L];
    if (g !== sonOyun) out.push(g);
  }
  return out;
}

/**
 * Oyun açma kararı (ana sayfa ve Oyunlarımız aynı kuralı izler).
 * Sevgilin zaten o oyundaysa onun ev sahibine katıl; değilse ev sahibi ol ve 'go' ile haber ver.
 * -> { solo, host, gonder }
 */
export function acilisPlani(gameId, { roomId = null, partner = null, benId = null } = {}) {
  if (!roomId) return { solo: true, host: null, gonder: false };
  if (partner && partner.page === gameId) return { solo: false, host: partner.host || partner.clientId, gonder: false };
  return { solo: false, host: benId, gonder: true };
}
