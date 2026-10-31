// Konum: büyük harita (iki iğne), ikinizin yeri ve aradaki mesafe, paylaşım ayarları.
// Paylaşım varsayılan kapalı; rıza kutusuyla açılır. Canlı paylaşım uygulama açıkken watchPosition ile güncellenir.
// Durdurma { kapali: true, at } yazar (paylasim.js). Saf mantık: mantik.js (tests/konum-*.test.mjs).
import { bootPage } from '../../js/core/sayfa.js';
import { openProfil } from '../../js/core/profil.js';
import { readStore, writeStore } from '../../js/core/identity.js';
import { h, toast, confirmDialog, fotoSrc, initial, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { bildir } from '../../js/core/bildirim.js';
import { isNative, disariAc } from '../../js/core/mobil.js';
import { leafletYukle, haritaKur } from '../anilar/harita.js';
import { sinirlar, VARSAYILAN_MERKEZ } from '../anilar/harita-mantik.js';
import * as M from './mantik.js';
import * as P from './paylasim.js';

const { room, roomId, me } = await bootPage({ ns: 'konum', title: 'Konum', tab: 'daha' });
const app = document.getElementById('app');
const myId = me.clientId;
// Koleksiyon sayfada tek (paylasim.js): ui.js'in açtığı canlı izleyici de aynısını kullanır.
const [profil, col] = await Promise.all([openProfil(room), P.konumKoleksiyonu(room)]);

const K_SOR = `bizim.konum.sor.${roomId}.${myId}`;
const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Simgeler (tek çizgi ailesi, ui.js ile aynı kalınlık) ----------
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const SVG = {
  hedef: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  yol: '<path d="M4.5 11.2 19.5 4.5l-6.7 15-1.9-6.4z"/>',
  zil: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  yenile: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  dur: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  canli: '<circle cx="12" cy="12" r="2.2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
  kilit: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  konum: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  pil: '<rect x="3.5" y="8" width="15" height="8" rx="2"/><path d="M21 11v2"/>',
};
const svg = (ad, cls = 'kn-svg') => h('span', { class: cls, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" ${STROKE}>${SVG[ad]}</svg>` });

const canliDuyuru = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
function duyur(metin) {
  canliDuyuru.textContent = '';
  requestAnimationFrame(() => { canliDuyuru.textContent = metin; });
}

// ---------- Kişiler ----------
function partnerId() {
  return profil.partner()?.clientId || col.all().find((d) => d.id !== myId)?.id || knownPartner(roomId)?.clientId || null;
}
function kisiler() {
  const ben = profil.ben() || {};
  const pId = partnerId();
  const p = profil.partner();
  const pAd = (p?.clientId === pId && p?.ad) || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
  return {
    ben: { kim: 'ben', id: myId, ad: ben.ad || me.name || 'Sen', foto: ben.foto || null, renk: M.renkGecerli(ben.renk), k: M.konumOku(col.get(myId)?.data) },
    onun: {
      kim: 'onun', id: pId, ad: pAd, foto: (p?.clientId === pId && p?.foto) || null,
      renk: p?.clientId === pId ? M.renkGecerli(p?.renk) : null, k: pId ? M.konumOku(col.get(pId)?.data) : null,
    },
  };
}

/** Yuvarlak yüz: baş harf, fotoğraf gelince üstüne. Renk kişi rengi (yoksa ben erik, o vurgu). */
function yuz(kisi, cls) {
  const el = h('span', {
    class: cls, dataset: { kim: kisi.kim, renkli: String(!!kisi.renk) }, style: kisi.renk ? { '--kn-renk': kisi.renk } : null,
  }, h('span', { class: 'kn-harf' }, initial(kisi.ad)));
  if (kisi.foto) {
    fotoSrc(kisi.foto).then((src) => {
      if (!src) return;
      const img = h('img', { alt: '', decoding: 'async', draggable: 'false' });
      img.addEventListener('load', () => el.classList.add('foto'), { once: true });
      img.addEventListener('error', () => img.remove(), { once: true });
      img.src = src;
      el.append(img);
    });
  }
  return el;
}

// ---------- Harita ----------
const tuval = h('div', { class: 'kn-tuval' });
const haritaDurum = h('div', { class: 'kn-harita-durum', role: 'status' }, 'Harita yükleniyor…');
const haritaBos = h('p', { class: 'kn-harita-bos', hidden: true }, 'İkiniz de paylaşınca burada buluşursunuz.');
const ortalaBtn = h('button', { type: 'button', class: 'kn-ortala', 'aria-label': 'İkinizi göster', title: 'İkinizi göster', hidden: true, onclick: () => sigdir(true) }, svg('hedef'));
const haritaEl = h('section', { class: 'kn-harita', 'aria-label': 'Harita' }, tuval, haritaDurum, haritaBos, ortalaBtn);

let L = null;
let harita = null;
let elle = false; // kullanıcı haritayı kaydırdı/yakınlaştırdı: kendiliğinden sığdırma yok
let sonKume = '';
const igneler = new Map(); // kim → { marker, daire, anahtar }
let ip = null;

function paylasanlar() {
  const { ben, onun } = kisiler();
  return [onun, ben].filter((x) => M.paylasiyor(x.k));
}

function sigdir(dugme = false) {
  if (!harita) return;
  if (dugme) {
    elle = false;
    ortalaBtn.hidden = true;
  }
  const l = paylasanlar();
  const tam = l.length && l.every((x) => x.k.hassas === 'tam');
  if (!l.length) harita.setView([VARSAYILAN_MERKEZ.lat, VARSAYILAN_MERKEZ.lng], VARSAYILAN_MERKEZ.zoom);
  else if (l.length === 1) harita.setView([l[0].k.lat, l[0].k.lng], tam ? 15 : 12);
  else harita.fitBounds(sinirlar(l.map((x) => x.k)), { padding: [64, 64], maxZoom: tam ? 16 : 13 });
}

function igneIkonu(kisi) {
  const el = h('span', {
    class: 'kn-pin',
    dataset: { kim: kisi.kim, renkli: String(!!kisi.renk), canli: String(kisi.kim === 'ben' ? M.canliAcik(kisi.k) : M.canliMi(kisi.k)) },
    style: kisi.renk ? { '--kn-renk': kisi.renk } : null,
  }, yuz(kisi, 'kn-pin-yuz'));
  return L.divIcon({ html: el, className: 'kn-pin-kap', iconSize: [48, 60], iconAnchor: [24, 58] });
}

function haritaCiz() {
  if (!harita) return;
  const l = paylasanlar();
  haritaBos.hidden = l.length > 0;
  const kume = l.map((x) => x.kim).join(',');
  const yeniKume = kume !== sonKume;
  sonKume = kume;
  for (const [kim, ig] of igneler) {
    if (l.some((x) => x.kim === kim)) continue;
    ig.marker.remove();
    ig.daire?.remove();
    igneler.delete(kim);
  }
  let disarda = false;
  for (const kisi of l) {
    const ll = [kisi.k.lat, kisi.k.lng];
    const canli = kisi.kim === 'ben' ? M.canliAcik(kisi.k) : M.canliMi(kisi.k);
    const anahtar = JSON.stringify([kisi.ad, kisi.foto, kisi.renk, canli]);
    let ig = igneler.get(kisi.kim);
    if (!ig) {
      const marker = L.marker(ll, { icon: igneIkonu(kisi), keyboard: false, interactive: false, zIndexOffset: kisi.kim === 'onun' ? 200 : 0 }).addTo(harita);
      marker.getElement()?.setAttribute('aria-hidden', 'true');
      ig = { marker, daire: null, anahtar };
      igneler.set(kisi.kim, ig);
    } else {
      if (ig.anahtar !== anahtar) {
        ig.marker.setIcon(igneIkonu(kisi));
        ig.marker.getElement()?.setAttribute('aria-hidden', 'true');
        ig.anahtar = anahtar;
      }
      const eski = ig.marker.getLatLng();
      if (eski.lat !== ll[0] || eski.lng !== ll[1]) kaydir(ig.marker, ll);
    }
    const r = kisi.k.hassas === 'tam' ? kisi.k.dogruluk : null;
    if (r) {
      if (!ig.daire) ig.daire = L.circle(ll, { radius: r, className: 'kn-daire', interactive: false }).addTo(harita);
      else ig.daire.setLatLng(ll).setRadius(r);
    } else if (ig.daire) {
      ig.daire.remove();
      ig.daire = null;
    }
    if (!harita.getBounds().pad(-0.12).contains(ll)) disarda = true;
  }
  if (l.length === 2) {
    const yol = l.map((x) => [x.k.lat, x.k.lng]);
    if (!ip) ip = L.polyline(yol, { className: 'kn-harita-ip', interactive: false }).addTo(harita);
    else ip.setLatLngs(yol);
  } else if (ip) {
    ip.remove();
    ip = null;
  }
  if (yeniKume || (disarda && !elle)) sigdir();
}

/** Konum değişince iğne yeni yerine kayar (azaltılmış harekette atlar). */
function kaydir(marker, ll) {
  const el = marker.getElement();
  if (el && !azHareket()) {
    el.classList.add('kn-kay');
    clearTimeout(el.kayZaman);
    el.kayZaman = setTimeout(() => el.classList.remove('kn-kay'), 900);
  }
  marker.setLatLng(ll);
}

async function haritaBaslat() {
  haritaDurum.hidden = false;
  haritaDurum.textContent = 'Harita yükleniyor…';
  try {
    L = await leafletYukle();
  } catch (e) {
    haritaDurum.replaceChildren(h('p', {}, e.message),
      h('button', { type: 'button', class: 'btn small', onclick: haritaBaslat }, 'Tekrar dene'));
    return;
  }
  haritaDurum.hidden = true;
  harita = haritaKur(L, tuval, { zoomControl: true });
  sigdir(); // getBounds ve iğneler için önce bir görünüm
  const elleOyna = () => { elle = true; ortalaBtn.hidden = paylasanlar().length === 0; };
  harita.on('dragstart', elleOyna);
  tuval.addEventListener('wheel', elleOyna, { passive: true });
  tuval.addEventListener('touchstart', (e) => { if (e.touches.length > 1) elleOyna(); }, { passive: true });
  tuval.querySelector('.leaflet-control-zoom')?.addEventListener('click', elleOyna);
  haritaCiz();
  requestAnimationFrame(() => harita?.invalidateSize());
}

// ---------- İkimiz: iki kişi ve aradaki mesafe ----------
const onunKart = h('article', { class: 'kn-kisi', 'aria-label': 'Sevgilin' });
const araEl = h('div', { class: 'kn-ara' });
const benimKart = h('article', { class: 'kn-kisi', 'aria-label': 'Sen' });
const eylemEl = h('div', { class: 'kn-eylem' });
const ikimizEl = h('section', { class: 'kn-ikimiz', 'aria-label': 'Neredeyiz' }, onunKart, araEl, benimKart, eylemEl);

function kisiCiz(el, kisi, { pVar = true } = {}) {
  const k = kisi.k;
  const acik = M.paylasiyor(k);
  const canli = acik && (kisi.kim === 'ben' ? M.canliAcik(k) : M.canliMi(k));
  const ad = kisi.kim === 'ben' ? 'Sen' : kisi.ad;
  let yer;
  if (!pVar) yer = 'Sevgilin henüz gelmedi';
  else if (!acik) yer = kisi.kim === 'ben' ? 'Paylaşımın kapalı' : 'Konumunu paylaşmıyor';
  else yer = k.yer || (k.hassas === 'tam' ? 'Tam konum' : 'Yaklaşık konum');
  const meta = acik ? [M.tazelikMetni(k.at), M.pilMetni(k)].filter(Boolean) : [];
  el.dataset.kim = kisi.kim;
  el.dataset.acik = String(acik);
  el.setAttribute('aria-label', kisi.kim === 'ben' ? 'Sen' : kisi.ad);
  el.replaceChildren(
    yuz(kisi, 'kn-yuz'),
    h('div', { class: 'kn-kisi-govde' },
      h('p', { class: 'kn-kisi-bas' },
        h('span', { class: 'kn-ad' }, ad),
        canli ? h('span', { class: 'kn-canli' }, h('span', { class: 'kn-canli-nokta', 'aria-hidden': 'true' }), 'canlı') : null,
        acik ? h('span', { class: 'chip', dataset: { hassas: k.hassas } }, k.hassas === 'tam' ? 'tam' : 'yaklaşık') : null),
      h('p', { class: 'kn-yer', dataset: { bos: String(!acik || !k.yer) } }, yer),
      meta.length ? h('p', { class: 'kn-meta' },
        h('span', {}, meta[0]),
        meta[1] ? h('span', { class: 'kn-pil', dataset: { sarj: String(!!k.sarj) } }, svg('pil'), meta[1]) : null) : null));
}

function araCiz(ben, onun) {
  const ikisi = M.paylasiyor(ben.k) && M.paylasiyor(onun.k);
  const m = ikisi ? M.mesafeYazi(M.mesafeKm(ben.k, onun.k), { tam: ben.k.hassas === 'tam' && onun.k.hassas === 'tam' }) : null;
  araEl.dataset.durum = !m ? 'yok' : m.yakin ? 'yakin' : 'uzak';
  araEl.replaceChildren(h('span', { class: 'kn-ip', 'aria-hidden': 'true' }),
    !m ? h('p', { class: 'kn-ara-yok' }, onun.id ? 'Mesafe için ikinizin de paylaşması gerek.' : 'Sevgilin gelince mesafenizi görürsünüz.')
      : m.yakin ? h('p', { class: 'kn-ara-metin' }, h('span', { class: 'kn-ara-deger' }, m.metin))
        : h('p', { class: 'kn-ara-metin', 'aria-label': m.metin },
          h('span', { class: 'kn-ara-ust' }, 'Aranızda'),
          h('span', { class: 'kn-ara-deger' }, m.sayi, h('small', {}, ` ${m.birim}`))));
}

// Konumunu sor (10 dakikada bir) ve yol tarifi (sevgilin tam paylaşıyorsa).
function sorKalan() {
  return M.sorBekleme(readStore('local', K_SOR), Date.now());
}
function eylemCiz(ben, onun) {
  const url = M.yolTarifiUrl(onun.k);
  const kalan = sorKalan();
  const dk = Math.ceil(kalan / 60000);
  eylemEl.hidden = !onun.id;
  eylemEl.replaceChildren(...[
    url ? h('button', { type: 'button', class: 'btn', onclick: () => yolTarifi(url) }, svg('yol'), 'Yol tarifi') : null,
    h('button', {
      type: 'button', class: 'btn', disabled: kalan > 0, 'aria-describedby': kalan ? 'kn-sor-not' : null, onclick: sor,
    }, svg('zil'), 'Konumunu sor'),
    kalan ? h('p', { class: 'kn-yardim', id: 'kn-sor-not' }, `Sordun. ${dk} dk sonra yeniden sorabilirsin.`) : null,
  ].filter(Boolean));
}

async function yolTarifi(url) {
  sfx('tap');
  await disariAc(url, { git: (u) => { if (!window.open(u, '_blank', 'noopener')) location.href = u; } });
}

function sor() {
  if (sorKalan() > 0) return;
  writeStore('local', K_SOR, new Date().toISOString());
  const benAd = profil.ben()?.ad || me.name || '';
  const b = M.sorBildirimi(benAd);
  Promise.resolve(bildir(roomId, { tur: 'dokunus', baslik: b.baslik, metin: b.metin, url: 'sayfalar/konum/' })).catch(() => {});
  try { room.sendAll({ t: 'konumsor', metin: b.metin }); } catch { /* bildirim yine gider */ }
  sfx('pop');
  toast('Sordun 📍 Haber gitti.');
  ciz();
}

// Sevgilim sorduysa ve bu sayfa açıksa: kısa not.
room.on?.('message', (msg) => {
  if (msg?.t !== 'konumsor') return;
  const k = M.konumOku(col.get(myId)?.data);
  toast(M.paylasiyor(k) ? `${M.sorBildirimi(kisiler().onun.ad).metin}` : `${kisiler().onun.ad} konumunu merak ediyor. Paylaşmak ister misin?`);
});

// ---------- Senin paylaşımın ----------
const paylasimEl = h('section', { class: 'kn-paylasim', 'aria-labelledby': 'kn-paylasim-h' });
let mesgul = null; // 'paylas' | 'guncelle' | 'canli' | 'hassas' | null
let sorun = null; // konumRehberi sonucu (+ denendi)
let secHassas = 'yaklasik';
let secSure = M.CANLI_SURELER[0].id;
let paylasimAnahtar = '';

const guvenliMi = () => globalThis.isSecureContext !== false;
const rehber = (tur) => M.konumRehberi(tur, {
  platform: M.konumPlatformu({ native: isNative(), ua: navigator.userAgent, dokunmatik: navigator.maxTouchPoints || 0 }),
  guvenli: guvenliMi(),
});
if (!guvenliMi()) sorun = rehber('izin'); // http:// adreste not hep görünür

let izinNesnesi; // PermissionStatus | null
async function izinIzle() {
  try {
    izinNesnesi = (await navigator.permissions?.query({ name: 'geolocation' })) || null;
    // İzin ayarlardan açılıp dönülünce yol gösteren kutu kendiliğinden kalkar.
    izinNesnesi?.addEventListener?.('change', izinDegisti);
  } catch {
    izinNesnesi = null;
  }
}
function izinDegisti() {
  const st = izinNesnesi?.state;
  if (st && st !== 'denied' && sorun?.tur === 'izin') {
    sorun = null;
    ciz();
  }
}

function sorunGoster(r) {
  sorun = { ...r, denendi: true };
  ciz();
  duyur(`${r.baslik}. ${r.metin}`);
  document.getElementById('kn-sorun-h')?.focus();
}

function sorunKutusu() {
  const r = sorun;
  if (!r) return null;
  return h('div', { class: 'kn-sorun', dataset: { tur: r.tur } },
    svg(r.tur === 'guvensiz' ? 'kilit' : 'konum', 'kn-sorun-ikon'),
    h('div', { class: 'kn-sorun-metin' },
      h('h3', { class: 'kn-sorun-baslik', id: 'kn-sorun-h', tabindex: '-1' }, r.baslik),
      h('p', {}, r.metin),
      r.adimlar.length ? h('ol', { class: 'kn-adimlar' }, r.adimlar.map((a) => h('li', {}, a))) : null,
      r.not ? h('p', { class: 'kn-yardim' }, r.not) : null));
}

/** Konumu alıp yazar. Hata olursa yol gösteren kutu. -> başarılı mı */
async function al(hassas, { canli = null, ne }) {
  if (!guvenliMi()) {
    sorunGoster(rehber('izin'));
    return false;
  }
  if (!navigator.geolocation) {
    toast('Bu cihaz konum vermiyor.');
    return false;
  }
  mesgul = ne;
  ciz();
  let r = null;
  let ok = false;
  try {
    if ((await P.izinDurumu()) === 'denied') {
      r = rehber('izin');
    } else {
      const pos = await P.konumAl(hassas);
      await P.konumYaz(col, myId, pos, { hassas, canli });
      if (sorun?.tur !== 'guvensiz') sorun = null;
      ok = true;
    }
  } catch (e) {
    const tur = M.konumHataTuru(e);
    if (tur === 'diger') toast(e?.message || 'Konum alınamadı. Biraz sonra tekrar dener misin?');
    else r = rehber(tur);
  } finally {
    mesgul = null;
    ciz();
  }
  if (r) sorunGoster(r);
  return ok;
}

async function paylas() {
  if (await al(secHassas, { ne: 'paylas' })) {
    sfx('pop');
    toast(secHassas === 'tam' ? 'Tam konumun paylaşıldı' : 'Yaklaşık konumun paylaşıldı');
  }
}

async function guncelle() {
  const k = M.konumOku(col.get(myId)?.data);
  if (await al(k?.hassas || 'yaklasik', { canli: M.canliAcik(k) ? k.canli : null, ne: 'guncelle' })) toast('Konumun güncellendi');
}

async function canliBaslat() {
  const k = M.konumOku(col.get(myId)?.data);
  const sure = M.CANLI_SURELER.find((s) => s.id === secSure) || M.CANLI_SURELER[0];
  if (await al(k?.hassas || 'yaklasik', { canli: M.canliBitis(sure.id), ne: 'canli' })) {
    sfx('pop');
    toast(sure.ms ? `Canlı paylaşım açık: ${sure.ad}` : 'Canlı paylaşım açık. Sen kapatana dek sürer.');
  }
}

async function canliBitir() {
  mesgul = 'canli';
  ciz();
  try {
    await P.canliKapat(col, myId);
    toast('Canlı paylaşım bitti. Son konumun duruyor.');
  } catch (e) {
    toast(e?.message || 'Kaydedilemedi. Tekrar dener misin?');
  } finally {
    mesgul = null;
    ciz();
  }
}

async function hassasSec(yeni) {
  const k = M.konumOku(col.get(myId)?.data);
  if (!M.paylasiyor(k)) {
    secHassas = yeni;
    ciz();
    if (yeni === 'tam') duyur('Tam konumda sevgilin bulunduğun sokağı görür.');
    return;
  }
  if (k.hassas === yeni || mesgul) return;
  if (yeni === 'tam' && !(await confirmDialog('Tam konumda sevgilin seni ≈10 m yakınlıkla görür ve yol tarifi alabilir. Açalım mı?', { ok: 'Tam paylaş' }))) return;
  if (await al(yeni, { canli: M.canliAcik(k) ? k.canli : null, ne: 'hassas' })) {
    toast(yeni === 'tam' ? 'Artık tam konumun paylaşılıyor' : 'Artık yaklaşık konumun paylaşılıyor');
  }
}

async function durdur() {
  mesgul = 'durdur';
  ciz();
  try {
    await P.paylasimiDurdur(col, myId);
    if (sorun?.tur !== 'guvensiz') sorun = null;
    toast('Paylaşım durdu. Konumun sunucudan kaldırıldı.');
    secHassas = 'yaklasik';
  } catch (e) {
    toast(e?.message || 'Kaydedilemedi. Tekrar dener misin?');
  } finally {
    mesgul = null;
    ciz();
  }
  document.getElementById('kn-paylasim-h')?.focus();
}

/** Segment seçici (aria-pressed). */
function seg(id, secenekler, secili, onSec, { disabled = false } = {}) {
  return h('div', { class: 'seg kn-seg', role: 'group', 'aria-labelledby': id },
    secenekler.map((s) => h('button', {
      type: 'button', 'aria-pressed': String(s.id === secili), disabled, dataset: { odak: `${id}-${s.id}` },
      onclick: () => { if (s.id !== secili) onSec(s.id); },
    }, h('span', { class: 'kn-seg-ad' }, s.ad), s.ipucu ? h('span', { class: 'kn-seg-ipucu' }, s.ipucu) : null)));
}

const yukleniyor = (ne, metin, bos) => (mesgul === ne ? metin : bos);
const mesgulOzellik = (ne) => ({ disabled: !!mesgul, 'aria-busy': mesgul === ne ? 'true' : null });

const kalanEl = h('span', { class: 'kn-canli-kalan' });

function paylasimCiz(ben) {
  const k = ben.k;
  const acik = M.paylasiyor(k);
  const canli = acik && M.canliAcik(k);
  kalanEl.textContent = canli ? M.canliKalanMetni(k) : '';
  const anahtar = JSON.stringify([acik, k?.hassas, canli, k?.canli, mesgul, sorun?.tur, sorun?.denendi, secHassas, secSure]);
  if (anahtar === paylasimAnahtar) return;
  const odak = paylasimEl.contains(document.activeElement) ? document.activeElement?.dataset?.odak : null;
  paylasimAnahtar = anahtar;
  const tekrar = (bos) => (sorun?.denendi && sorun.tur !== 'guvensiz' ? 'Tekrar dene' : bos);

  if (!acik) {
    paylasimEl.dataset.durum = 'kapali';
    paylasimEl.replaceChildren(...[
      h('h2', { id: 'kn-paylasim-h', tabindex: '-1' }, 'Konumunu paylaş'),
      h('ul', { class: 'kn-riza' },
        h('li', {}, 'Konumun yalnız sevgilinle paylaşılır; başka kimse görmez.'),
        h('li', {}, 'Uygulama açıkken güncellenir. Kapalıyken takip yok.'),
        h('li', {}, '“Paylaşımı durdur” dediğin an konumun sunucudan kalkar.')),
      h('div', { class: 'kn-alan' },
        h('p', { class: 'kn-etiket', id: 'kn-hassas-e' }, 'Ne kadar yakından görsün?'),
        seg('kn-hassas-e', M.HASSASLIKLAR, secHassas, hassasSec),
        secHassas === 'tam'
          ? h('p', { class: 'kn-uyari' }, 'Tam konumda sevgilin bulunduğun sokağı görür ve sana yol tarifi alabilir.')
          : h('p', { class: 'kn-yardim' }, 'Yaklaşıkta yalnız semtin görünür (≈1 km).')),
      sorunKutusu(),
      h('button', { type: 'button', class: 'btn primary wide', dataset: { odak: 'paylas' }, onclick: paylas, ...mesgulOzellik('paylas') },
        svg('konum'), yukleniyor('paylas', 'Konum alınıyor…', tekrar('Kabul ediyorum, paylaş'))),
    ].filter(Boolean));
  } else {
    paylasimEl.dataset.durum = canli ? 'canli' : 'acik';
    const canliKutu = canli
      ? h('div', { class: 'kn-canli-kutu', role: 'status' },
        h('span', { class: 'kn-canli-simge' }, svg('canli')),
        h('div', { class: 'kn-canli-metin' }, h('p', { class: 'kn-canli-baslik' }, 'Canlı paylaşım açık'), kalanEl),
        h('button', { type: 'button', class: 'btn small', dataset: { odak: 'canli-bitir' }, onclick: canliBitir, ...mesgulOzellik('canli') }, 'Bitir'))
      : h('div', { class: 'kn-alan' },
        h('p', { class: 'kn-etiket', id: 'kn-sure-e' }, 'Canlı paylaş'),
        seg('kn-sure-e', M.CANLI_SURELER, secSure, (id) => { secSure = id; ciz(); }, { disabled: !!mesgul }),
        h('button', { type: 'button', class: 'btn primary wide', dataset: { odak: 'canli' }, onclick: canliBaslat, ...mesgulOzellik('canli') },
          svg('canli'), yukleniyor('canli', 'Konum alınıyor…', 'Canlı paylaş')));
    paylasimEl.replaceChildren(...[
      h('div', { class: 'kn-paylasim-bas' },
        h('h2', { id: 'kn-paylasim-h', tabindex: '-1' }, 'Senin paylaşımın'),
        h('span', { class: 'chip accent' }, M.durumEtiketi(k))),
      h('div', { class: 'kn-alan' },
        h('p', { class: 'kn-etiket', id: 'kn-hassas-e' }, 'Ne kadar yakından görsün?'),
        seg('kn-hassas-e', M.HASSASLIKLAR, mesgul === 'hassas' ? null : k.hassas, hassasSec, { disabled: !!mesgul })),
      canliKutu,
      h('p', { class: 'kn-yardim' }, 'Uygulama açıkken güncellenir. Kapalıyken takip yok.'),
      sorunKutusu(),
      h('div', { class: 'kn-dugmeler' },
        h('button', { type: 'button', class: 'btn', dataset: { odak: 'guncelle' }, onclick: guncelle, ...mesgulOzellik('guncelle') },
          svg('yenile'), yukleniyor('guncelle', 'Konum alınıyor…', tekrar('Konumumu güncelle'))),
        h('button', { type: 'button', class: 'btn danger', dataset: { odak: 'durdur' }, onclick: durdur, ...mesgulOzellik('durdur') },
          svg('dur'), 'Paylaşımı durdur')),
    ].filter(Boolean));
  }
  if (odak) paylasimEl.querySelector(`[data-odak="${odak}"]`)?.focus({ preventScroll: true });
}

// ---------- Çizim ----------
let ikimizAnahtar = '';
function ciz() {
  const { ben, onun } = kisiler();
  const dk = Math.floor(Date.now() / 30000);
  const a = JSON.stringify([ben, onun, dk, sorKalan() > 0]);
  if (a !== ikimizAnahtar) {
    ikimizAnahtar = a;
    kisiCiz(onunKart, onun, { pVar: !!onun.id });
    araCiz(ben, onun);
    kisiCiz(benimKart, ben);
    eylemCiz(ben, onun);
  }
  paylasimCiz(ben);
  haritaCiz();
}

app.replaceChildren(h('div', { class: 'kn' },
  h('h1', { class: 'sr-only' }, 'Konum'),
  canliDuyuru,
  haritaEl,
  ikimizEl,
  paylasimEl,
  h('p', { class: 'kn-not' }, svg('kilit'), 'Konumun yalnız ikinizin odasında durur. Paylaşım uygulama açıkken güncellenir; uygulama kapalıyken takip yok.')));

col.on('change', ciz);
col.on('error', (e) => { if (mesgul) toast(e?.message || 'Kaydedilemedi. Bağlantını kontrol et.'); });
profil.on('change', ciz);
ciz();
haritaBaslat();
izinIzle();

// Canlı izleme (tek izleyici; ui.js canlıyken her sayfada açar) ve açılışta bir kez tazeleme (izin sorulmaz).
P.canliServis(room, {
  onHata: (e) => { if (M.konumHataTuru(e) === 'izin' && sorun?.tur !== 'izin') sorunGoster(rehber('izin')); },
});
P.acilistaGuncelle(col, room, myId);

setInterval(() => { if (document.visibilityState === 'visible') ciz(); }, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  izinDegisti(); // izin değişim olayı gelmeyen tarayıcılar için
  ciz();
});
