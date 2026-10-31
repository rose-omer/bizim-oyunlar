// Canlı konum her sayfada: ui.js yerel işaret kararı (saf) ve paylasim.js canlı izleyicisi (sahte konum ve koleksiyonla).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canliKonumAnahtari, canliKonumAcikMi } from '../js/core/ui.js';
import { readStore, writeStore } from '../js/core/identity.js';
import { SURESIZ } from '../sayfalar/konum/mantik.js';

const { canliIzleyici } = await import('../sayfalar/konum/paylasim.js');

test('canliKonumAnahtari: oda ve cihaza özel', () => {
  assert.equal(canliKonumAnahtari('testpaka23', 'omer-id'), 'bizim.konum.canli.testpaka23.omer-id');
  assert.notEqual(canliKonumAnahtari('a', 'x'), canliKonumAnahtari('a', 'y'));
});

test('canliKonumAcikMi: yalnız gelecekteki bitiş; yoksa hiçbir şey yüklenmez', () => {
  const simdi = Date.parse('2026-10-30T10:00:00Z');
  assert.equal(canliKonumAcikMi('2026-10-30T11:00:00Z', simdi), true);
  assert.equal(canliKonumAcikMi(SURESIZ, simdi), true);
  assert.equal(canliKonumAcikMi('2026-10-30T09:59:59Z', simdi), false);
  assert.equal(canliKonumAcikMi('2026-10-30T10:00:00Z', simdi), false);
  assert.equal(canliKonumAcikMi(null, simdi), false);
  assert.equal(canliKonumAcikMi('', simdi), false);
  assert.equal(canliKonumAcikMi('bozuk', simdi), false);
  assert.equal(canliKonumAcikMi(12345, simdi), false);
});

// ---------- Sahte ortam: navigator.geolocation, document, koleksiyon ----------
function ortam() {
  const geo = { izlemeler: new Map(), sayac: 0, temizlenen: [] };
  geo.watchPosition = (ok, hata, secenek) => { const id = ++geo.sayac; geo.izlemeler.set(id, { ok, hata, secenek }); return id; };
  geo.clearWatch = (id) => { geo.temizlenen.push(id); geo.izlemeler.delete(id); };
  geo.getCurrentPosition = () => {};
  Object.defineProperty(globalThis, 'navigator', { value: { geolocation: geo }, configurable: true, writable: true });
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  return geo;
}

function sahteKoleksiyon(baslangic) {
  const docs = new Map(Object.entries(baslangic));
  const dinleyiciler = new Set();
  const yazilan = [];
  return {
    yazilan,
    get: (id) => (docs.has(id) ? { id, data: docs.get(id) } : null),
    on: (tur, fn) => { if (tur === 'change') dinleyiciler.add(fn); return () => dinleyiciler.delete(fn); },
    refresh: async () => {},
    async put(data, id) {
      docs.set(id, data);
      yazilan.push(data);
      for (const fn of dinleyiciler) fn();
      return id;
    },
  };
}
const bekle = () => new Promise((r) => setTimeout(r, 5));

test('canliIzleyici: canlıysa tek watchPosition ve yerel işaret; kapanınca durur ve işaret silinir', async () => {
  const geo = ortam();
  const isaret = canliKonumAnahtari('odatest01', 'ben');
  writeStore('local', isaret, null);
  const canli = new Date(Date.now() + 3600e3).toISOString();
  const col = sahteKoleksiyon({ ben: { lat: 41.01, lng: 28.98, hassas: 'yaklasik', canli, at: new Date().toISOString() } });
  const dur = canliIzleyici(col, 'ben', { isaret });
  await bekle();
  assert.equal(geo.izlemeler.size, 1, 'bir izleme');
  assert.equal(readStore('local', isaret), canli, 'işaret = bitiş');
  // aynı durumda yeniden değerlendirme ikinci izleme açmaz
  await col.put({ ...col.get('ben').data }, 'ben');
  assert.equal(geo.sayac, 1);
  // durdur: koordinatsız belge → izleme kapanır, işaret silinir
  await col.put({ kapali: true, at: new Date().toISOString() }, 'ben');
  assert.equal(geo.izlemeler.size, 0);
  assert.equal(readStore('local', isaret), null);
  dur();
});

test('canliIzleyici: canlı değilse izleme yok; süresi dolmuşsa canli silinir, son konum kalır', async () => {
  const geo = ortam();
  const isaret = canliKonumAnahtari('odatest02', 'ben');
  const kapali = sahteKoleksiyon({ ben: { lat: 41.01, lng: 28.98, at: new Date().toISOString() } });
  const dur1 = canliIzleyici(kapali, 'ben', { isaret });
  await bekle();
  assert.equal(geo.sayac, 0);
  assert.equal(readStore('local', isaret), null);
  dur1();

  const eski = sahteKoleksiyon({ ben: { lat: 41.01, lng: 28.98, hassas: 'yaklasik', yer: 'Kadıköy, İstanbul', canli: new Date(Date.now() - 1000).toISOString(), at: new Date(Date.now() - 7200e3).toISOString() } });
  const dur2 = canliIzleyici(eski, 'ben', { isaret });
  await bekle();
  assert.equal(geo.sayac, 0);
  assert.equal(eski.yazilan.length, 1);
  assert.equal('canli' in eski.yazilan[0], false);
  assert.equal(eski.yazilan[0].lat, 41.01);
  assert.equal(eski.yazilan[0].yer, 'Kadıköy, İstanbul');
  dur2();
});
