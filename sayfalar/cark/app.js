// Karar Çarkı: ne yesek, ne izlesek? Çark karar verir.
// Eşzamanlılık: döndüren cihaz sonucu ve tohumu seçer; sevgili bu sayfadaysa room.send ile gönderir.
// Alıcı aynı seçeneklerle aynı hedef açıya döner (mantik.js hedefAci). Sevgili yoksa yalnız burada döner.
// Seçenekler yalnız textContent ile basılır. Saf mantık mantik.js'te (tests/cark-mantik).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { pageUrl, readStore, writeStore } from '../../js/core/identity.js';
import { toDay } from '../../js/core/gunler.js';
import { titret } from '../../js/core/mobil.js';
import { h, toast, genitive, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ikon } from '../listeler/ikonlar.js';
import { FIKIRLER } from '../randevu/fikirler.js';
import * as C from './mantik.js';

const NS = 'cark';
const { room, roomId, me } = await bootPage({ ns: NS, title: 'Karar Çarkı', tab: 'daha' });
const myId = me.clientId;
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'ck' }, h('p', { class: 'ck-yukleniyor muted', role: 'status' }, 'Çark kuruluyor…')));

const listeCol = await openCollection(room, 'liste').catch((e) => {
  console.warn('[cark] liste açılamadı', e);
  return null;
});

const KENDI_KEY = `${C.KENDI_ANAHTAR}.${roomId}`;
const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const partnerAdi = () => room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const partnerBurada = () => room.partner?.()?.page === NS;

const ilkCark = C.carkById(new URLSearchParams(location.search).get('cark'))?.id || 'yemek';
const durum = {
  cark: ilkCark,
  kendi: C.kendiOku(readStore('local', KENDI_KEY)),
  gelen: null,     // sevgilinin çevirdiği çark: { cark, baslik, secenekler, kimden }
  donuyor: null,   // { at, from } — süren dönüş
  sonuc: null,     // { m, from } — son sonuç
  aci: 0,          // çarkın şu anki açısı (0–360)
};
let tur = 0;       // her dönüşte artar; yarıda kesilen dönüş sonucu yazmaz
let anim = null;

// ---------- Görünen çark ----------
function yerelSecenekler(carkId = durum.cark) {
  return C.secenekler(carkId, {
    docs: listeCol?.all() || [], fikirler: FIKIRLER, kendi: durum.kendi, gun: toDay(), oda: roomId,
  });
}
const ayni = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** -> { cark, baslik, secenekler, kimden } */
function gorunen() {
  if (durum.gelen && durum.gelen.cark === durum.cark) return durum.gelen;
  return { cark: durum.cark, baslik: C.carkById(durum.cark).ad, secenekler: yerelSecenekler(), kimden: null };
}

// ---------- SVG çark ----------
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const kid of kids) if (kid != null) el.append(kid);
  return el;
}
const R = 90;        // dilim yarıçapı (viewBox -100..100)
const HUB = 17;
const nokta = (a, r) => {
  const rad = (a * Math.PI) / 180;
  return `${(r * Math.sin(rad)).toFixed(2)} ${(-r * Math.cos(rad)).toFixed(2)}`;
};

