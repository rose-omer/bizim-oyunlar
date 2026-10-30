// Kişi adlarına Türkçe ekler (saf). "Gül" → "Gül'de", "Gül'ün"; "Ayşe" → "Ayşe'de", "Ayşe'nin"; "Burak" → "Burak'ta".
const VOWELS = 'aeıioöuü';

function parts(name) {
  const t = String(name || '').trim();
  const low = t.toLocaleLowerCase('tr');
  const vs = low.match(/[aeıioöuü]/g);
  const v = vs ? vs[vs.length - 1] : 'e';
  return { t, v, end: low[low.length - 1] || '' };
}

/** Bulunma eki: Gül'de, Ömer'de, Burak'ta, Ayşe'de. */
export function bulunma(name) {
  const { t, v, end } = parts(name);
  if (!t) return '';
  const c = 'fstkçşhp'.includes(end) ? 't' : 'd';
  return `${t}'${c}${'eiöü'.includes(v) ? 'e' : 'a'}`;
}

/** Tamlayan eki: Ömer'in, Gül'ün, Ayşe'nin, Burak'ın, Oya'nın. */
export function tamlayan(name) {
  const { t, v, end } = parts(name);
  if (!t) return '';
  const u = { a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' }[v] || 'i';
  return VOWELS.includes(end) ? `${t}'n${u}n` : `${t}'${u}n`;
}

/** "3 saat önce" gibi kısa süre metni. */
export function agoText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} saat önce`;
  const d = Math.round(hr / 24);
  return d === 1 ? 'dün' : `${d} gün önce`;
}
