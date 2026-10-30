// Anı haritası: Leaflet 1.9.4 (vendor/leaflet) + OpenStreetMap karoları. Leaflet yalnız harita açılınca yüklenir.
// haritaGorunumu: konumlu anılar iğne, yakınlar küme; iğneye dokununca anı kartı.
// konumSec: tam ekran seçici; ortadaki iğne seçilen yer (kaydır ya da dokun), "Bulunduğum yer".
import { h } from '../../js/core/ui.js';
import { fotoImg } from '../../js/core/foto.js';
import { ikon } from './ikon.js';
import { gunYazi } from './mantik.js';
import * as HM from './harita-mantik.js';

const KARO_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATIF = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları';
const MAX_ZOOM = 19;
const KONUM_AYARI = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 };

// ---------- Yükleme ----------

let yukleme = null;

/** Leaflet'i bir kez yükler (CSS sayfa stillerinden önce, JS klasik betik). -> Promise<L> */
export function leafletYukle() {
  if (globalThis.L?.map) return Promise.resolve(globalThis.L);
  if (yukleme) return yukleme;
  const kok = new URL('../../vendor/leaflet/', import.meta.url);
  yukleme = new Promise((resolve, reject) => {
    const css = h('link', { rel: 'stylesheet', href: new URL('leaflet.css', kok).href });
    const js = h('script', { src: new URL('leaflet.js', kok).href });
    let kalan = 2;
    const bitti = () => { if (--kalan === 0) resolve(globalThis.L); };
    const hata = () => {
      yukleme = null;
      css.remove();
      js.remove();
      reject(new Error('Harita yüklenemedi. Bağlantını kontrol edip tekrar dene.'));
    };
    css.addEventListener('load', bitti);
    js.addEventListener('load', bitti);
    css.addEventListener('error', hata);
    js.addEventListener('error', hata);
    // Sayfa stilleri Leaflet'in varsayılanlarını ezebilsin diye ilk stil dosyasından önce.
    const ilk = document.head.querySelector('link[rel="stylesheet"]');
    if (ilk) ilk.before(css); else document.head.append(css);
    document.head.append(js);
  });
  return yukleme;
}

function haritaKur(L, el, secenek = {}) {
  const map = L.map(el, { worldCopyJump: true, attributionControl: false, maxZoom: MAX_ZOOM, ...secenek });
  L.control.attribution({ position: 'bottomleft' }).addTo(map);
  L.tileLayer(KARO_URL, { maxZoom: MAX_ZOOM, attribution: ATIF }).addTo(map);
  el.setAttribute('aria-label', 'Harita. Ok tuşlarıyla kaydır, artı ve eksiyle yakınlaştır.');
  return map;
}

/** Geolocation → Promise<GeolocationPosition>. Destek yoksa 'yok' ile reddeder. */
export function bulundugumYer() {
  if (!navigator.geolocation) return Promise.reject('yok');
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, KONUM_AYARI));
}

// ---------- İğneler ----------

function kapakMini(ani) {
  const url = ani.data.fotolar?.[0];
  return url ? fotoImg(url, { alt: '', eager: true }) : ikon('kalp', { dolu: true });
}

function pinIkonu(L, nokta) {
  const el = h('span', { class: 'ani-pin' }, h('span', { class: 'ani-pin-ic' }, kapakMini(nokta.ani)));
  return L.divIcon({ html: el, className: 'ani-pin-kap', iconSize: [46, 56], iconAnchor: [23, 54] });
}

function kumeIkonu(L, n) {
  const el = h('span', { class: 'ani-kume' }, h('b', {}, String(n)));
  return L.divIcon({ html: el, className: 'ani-kume-kap', iconSize: [52, 52], iconAnchor: [26, 26] });
}

const aniMeta = (ani) => [gunYazi(ani.data.tarih), ani.data.yer].filter(Boolean).join(' · ');

// ---------- Harita görünümü ----------

/**
 * -> { el, guncelle(liste), odakla(id), kapat() }
 * liste: süzülmüş anı belgeleri; onAc(id): anı ayrıntısına git.
 */