function carkIcerik(liste, kazanan = -1) {
  const n = liste.length;
  const sl = 360 / n;
  const fs = n <= 6 ? 9 : n <= 9 ? 8.5 : 8;
  const parca = [];
  liste.forEach((_, i) => {
    const d = `M0 0 L${nokta(i * sl, R)} A${R} ${R} 0 ${sl > 180 ? 1 : 0} 1 ${nokta((i + 1) * sl, R)}Z`;
    parca.push(s('path', { d, class: 'ck-dilim', 'data-renk': C.dilimRenk(i, n), 'data-kazanan': i === kazanan ? '1' : null }));
  });
  // Etiket yarıçap boyunca, kenardan göbeğe; en çok iki satır (satırlar dilimin enine dizilir).
  const satirMax = n <= 6 ? 14 : 13;
  liste.forEach((m, i) => {
    const c = (i + 0.5) * sl;
    const satirlar = C.etiketSatirlari(m, satirMax, n > 10 ? 1 : 2);
    parca.push(s('text', {
      class: 'ck-etiket', transform: `rotate(${(c - 90).toFixed(2)})`,
      'text-anchor': 'end', 'font-size': fs, 'data-kazanan': i === kazanan ? '1' : null,
    }, ...satirlar.map((satir, j) => s('tspan', {
      x: R - 7, y: ((j - (satirlar.length - 1) / 2) * 1.12 * fs).toFixed(2), 'dominant-baseline': 'central',
    }, satir))));
  });
  // Kenar halkası ve ışıklar, göbek
  parca.push(s('circle', { class: 'ck-halka', r: R + 4.5 }));
  for (let i = 0; i < 24; i++) {
    const [x, y] = nokta(i * 15 + 7.5, R + 4.5).split(' ');
    parca.push(s('circle', { class: 'ck-isik', cx: x, cy: y, r: 1.7 }));
  }
  parca.push(s('circle', { class: 'ck-gobek', r: HUB }));
  parca.push(s('path', {
    class: 'ck-gobek-kalp', transform: 'translate(-9 -9.6) scale(.75)',
    d: 'M12 20.7c-.27 0-.53-.09-.75-.27C6.6 16.6 3 13.5 3 9.45 3 6.68 5.13 4.5 7.8 4.5c1.68 0 3.2.83 4.2 2.15 1-1.32 2.52-2.15 4.2-2.15 2.67 0 4.8 2.18 4.8 4.95 0 4.05-3.6 7.15-8.25 10.98-.22.18-.48.27-.75.27z',
  }));
  return parca;
}

// ---------- İskelet ----------
const secici = h('div', { class: 'ck-secici', role: 'group', 'aria-label': 'Hangi çark' },
  C.CARKLAR.map((c) => h('button', {
    type: 'button', class: 'ck-sec', dataset: { cark: c.id }, onclick: () => carkSec(c.id),
  }, h('span', { class: 'ck-sec-emoji', 'aria-hidden': 'true' }, c.emoji), c.ad)));

// Dönen <g>: SVG içi dönüş sayfa düzenini etkilemez (döndürülmüş kutu yatay taşma yaratmaz). Merkez (0,0).
const donen = s('g', { class: 'ck-donen' });
const svg = s('svg', { class: 'ck-cark', viewBox: '-100 -100 200 200', 'aria-hidden': 'true', focusable: 'false' }, donen);
const ibre = h('div', { class: 'ck-ibre', 'aria-hidden': 'true', html: '<svg viewBox="0 0 32 40" focusable="false"><path d="M16 39 4.2 17.6A13 13 0 1 1 27.8 17.6z"/><circle cx="16" cy="13" r="4.6"/></svg>' });
const carkBaslik = h('h2', { class: 'sr-only', id: 'ck-baslik' });
const carkOzet = h('p', { class: 'sr-only', id: 'ck-ozet' });
const sahne = h('div', { class: 'ck-sahne', role: 'img', 'aria-labelledby': 'ck-baslik ck-ozet' }, ibre, svg);
const bos = h('div', { class: 'ck-bos', hidden: true });
const kim = h('p', { class: 'ck-kim' });
const cevirBtn = h('button', { type: 'button', class: 'btn primary wide ck-cevir', onclick: () => cevir() });
const sonucEl = h('section', { class: 'ck-sonuc card', 'aria-labelledby': 'ck-sonuc-metin', hidden: true });
const canli = h('p', { class: 'sr-only', 'aria-live': 'polite' });
const kaynak = h('p', { class: 'ck-kaynak' });
const kendiEl = h('section', { class: 'ck-kendi', 'aria-labelledby': 'ck-kendi-baslik', hidden: true });

app.replaceChildren(h('div', { class: 'ck' },
  secici, carkBaslik, carkOzet,
  h('div', { class: 'ck-govde' }, sahne, bos),
  kim, cevirBtn, sonucEl, canli, kaynak, kendiEl));

// ---------- Çizim ----------
function seciciCiz() {
  for (const b of secici.children) {
    b.setAttribute('aria-pressed', String(b.dataset.cark === durum.cark));
    b.disabled = !!durum.donuyor;
  }
}

