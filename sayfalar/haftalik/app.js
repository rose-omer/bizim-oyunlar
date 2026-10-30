// Haftalık ilişki kontrolü: dört kısa puan; ikiniz de doldurunca karşılaştırma açılır. Saf mantık mantik.js'te.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { toDay, addDays } from '../../js/core/gunler.js';
import { h, toast, initial, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ikon } from '../anilar/ikon.js';
import {
  ALANLAR, NOT_MAX, HAFTA_SAYISI, isoHafta, haftaPazartesi, docId, haftalaraGore, haftaDurumu, yeniKayit,
  karsilastir, egilim, egilimOzeti, cizgiYolu, hatirlatmaGoster, bildirimMetni, sayiMetni,
} from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'haftalik', title: 'Haftalık Kontrol', tab: 'daha' });
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'hk' }, h('p', { class: 'hk-yukleniyor muted', role: 'status' }, 'Haftanız hazırlanıyor…')));

const [col, profil] = await Promise.all([
  openCollection(room, 'haftalik'),
  openProfil(room).catch((e) => { console.warn('[haftalik] profil açılamadı', e); return null; }),
]);

const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || '';
const SVG_NS = 'http://www.w3.org/2000/svg';
const yerelTarih = (gun) => {
  const [y, m, d] = gun.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const gunAy = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const gunUzun = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const haftaAraligi = (hafta) => {
  const pzt = haftaPazartesi(hafta);
  return `${gunUzun.format(yerelTarih(pzt))} – ${gunUzun.format(yerelTarih(addDays(pzt, 6)))}`;
};

// ---------- Durum ----------
let hafta = isoHafta(toDay());
let duzenliyor = false;
let onceki = null; // { hafta, ikisi, partner }
const secim = {}; // { [alan]: 1–5 } formdaki seçim

// ---------- İskelet ----------
const aralikEl = h('p', { class: 'hk-aralik' });
const hatirlatEl = h('aside', { class: 'hk-hatirlat', hidden: true, 'aria-labelledby': 'hk-hatirlat-baslik' },
  h('span', { class: 'hk-hatirlat-ikon', 'aria-hidden': 'true' }, ikon('saat')),
  h('div', {},
    h('p', { id: 'hk-hatirlat-baslik', class: 'hk-hatirlat-baslik' }, 'Pazar akşamı, haftayı konuşalım'),
    h('p', { class: 'hk-hatirlat-metin' }, 'Dört kısa soru, bir dakika. Hafta bitmeden doldur.')));
const durumEl = h('p', { class: 'hk-durum', role: 'status' });

const notGirdi = h('textarea', {
  id: 'hk-not', class: 'input', rows: 3, maxlength: NOT_MAX,
  placeholder: 'Bu hafta aklında kalan bir an, bir teşekkür…',
});
const hataEl = h('p', { class: 'hk-hata', role: 'alert', hidden: true });
const gonderBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Gönder');
const vazgecBtn = h('button', { type: 'button', class: 'btn ghost', hidden: true, onclick: () => duzenlemeBitir() }, 'Vazgeç');
const formEl = h('form', { class: 'hk-form', novalidate: true, onsubmit: gonder },
  ALANLAR.map((a) => h('fieldset', { class: 'hk-alan', dataset: { alan: a.id } },
    h('legend', {}, h('span', { class: 'hk-alan-ad' }, a.ad), h('span', { class: 'hk-alan-soru' }, a.soru)),
    h('div', { class: 'hk-puanlar' }, [1, 2, 3, 4, 5].map((n) => {
      const input = h('input', { type: 'radio', name: a.id, value: String(n), class: 'hk-puan-girdi', id: `hk-${a.id}-${n}` });
      input.addEventListener('change', () => { secim[a.id] = n; hataGoster(null); });
      return h('label', { class: 'hk-puan', for: `hk-${a.id}-${n}` }, input, h('span', {}, String(n)));
    })),
    h('div', { class: 'hk-uclar', 'aria-hidden': 'true' }, h('span', {}, 'Zayıftı'), h('span', {}, 'Harikaydı')))),
  h('label', { class: 'hk-etiket', for: 'hk-not' }, 'Not ', h('span', { class: 'muted' }, '(isteğe bağlı)')),
  notGirdi,
  hataEl,
  h('div', { class: 'hk-dugmeler' }, vazgecBtn, gonderBtn));

const sonucEl = h('div', { class: 'hk-sonuc', tabindex: '-1' });

const lejantEl = h('ul', { class: 'hk-lejant' });
const grafikYuva = h('div', { class: 'hk-grafik' });
const ozetEl = h('p', { class: 'hk-ozet', id: 'hk-ozet' });
const tabloEl = h('div', { class: 'hk-tablo-yuva' });

app.replaceChildren(h('div', { class: 'hk' },
  h('section', { class: 'hk-bu', 'aria-labelledby': 'hk-bu-baslik' },
    h('header', { class: 'hk-bas' }, h('h2', { id: 'hk-bu-baslik' }, 'Bu hafta'), aralikEl),
    hatirlatEl, durumEl, formEl, sonucEl),
  h('section', { class: 'hk-egilim card', 'aria-labelledby': 'hk-egilim-baslik' },
    h('h2', { id: 'hk-egilim-baslik' }, `Son ${HAFTA_SAYISI} hafta`),
    h('p', { class: 'hk-egilim-alt' }, 'Dört alanın ortalaması, 1–5'),
    lejantEl, grafikYuva, ozetEl,
    h('details', { class: 'hk-detay' }, h('summary', {}, 'Haftalara göre tablo'), tabloEl))));

// ---------- Form ----------
function hataGoster(metin) {
  hataEl.hidden = !metin;
  hataEl.textContent = metin || '';
}

function formuDoldur(k) {
  for (const a of ALANLAR) {
    secim[a.id] = k?.puanlar?.[a.id];
    for (const input of formEl.querySelectorAll(`input[name="${a.id}"]`)) input.checked = Number(input.value) === secim[a.id];
  }
  notGirdi.value = k?.not || '';
}

function duzenlemeBasla(k) {
  duzenliyor = true;
  formuDoldur(k);
  hataGoster(null);
  ciz();
  formEl.querySelector('input:checked, input')?.focus();
}

function duzenlemeBitir() {
  duzenliyor = false;
  formuDoldur(null);
  hataGoster(null);
  ciz();
  sonucEl.focus({ preventScroll: true });
}

async function gonder(e) {
  e.preventDefault();
  const simdiki = isoHafta(toDay());
  if (simdiki !== hafta) { hafta = simdiki; duzenliyor = false; ciz(); toast('Yeni hafta başladı. Bu haftayı değerlendirelim.'); return; }
  const r = yeniKayit({ puanlar: secim, not: notGirdi.value });
  if (r.hata) {
    hataGoster(r.hata);
    const eksik = ALANLAR.find((a) => !secim[a.id]);
    if (eksik) formEl.querySelector(`input[name="${eksik.id}"]`)?.focus();
    return;
  }
  const once = haftaDurumu(haftalaraGore(col.all()), hafta, me.clientId);
  gonderBtn.disabled = true;
  try {
    await col.put(r.data, docId(hafta, me.clientId));
  } catch (err) {
    hataGoster(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
    return;
  } finally {
    gonderBtn.disabled = false;
  }
  if (!once.partner) sfx('pop'); // partner doldurduysa açılışta 'match' çalar
  if (once.ben) toast('Puanların güncellendi');
  duzenlemeBitir();
  if (!once.ben && !partnerGoruyor(room.partner?.(), 'haftalik')) {
    bildir(roomId, { tur: 'soru', ...bildirimMetni({ benAd: benAdi(), partnerDoldurdu: !!once.partner }), url: 'sayfalar/haftalik/' })
      .catch((err) => console.warn('[haftalik] bildirim gönderilemedi', err));
  }
}

// ---------- Sonuç ----------
function pipler(puan, kim) {
  return h('span', { class: 'hk-pipler', dataset: { kim }, 'aria-hidden': 'true' },
    [1, 2, 3, 4, 5].map((n) => h('span', { class: n <= puan ? 'dolu' : '' })));
}

function kisiSatiri(ad, puan, kim) {
  return h('div', { class: 'hk-kisi', dataset: { kim } },
    h('span', { class: 'hk-kisi-ad' }, ad), pipler(puan, kim), h('span', { class: 'hk-kisi-puan' }, String(puan)),
    h('span', { class: 'sr-only' }, `${ad}: 5 üzerinden ${puan}`));
}

function notKutusu(ad, not) {
  return not ? h('blockquote', { class: 'hk-not' }, h('p', {}, not), h('footer', {}, ad)) : null;
}

function cizSonuc(d, pAd) {
  if (!d.ben || duzenliyor) {
    sonucEl.hidden = true;
    sonucEl.replaceChildren();
    return;
  }
  sonucEl.hidden = false;
  const duzenle = h('button', { type: 'button', class: 'btn ghost small', onclick: () => duzenlemeBasla(d.ben) },
    ikon('kalem'), 'Düzenle');

  if (!d.partner) {
    sonucEl.replaceChildren(
      h('div', { class: 'hk-kart' },
        h('div', { class: 'hk-kart-bas' }, h('h3', {}, 'Senin puanların'), duzenle),
        h('div', { class: 'hk-satirlar' }, ALANLAR.map((a) => h('div', { class: 'hk-satir' },
          h('span', { class: 'hk-satir-ad' }, a.ad), kisiSatiri('Sen', d.ben.puanlar[a.id], 'ben')))),
        notKutusu('Sen', d.ben.not)),
      h('div', { class: 'hk-muhur' },
        h('span', { class: 'avatar partner', 'aria-hidden': 'true' }, initial(pAd)),
        h('p', {}, `${pAd} doldurunca puanlarınız yan yana açılır.`)));
    return;
  }

  const k = karsilastir(d.ben.puanlar, d.partner.puanlar);
  const ozet = k.konusalim.length
    ? `${k.konusalim.length === 1 ? 'Bir alanda' : `${k.konusalim.length} alanda`} farklı hissetmişsiniz. Konuşmaya değer.`
    : k.ayni === ALANLAR.length ? 'Her alanda aynı puanı vermişsiniz. Aynı kafa!' : 'Benzer hissetmişsiniz.';
  sonucEl.replaceChildren(h('div', { class: 'hk-kart hk-karsi' },
    h('div', { class: 'hk-kart-bas' }, h('h3', {}, 'Bu haftanız'), duzenle),
    h('div', { class: 'hk-ortalar' },
      h('div', { dataset: { kim: 'ben' } }, h('span', {}, 'Sen'), h('strong', {}, sayiMetni(k.benOrt))),
      h('div', { dataset: { kim: 'partner' } }, h('span', {}, pAd), h('strong', {}, sayiMetni(k.partnerOrt)))),
    h('p', { class: 'hk-karsi-ozet' }, ozet),
    h('div', { class: 'hk-satirlar' }, k.satirlar.map((s) => h('div', { class: 'hk-satir', dataset: { konus: String(k.konusalim.includes(s.id)) } },
      h('span', { class: 'hk-satir-ad' }, s.ad, k.konusalim.includes(s.id) ? h('span', { class: 'chip accent' }, 'Konuşalım') : null),
      kisiSatiri('Sen', s.ben, 'ben'),
      kisiSatiri(pAd, s.partner, 'partner')))),
    notKutusu('Sen', d.ben.not),
    notKutusu(pAd, d.partner.not)));
}

// ---------- Eğilim grafiği ----------
const G = { w: 320, h: 150, sol: 22, sag: 40, ust: 12, alt: 26 };

function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

function haftaEtiketi(w, i, liste) {
  const pzt = yerelTarih(haftaPazartesi(w));
  const onceki = i > 0 ? yerelTarih(haftaPazartesi(liste[i - 1])) : null;
  return !onceki || onceki.getMonth() !== pzt.getMonth() ? gunAy.format(pzt) : String(pzt.getDate());
}

function cizEgilim(harita, pAd) {
  const seri = egilim(harita, { hafta, benId: me.clientId });
  const icW = G.w - G.sol - G.sag;
  const icH = G.h - G.ust - G.alt;
  const ben = cizgiYolu(seri.map((s) => s.ben), { genislik: icW, yukseklik: icH });
  const o = cizgiYolu(seri.map((s) => s.partner), { genislik: icW, yukseklik: icH });
  const x = (i) => (i * icW) / (seri.length - 1);

  lejantEl.replaceChildren(
    h('li', { dataset: { kim: 'ben' } }, h('span', { class: 'hk-cizgi-ornek', 'aria-hidden': 'true' }), 'Sen'),
    h('li', { dataset: { kim: 'partner' } }, h('span', { class: 'hk-cizgi-ornek', 'aria-hidden': 'true' }), pAd));

  const izgara = [1, 2, 3, 4, 5].map((v) => {
    const y = ((5 - v) / 4) * icH;
    return svg('g', { class: 'hk-izgara' },
      svg('line', { x1: 0, x2: icW, y1: y, y2: y }),
      v % 2 ? svg('text', { x: -8, y: y + 4, 'text-anchor': 'end' }, String(v)) : null);
  });
  const xEtiket = seri.map((s, i, l) => svg('text', {
    class: 'hk-x', x: x(i), y: icH + 18, 'text-anchor': 'middle',
  }, haftaEtiketi(s.hafta, i, l.map((z) => z.hafta))));

  // Doğrudan etiket: her serinin son noktasının sağında; çakışırsa aralanır.
  const sonlar = [['ben', ben.noktalar.at(-1), 'Sen'], ['partner', o.noktalar.at(-1), pAd]].filter(([, n]) => n);
  if (sonlar.length === 2 && Math.abs(sonlar[0][1].y - sonlar[1][1].y) < 14) {
    const [ust, alt] = sonlar[0][1].y <= sonlar[1][1].y ? [sonlar[0], sonlar[1]] : [sonlar[1], sonlar[0]];
    const orta = (ust[1].y + alt[1].y) / 2;
    ust.etiketY = orta - 7;
    alt.etiketY = orta + 7;
  }
  const etiketler = sonlar.map((s) => svg('text', {
    class: 'hk-dogrudan', x: s[1].x + 9, y: (s.etiketY ?? s[1].y) + 4, 'data-kim': s[0],
  }, s[2].length > 6 ? `${s[2].slice(0, 5)}…` : s[2]));

  const vurgu = svg('line', { class: 'hk-vurgu', x1: 0, x2: 0, y1: 0, y2: icH, visibility: 'hidden' });
  const cizim = svg('svg', {
    viewBox: `0 0 ${G.w} ${G.h}`, class: 'hk-svg', role: 'img', 'aria-labelledby': 'hk-egilim-baslik hk-ozet',
  },
  svg('g', { transform: `translate(${G.sol} ${G.ust})` },
    izgara, xEtiket, vurgu,
    svg('path', { class: 'hk-seri', 'data-kim': 'partner', d: o.d }),
    svg('path', { class: 'hk-seri', 'data-kim': 'ben', d: ben.d }),
    o.noktalar.map((n) => svg('circle', { class: 'hk-nokta', 'data-kim': 'partner', cx: n.x, cy: n.y, r: 4 })),
    ben.noktalar.map((n) => svg('circle', { class: 'hk-nokta', 'data-kim': 'ben', cx: n.x, cy: n.y, r: 4 })),
    etiketler));

  // Dokun ya da üstüne gel: o haftanın değerleri.
  const ipucu = h('div', { class: 'hk-ipucu', hidden: true, 'aria-hidden': 'true' });
  const goster = (clientX) => {
    const r = cizim.getBoundingClientRect();
    const olcek = r.width / G.w;
    const yerel = (clientX - r.left) / olcek - G.sol;
    const i = Math.max(0, Math.min(seri.length - 1, Math.round(yerel / (icW / (seri.length - 1)))));
    const s = seri[i];
    vurgu.setAttribute('x1', x(i));
    vurgu.setAttribute('x2', x(i));
    vurgu.setAttribute('visibility', 'visible');
    ipucu.replaceChildren(
      h('strong', {}, `${gunAy.format(yerelTarih(haftaPazartesi(s.hafta)))} haftası`),
      h('span', { dataset: { kim: 'ben' } }, `Sen: ${s.ben == null ? '—' : sayiMetni(s.ben)}`),
      h('span', { dataset: { kim: 'partner' } }, `${pAd}: ${s.partner == null ? '—' : sayiMetni(s.partner)}`));
    ipucu.hidden = false;
    const px = (G.sol + x(i)) * olcek;
    ipucu.style.left = `${Math.max(4, Math.min(r.width - ipucu.offsetWidth - 4, px - ipucu.offsetWidth / 2))}px`;
  };
  const gizle = () => { ipucu.hidden = true; vurgu.setAttribute('visibility', 'hidden'); };
  cizim.addEventListener('pointermove', (e) => goster(e.clientX));
  cizim.addEventListener('pointerdown', (e) => goster(e.clientX));
  cizim.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') gizle(); });
  grafikYuva.replaceChildren(cizim, ipucu);

  ozetEl.textContent = egilimOzeti(seri, { partnerAd: pAd });
  tabloEl.replaceChildren(h('table', { class: 'hk-tablo' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Hafta'), h('th', { scope: 'col' }, 'Sen'), h('th', { scope: 'col' }, pAd))),
    h('tbody', {}, [...seri].reverse().map((s) => h('tr', {},
      h('th', { scope: 'row' }, `${gunAy.format(yerelTarih(haftaPazartesi(s.hafta)))} haftası`),
      h('td', {}, s.ben == null ? '—' : sayiMetni(s.ben)),
      h('td', {}, s.partner == null ? '—' : sayiMetni(s.partner)))))));
}

// ---------- Çizim ----------
function cizDurum(d, pAd) {
  let ton = '';
  let metin;
  if (duzenliyor) metin = 'Puanlarını düzenliyorsun. Hafta bitene kadar değiştirebilirsin.';
  else if (d.ikisi) { ton = 'acik'; metin = 'İkiniz de doldurdunuz. İşte haftanız.'; }
  else if (d.partner) { ton = 'bekliyor'; metin = `${pAd} doldurdu, seni bekliyor. Sen de doldur, karşılaştırma açılsın.`; }
  else if (d.ben) metin = `Puanların gitti. ${pAd} doldurunca karşılaştırma açılır.`;
  else metin = 'Bu hafta nasıl geçti? Dört alanı 1 ile 5 arasında puanla.';
  durumEl.dataset.ton = ton;
  durumEl.textContent = metin;
}

function gecisler(d) {
  if (onceki && onceki.hafta === hafta) {
    if (!onceki.ikisi && d.ikisi && !duzenliyor) {
      sonucEl.classList.remove('hk-acildi');
      void sonucEl.offsetWidth;
      sonucEl.classList.add('hk-acildi');
      sfx('match');
    } else if (!onceki.partner && d.partner && !d.ben) {
      sfx('pop');
      toast(`${partnerAdi()} bu haftayı değerlendirdi. Sıra sende.`);
    }
  }
  onceki = { hafta, ikisi: d.ikisi, partner: !!d.partner };
}

function ciz() {
  const harita = haftalaraGore(col.all());
  const d = haftaDurumu(harita, hafta, me.clientId);
  const pAd = partnerAdi();
  aralikEl.textContent = haftaAraligi(hafta);
  hatirlatEl.hidden = !hatirlatmaGoster({ simdi: new Date(), benDoldurdu: !!d.ben });
  formEl.hidden = !!d.ben && !duzenliyor;
  vazgecBtn.hidden = !duzenliyor;
  gonderBtn.textContent = d.ben ? 'Kaydet' : 'Gönder';
  cizDurum(d, pAd);
  cizSonuc(d, pAd);
  cizEgilim(harita, pAd);
  gecisler(d);
}

// ---------- Canlı ----------
notGirdi.addEventListener('input', () => hataGoster(null));
let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Puanların kaydedilip gönderilecek.');
});
col.on('change', ciz);
profil?.on('change', ciz);
room.on('presence', () => ciz());

const zamanKontrol = () => {
  const simdiki = isoHafta(toDay());
  if (simdiki !== hafta) {
    hafta = simdiki;
    duzenliyor = false;
    formuDoldur(null);
  }
  ciz(); // pazar akşamı hatırlatması saatle değişir
};
setInterval(zamanKontrol, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') zamanKontrol(); });

ciz();