export function haritaGorunumu({ onAc }) {
  const tuval = h('div', { class: 'ani-harita-tuval' });
  const durumEl = h('div', { class: 'ani-harita-durum', role: 'status' }, 'Harita yükleniyor…');
  const kart = h('div', { class: 'ani-harita-kart', hidden: true, role: 'region', 'aria-label': 'Seçilen anı' });
  const el = h('div', { class: 'ani-harita' }, tuval, durumEl, kart);

  let L = null;
  let map = null;
  let katman = null;
  let noktalar = [];
  let sonAnahtar = '';
  let bekleyenOdak = null;
  let kapali = false;

  function kartKapat() {
    kart.hidden = true;
    kart.replaceChildren();
  }

  function kartGoster(uyeler) {
    const kapat = h('button', { type: 'button', class: 'ani-harita-kapat', 'aria-label': 'Kartı kapat', onclick: kartKapat }, ikon('kapat'));
    kart.dataset.tur = uyeler.length === 1 ? 'tek' : 'liste';
    if (uyeler.length === 1) {
      const { ani } = uyeler[0];
      kart.replaceChildren(
        h('button', { type: 'button', class: 'ani-harita-ani', onclick: () => onAc(ani.id) },
          h('span', { class: 'ani-harita-kapak' }, kapakMini(ani)),
          h('span', { class: 'ani-harita-metin' },
            h('span', { class: 'ani-harita-baslik' }, ani.data.baslik),
            h('span', { class: 'ani-harita-meta' }, aniMeta(ani)),
            h('span', { class: 'ani-harita-ac' }, 'Anıyı aç', ikon('sag')))),
        kapat);
    } else {
      kart.replaceChildren(
        h('div', { class: 'ani-harita-liste-bas' }, h('p', {}, `Burada ${uyeler.length} anınız var`), kapat),
        h('ul', { class: 'ani-harita-liste' }, uyeler.map(({ ani }) => h('li', {},
          h('button', { type: 'button', class: 'ani-harita-ani', onclick: () => onAc(ani.id) },
            h('span', { class: 'ani-harita-kapak' }, kapakMini(ani)),
            h('span', { class: 'ani-harita-metin' },
              h('span', { class: 'ani-harita-baslik' }, ani.data.baslik),
              h('span', { class: 'ani-harita-meta' }, aniMeta(ani))))))));
    }
    kart.hidden = false;
  }

  function igneler() {
    if (!map) return;
    katman.clearLayers();
    const zoom = map.getZoom();
    for (const k of HM.kumele(noktalar, zoom)) {
      const tek = k.uyeler.length === 1;
      const ilk = k.uyeler[0];
      const m = L.marker([k.lat, k.lng], {
        icon: tek ? pinIkonu(L, ilk) : kumeIkonu(L, k.uyeler.length),
        title: tek ? ilk.ani.data.baslik : `${k.uyeler.length} anı`,
        riseOnHover: true,
        keyboard: true,
      });
      m.on('click', () => {
        const ne = HM.kumeTiklama(k, map.getZoom(), map.getMaxZoom());
        if (ne === 'yakinlas') {
          kartKapat();
          map.fitBounds(HM.sinirlar(k.uyeler), { padding: [56, 56], maxZoom: map.getMaxZoom() });
        } else {
          kartGoster(k.uyeler);
        }
      });
      m.addTo(katman);
      m.getElement()?.setAttribute('aria-label', tek
        ? `${ilk.ani.data.baslik}, ${aniMeta(ilk.ani)}`
        : `${k.uyeler.length} anı bir arada; dokununca ${HM.ayniYerde(k.uyeler) ? 'listelenir' : 'yakınlaşır'}`);
    }
  }

  function sigdir() {
    const s = HM.sinirlar(noktalar);
    if (!s) map.setView([HM.VARSAYILAN_MERKEZ.lat, HM.VARSAYILAN_MERKEZ.lng], HM.VARSAYILAN_MERKEZ.zoom);
    else if (HM.ayniYerde(noktalar)) map.setView([noktalar[0].lat, noktalar[0].lng], 14);
    else map.fitBounds(s, { padding: [48, 48], maxZoom: 14 });
  }

  function odakla(id) {
    if (!map) { bekleyenOdak = id; return; }
    const n = noktalar.find((x) => x.id === id);
    if (!n) return;
    map.setView([n.lat, n.lng], Math.max(map.getZoom(), 15));
    kartGoster([n]);
  }

  function guncelle(liste) {
    noktalar = HM.konumluAnilar(liste);
    if (!map) return;
    const anahtar = noktalar.map((n) => n.id).join(',');
    const yeniKume = anahtar !== sonAnahtar;
    sonAnahtar = anahtar;
    if (yeniKume) { kartKapat(); sigdir(); }
    igneler();
  }

  async function baslat() {
    try {
      L = await leafletYukle();
    } catch (e) {
      durumEl.replaceChildren(h('p', {}, e.message),
        h('button', { type: 'button', class: 'btn small', onclick: () => { durumEl.textContent = 'Harita yükleniyor…'; baslat(); } }, 'Tekrar dene'));
      return;
    }
    if (kapali) return;
    durumEl.hidden = true;
    map = haritaKur(L, tuval, { zoomControl: true });
    katman = L.layerGroup().addTo(map);
    map.on('zoomend', igneler);
    map.on('click', kartKapat);
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !kart.hidden) { e.stopPropagation(); kartKapat(); } });
    guncelle(noktalar.map((n) => n.ani));
    if (bekleyenOdak) { odakla(bekleyenOdak); bekleyenOdak = null; }
  }

  baslat();
  return {
    el,
    guncelle,
    odakla,
    /** Sayfaya yeniden takılınca boyut değişmiş olabilir. */
    yenile: () => map?.invalidateSize(),
    kapat() {
      kapali = true;
      map?.remove();
      map = null;
    },
  };
}

// ---------- Konum seçici ----------

/**
 * Tam ekran konum seçici. baslangic: { lat, lng } | null; digerleri: [{ lat, lng }] (başka anılar; ilk görünüm).
 * -> Promise<{ lat, lng } | null> (vazgeçince null).
 */