function kimCiz() {
  const ad = partnerAdi();
  const burada = partnerBurada();
  kim.dataset.burada = burada ? '1' : '0';
  kim.replaceChildren(h('span', { class: 'ck-kim-nokta', 'aria-hidden': 'true' }),
    burada ? `${ad} de burada: çark ikinizde birden döner.` : `${ad} burada değil; çark yalnız sende döner.`);
}

const LISTE_ADI = { izlenecek: ['İzlenecekler', 'film'], gidilecek: ['Gidilecek yerler', 'yer'] };

function kaynakCiz(g) {
  const c = C.carkById(g.cark);
  kaynak.replaceChildren();
  if (g.kimden) {
    const yerel = yerelSecenekler(g.cark);
    if (ayni(yerel, g.secenekler)) return;
    kaynak.append(`${genitive(g.kimden)} çarkı gösteriliyor.`, ' ',
      h('button', { type: 'button', class: 'ck-bag', onclick: () => { durum.gelen = null; ciz(); } }, 'Benimkini göster'));
    return;
  }
  if (c.liste && g.secenekler.length >= C.MIN_SECENEK) {
    const [ad] = LISTE_ADI[c.liste];
    const toplam = C.listeSecenekleri(listeCol?.all() || [], c.liste).length;
    kaynak.append(toplam > g.secenekler.length ? `${ad} listenizden bugün için ${g.secenekler.length} tanesi. ` : `${ad} listenizden. `,
      h('a', { class: 'ck-bag', href: pageUrl('sayfalar/listeler/', { liste: c.liste }) }, 'Listeye git'));
  } else if (c.id === 'yap') {
    kaynak.append('Randevu fikirlerinden bugünün seçkisi. ',
      h('a', { class: 'ck-bag', href: pageUrl('sayfalar/randevu/') }, 'Tüm fikirler'));
  }
}

function bosCiz(g) {
  const c = C.carkById(g.cark);
  const n = g.secenekler.length;
  let metin;
  let eylem = null;
  if (c.liste) {
    const [ad, tek] = LISTE_ADI[c.liste];
    metin = n === 0
      ? `${ad} listeniz boş. Birkaç ${tek} ekleyin, çark seçsin.`
      : `Listede yalnız “${g.secenekler[0]}” var. Bir ${tek} daha ekleyin, çark seçsin.`;
    eylem = h('a', { class: 'btn primary', href: pageUrl('sayfalar/listeler/', { liste: c.liste }) }, ikon('plus'), 'Listeye ekle');
  } else {
    metin = n === 0 ? 'Çarkını kendin kur: aşağıya en az iki seçenek yaz.' : 'Bir seçenek daha yaz, çark dönmeye hazır.';
  }
  bos.replaceChildren(
    h('div', { class: 'ck-bos-cark', 'aria-hidden': 'true' }, h('span', {}, c.emoji)),
    h('p', { class: 'ck-bos-metin' }, metin), eylem);
}

function kendiCiz() {
  const goster = durum.cark === 'kendi' && !(durum.gelen && durum.gelen.cark === 'kendi');
  kendiEl.hidden = !goster;
  if (!goster) return;
  const eski = document.getElementById('ck-yeni');
  const eskiDeger = eski?.value || '';
  const odakta = !!eski && document.activeElement === eski;
  const girdi = h('input', {
    id: 'ck-yeni', class: 'input', type: 'text', maxlength: String(C.SECENEK_MAX), autocomplete: 'off',
    enterkeyhint: 'done', placeholder: 'ör. Bowling', 'aria-describedby': 'ck-kendi-ipucu ck-hata',
  });
  const hata = h('p', { class: 'ck-hata', id: 'ck-hata', role: 'alert', hidden: true });
  const dolu = durum.kendi.length >= C.MAX_SECENEK;
  const form = h('form', { class: 'ck-kendi-form', novalidate: true },
    h('label', { class: 'sr-only', for: 'ck-yeni' }, 'Yeni seçenek'), girdi,
    h('button', { type: 'submit', class: 'btn primary ck-ekle', disabled: dolu || null }, ikon('plus'), 'Ekle'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = C.kendiEkle(durum.kendi, girdi.value);
    if (r.hata) {
      hata.textContent = r.hata;
      hata.hidden = false;
      girdi.setAttribute('aria-invalid', 'true');
      girdi.focus();
      return;
    }
    girdi.value = '';
    kendiKaydet(r.liste);
    sfx('pop');
    document.getElementById('ck-yeni')?.focus();
  });
  girdi.addEventListener('input', () => { hata.hidden = true; girdi.removeAttribute('aria-invalid'); });
  kendiEl.replaceChildren(
    h('h2', { class: 'ck-kendi-baslik', id: 'ck-kendi-baslik' }, 'Seçeneklerin',
      h('span', { class: 'ck-sayi' }, `${durum.kendi.length}/${C.MAX_SECENEK}`)),
    form, hata,
    durum.kendi.length ? h('ul', { class: 'ck-kendi-liste' }, durum.kendi.map((m, i) => h('li', {},
      h('span', { class: 'ck-kendi-metin' }, m),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `${m} seçeneğini çıkar`, dataset: { odak: `cikar:${i}` },
        onclick: () => {
          kendiKaydet(C.kendiCikar(durum.kendi, i));
          const sonraki = kendiEl.querySelector(`[data-odak="cikar:${Math.min(i, durum.kendi.length - 1)}"]`);
          (sonraki || document.getElementById('ck-yeni'))?.focus();
        },
      }, ikon('trash'))))) : null,
    h('p', { class: 'ck-ipucu', id: 'ck-kendi-ipucu' }, `${C.MIN_SECENEK}–${C.MAX_SECENEK} seçenek. Bu telefonda saklanır.`));
  // Liste ya da sonuç değişince yeniden çizilir: yazılan metin ve odak kaybolmasın.
  girdi.value = eskiDeger;
  if (odakta) girdi.focus({ preventScroll: true });
}

function kendiKaydet(liste) {
  durum.kendi = liste;
  writeStore('local', KENDI_KEY, JSON.stringify(liste));
  if (!durum.donuyor) ciz();
}

function sonucCiz() {
  const r = durum.sonuc;
  const g = gorunen();
  if (!r || durum.donuyor || r.m.cark !== g.cark || !ayni(r.m.secenekler, g.secenekler)) {
    sonucEl.hidden = true;
    return null;
  }
  const { on, deger } = C.sonucParcalari(r.m.cark, r.m.secenekler[r.m.sonuc]);
  const meta = r.from !== myId ? `${partnerAdi()} çevirdi.` : r.ortak ? `${genitive(partnerAdi())} ekranında da aynısı çıktı.` : '';
  sonucEl.replaceChildren(
    h('p', { class: 'ck-sonuc-metin', id: 'ck-sonuc-metin' }, h('span', { class: 'ck-on' }, on), ' ', h('strong', {}, deger)),
    meta ? h('p', { class: 'ck-sonuc-meta' }, meta) : null,
    h('button', { type: 'button', class: 'btn ck-tekrar', onclick: () => cevir() }, ikon('dice'), 'Tekrar çevir'));
  sonucEl.hidden = false;
  return r.m.sonuc;
}

function ciz() {
  const g = gorunen();
  const n = g.secenekler.length;
  const hazir = n >= C.MIN_SECENEK;
  seciciCiz();
  kimCiz();
  carkBaslik.textContent = g.baslik;
  carkOzet.textContent = hazir ? `${n} seçenek: ${g.secenekler.join(', ')}.` : '';
  sahne.hidden = !hazir;
  bos.hidden = hazir;
  if (!hazir) bosCiz(g);
  const kazanan = sonucCiz();
  if (hazir) donen.replaceChildren(...carkIcerik(g.secenekler, kazanan ?? -1));
  donen.style.transform = `rotate(${durum.aci}deg)`;
  cevirBtn.hidden = !hazir || !sonucEl.hidden;
  cevirBtn.disabled = !!durum.donuyor;
  cevirBtn.replaceChildren(durum.donuyor ? 'Dönüyor…' : 'Çevir');
  kaynakCiz(g);
  kendiCiz();
}