export function konumSec({ baslangic = null, digerleri = [] } = {}) {
  const onceOdak = document.activeElement;
  return new Promise((resolve) => {
    let secim = HM.konumDogrula(baslangic);
    let secildi = !!secim;
    let map = null;
    let sonuc = null;

    const baslikId = `ani-konum-${Math.random().toString(36).slice(2, 8)}`;
    const tuval = h('div', { class: 'ani-secici-tuval' });
    const igne = h('span', { class: `ani-secici-igne${secildi ? ' secili' : ''}`, 'aria-hidden': 'true' },
      h('span', { class: 'ani-pin' }, h('span', { class: 'ani-pin-ic' }, ikon('kalp', { dolu: true }))));
    const durumEl = h('div', { class: 'ani-harita-durum', role: 'status' }, 'Harita yükleniyor…');
    const koord = h('p', { class: 'ani-secici-koord', 'aria-live': 'polite' });
    const mesaj = h('p', { class: 'ani-konum-mesaj', role: 'status', hidden: true });
    const secBtn = h('button', { type: 'button', class: 'btn primary', disabled: true, onclick: () => { sonuc = secim; dlg.close(); } }, 'Bu yeri seç');
    const yerBtn = h('button', { type: 'button', class: 'btn', onclick: konumumaGit }, ikon('hedef'), 'Bulunduğum yer');

    const dlg = h('dialog', { class: 'ani-secici', 'aria-labelledby': baslikId },
      h('header', { class: 'ani-secici-bas' },
        h('div', {},
          h('h2', { id: baslikId }, 'Anının yeri'),
          h('p', {}, 'Haritayı kaydır ya da bir yere dokun; iğne seçtiğin yeri gösterir.')),
        h('button', { type: 'button', class: 'ani-harita-kapat', 'aria-label': 'Kapat', onclick: () => dlg.close() }, ikon('kapat'))),
      h('div', { class: 'ani-secici-harita' }, tuval, igne, durumEl),
      h('footer', { class: 'ani-secici-alt' }, koord, mesaj, h('div', { class: 'ani-secici-eylem' }, yerBtn, secBtn)));

    function yaz() {
      koord.textContent = secildi && secim ? HM.konumYazi(secim) : 'Henüz bir yer seçilmedi';
      secBtn.disabled = !(secildi && secim);
      igne.classList.toggle('secili', secildi);
    }

    let dokunusPani = false; // dokunulan noktaya kayma: o nokta seçili kalır (piksel yuvarlaması kaydırmasın)
    function merkezdenSec() {
      if (!map || !secildi) return;
      if (dokunusPani) { dokunusPani = false; return; }
      secim = HM.haritaNoktasi(map.getCenter());
      yaz();
    }

    async function konumumaGit() {
      mesaj.hidden = true;
      yerBtn.disabled = true;
      yerBtn.setAttribute('aria-busy', 'true');
      try {
        const pos = await bulundugumYer();
        const k = HM.konumDogrula(pos.coords);
        if (!k) throw new Error('geçersiz');
        secildi = true;
        if (map) map.setView([k.lat, k.lng], 16);
        secim = k;
        yaz();
      } catch (e) {
        mesaj.textContent = HM.konumHataMetni(e);
        mesaj.hidden = false;
      } finally {
        yerBtn.disabled = false;
        yerBtn.removeAttribute('aria-busy');
      }
    }

    dlg.addEventListener('close', () => {
      map?.remove();
      map = null;
      dlg.remove();
      if (onceOdak?.isConnected) onceOdak.focus({ preventScroll: true });
      resolve(sonuc);
    });

    document.body.append(dlg);
    dlg.showModal();
    yaz();

    leafletYukle().then((L) => {
      if (!dlg.open) return;
      durumEl.hidden = true;
      map = haritaKur(L, tuval, { zoomControl: true });
      const diger = HM.sinirlar((digerleri || []).map(HM.konumDogrula).filter(Boolean));
      if (secim) map.setView([secim.lat, secim.lng], 15);
      else if (diger) map.fitBounds(diger, { padding: [40, 40], maxZoom: 12 });
      else map.setView([HM.VARSAYILAN_MERKEZ.lat, HM.VARSAYILAN_MERKEZ.lng], HM.VARSAYILAN_MERKEZ.zoom);
      // Dokunulan yer ortaya gelir (iğne ortada sabit); kaydırınca da orta seçilir.
      map.on('click', (e) => {
        secildi = true;
        secim = HM.haritaNoktasi(e.latlng);
        yaz();
        dokunusPani = true;
        map.panTo(e.latlng);
      });
      map.on('dragstart', () => { secildi = true; dokunusPani = false; });
      map.on('moveend', merkezdenSec);
      tuval.addEventListener('keydown', (e) => { if (/^Arrow/.test(e.key)) secildi = true; });
      requestAnimationFrame(() => map?.invalidateSize());
    }).catch((e) => {
      durumEl.replaceChildren(h('p', {}, e.message));
    });
  });
}