function carkSec(id) {
  if (durum.donuyor || durum.cark === id) return;
  durum.cark = id;
  durum.gelen = null;
  const u = new URL(location.href);
  if (id === 'yemek') u.searchParams.delete('cark'); else u.searchParams.set('cark', id);
  history.replaceState(history.state, '', u.pathname + u.search);
  sfx('tap');
  ciz();
}

// ---------- Döndürme ----------
function cevir() {
  if (durum.donuyor) return;
  const g = gorunen();
  if (g.secenekler.length < C.MIN_SECENEK) return;
  const { sonuc, tohum } = C.cevirmeHazirla(g.secenekler.length);
  const baslik = g.cark === 'kendi' && !g.kimden ? `${genitive(me.name || 'Sevgilin')} çarkı` : g.baslik;
  const m = C.mesajKur({ cark: g.cark, baslik, secenekler: g.secenekler, sonuc, tohum, at: Date.now() });
  const ortak = partnerBurada() && room.send(m) !== false;
  oynat(m, myId, { ortak, kimden: g.kimden });
}

const aciOku = () => {
  const t = getComputedStyle(donen).transform;
  const x = /matrix\(([^,]+),\s*([^,]+)/.exec(t || '');
  return x ? (Math.atan2(Number(x[2]), Number(x[1])) * 180) / Math.PI : durum.aci;
};

async function oynat(m, from, { ortak = false, kimden = null } = {}) {
  const benim = ++tur;
  anim?.cancel();
  durum.donuyor = { at: m.at, from };
  durum.cark = m.cark;
  durum.gelen = from === myId && !kimden ? null : { cark: m.cark, baslik: m.baslik, secenekler: m.secenekler, kimden: kimden || partnerAdi() };
  durum.sonuc = null;
  ciz();
  secici.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  canli.textContent = from === myId ? 'Çark dönüyor…' : `${partnerAdi()} çarkı çevirdi…`;
  const n = m.secenekler.length;
  const hedef = C.hedefAci(durum.aci, n, m.sonuc, m.tohum);
  if (!azHareket() && typeof donen.animate === 'function') {
    anim = donen.animate(
      [{ transform: `rotate(${durum.aci}deg)` }, { transform: `rotate(${hedef}deg)` }],
      { duration: C.SURE_MS, easing: 'cubic-bezier(0.12, 0.7, 0.14, 1)', fill: 'forwards' });
    let dilim = C.aciSonuc(durum.aci, n);
    const tik = () => {
      if (benim !== tur || !anim || anim.playState !== 'running') return;
      const d = C.aciSonuc(aciOku(), n);
      if (d !== dilim) { dilim = d; sfx('tick'); }
      requestAnimationFrame(tik);
    };
    requestAnimationFrame(tik);
    try {
      await anim.finished;
    } catch {
      return; // yeni dönüş başladı
    }
  }
  if (benim !== tur) return;
  durum.aci = ((hedef % 360) + 360) % 360;
  donen.style.transform = `rotate(${durum.aci}deg)`;
  anim?.cancel();
  anim = null;
  durum.donuyor = null;
  durum.sonuc = { m, from, ortak };
  ciz();
  const { on, deger } = C.sonucParcalari(m.cark, m.secenekler[m.sonuc]);
  canli.textContent = `${on} ${deger}`;
  sfx('match');
  titret(40);
  if (!azHareket()) sonucEl.classList.add('yeni');
  sonucEl.querySelector('.ck-tekrar')?.focus({ preventScroll: true });
}

// ---------- Oda ----------
room.on('message', (raw, from) => {
  const m = C.mesajGecerli(raw);
  if (!m || !from?.clientId) return;
  // İkimiz aynı anda çevirdiysek önce başlayan geçerli (iki taraf da aynı kararı verir).
  if (durum.donuyor && !C.onceGelir({ at: m.at, from: from.clientId }, durum.donuyor)) return;
  oynat(m, from.clientId, { kimden: from.name || partnerAdi() });
});
room.on('presence', () => kimCiz());
listeCol?.on('change', () => { if (!durum.donuyor) ciz(); });
listeCol?.on('error', (err) => toast(err?.message || 'Listeler yüklenemedi.'));
sonucEl.addEventListener('animationend', () => sonucEl.classList.remove('yeni'));

ciz();
