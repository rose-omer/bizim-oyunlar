// Yılımız: seçilen yılın kaydırmalı kart hikâyesi ve paylaşılabilir görseli.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { gameById } from '../../js/core/games.js';
import { pageUrl } from '../../js/core/identity.js';
import { toDay } from '../../js/core/gunler.js';
import { skorlar } from '../../js/core/skor.js';
import { h, icon, toast, knownPartner, pairEl, touchByTur } from '../../js/core/ui.js';
import { yillar as aniYillari } from '../anilar/mantik.js';
import {
  sayiYaz, yilSecenekleri, varsayilanYil, yilOzeti, hikayeKartlari, gorselOzeti,
} from './mantik.js';
import { geriYukle, ilerlemeOrani } from './yukle.js';
import { gorselCiz, paylasVeyaIndir, dosyaPaylasilir } from './gorsel.js';
import { simgeSvg } from './simgeler.js';
import { kitapKur } from './kitap.js';
import { kitapParametreleri } from './kitap-mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'yilimiz', title: 'Yılımız', tab: 'daha' });
const app = document.getElementById('app');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

const durumMetni = h('p', { class: 'yl-durum-metin' }, 'Yılınız hazırlanıyor…');
const cubuk = h('span', { class: 'yl-cubuk-dolu' });
const cubukKap = h('span', { class: 'yl-cubuk', role: 'progressbar', 'aria-label': 'Yükleniyor', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, cubuk);
const durumEl = h('div', { class: 'yl-durum', role: 'status' }, durumMetni, cubukKap);
const yilSec = h('div', { class: 'seg yl-yillar', role: 'group', 'aria-label': 'Yıl seç' });
const serit = h('div', { class: 'yl-serit', tabindex: '0', 'aria-label': 'Kartlar. Yana kaydırın.' });
const parcalar = h('div', { class: 'yl-parcalar', 'aria-hidden': 'true' });
const canli = h('p', { class: 'sr-only', 'aria-live': 'polite' });
const geriBtn = h('button', { type: 'button', class: 'icon-btn yl-ok', 'aria-label': 'Önceki kart', onclick: () => git(aktif - 1) }, icon('back'));
const ileriBtn = h('button', { type: 'button', class: 'icon-btn yl-ok', 'aria-label': 'Sonraki kart', onclick: () => git(aktif + 1) }, icon('chevron'));
const hikaye = h('section', { class: 'yl-hikaye', 'aria-label': 'Yılın hikâyesi', hidden: true },
  parcalar, serit, h('div', { class: 'yl-gezinti' }, geriBtn, canli, ileriBtn));

const yonlendir = (yol, baslik, alt, simge) => h('a', { class: 'card-row', href: pageUrl(yol) },
  h('span', { class: 'card-row-tile yl-yon-ikon', html: simgeSvg(simge, 1.5) }),
  h('span', {}, h('span', { class: 'card-row-title' }, baslik), h('span', { class: 'card-row-sub' }, alt)),
  h('span', { class: 'yl-yon-ok' }, icon('chevron')));
const kitapBtn = h('button', { type: 'button', class: 'card-row yl-kitap-ac', disabled: true, onclick: () => kitabiAc() },
  h('span', { class: 'card-row-tile yl-yon-ikon', html: simgeSvg('kitap', 1.5) }),
  h('span', {}, h('span', { class: 'card-row-title' }, 'Kitap olarak aç'), h('span', { class: 'card-row-sub' }, 'Yılınız sayfa sayfa. Yazdırın ya da PDF yapın.')),
  h('span', { class: 'yl-yon-ok' }, icon('chevron')));
const baglantilar = h('nav', { class: 'card card-list yl-baglantilar', 'aria-label': 'Daha fazlası' },
  kitapBtn,
  yonlendir('sayfalar/gunfoto/', 'Günün Fotoğrafı', 'Her günün karesi, yan yana.', 'resim'),
  yonlendir('sayfalar/mektup/', 'Mektuplar', 'Birbirinize yazdıklarınız ve kapsüller.', 'zarf'),
  yonlendir('sayfalar/sohbet-ozeti/', 'Sohbet Özetimiz', 'WhatsApp sohbetinizin özeti.', 'balon'),
  yonlendir('sayfalar/rozetler/', 'Rozetlerimiz', 'Birlikte açtıklarınız ve sıradakiler.', 'madalya'),
  yonlendir('sayfalar/skor/', 'Skor Tablosu', 'Oyun oyun kim kaç kez kazandı.', 'kupa'));

const ana = h('div', { class: 'yl' }, yilSec, durumEl, hikaye, baglantilar);
app.replaceChildren(ana);

// ---------- Veri ----------
const bugun = toDay(new Date());
const [profil, gsCol, aniCol, mesajCol, dokunusCol, skorHarita, fotoCol, mektupCol] = await Promise.all([
  openProfil(room).catch((e) => { console.warn('[yilimiz] profil', e); return null; }),
  openCollection(room, 'gs'),
  openCollection(room, 'ani'),
  openCollection(room, 'mesaj', { recent: 200 }),
  openCollection(room, 'dokunus', { recent: 200 }),
  skorlar(room),
  openCollection(room, 'gunfoto'),
  openCollection(room, 'mektup'),
]);
let sonHata = 0;
for (const c of [gsCol, aniCol, mesajCol, dokunusCol, fotoCol, mektupCol]) {
  c.on('error', (e) => { if (Date.now() - sonHata > 15000) { sonHata = Date.now(); toast(e.message); } });
}

const baslangic = () => profil?.cift()?.baslangic || null;
function kisiler(ozet) {
  const p = profil?.partner() || null;
  const canliP = room.partner?.() || null;
  const bilinen = knownPartner(roomId);
  let pId = p?.clientId || canliP?.clientId || bilinen?.clientId || null;
  if (!pId && ozet) {
    const say = { ...ozet.mesaj.kisiler };
    delete say[me.clientId];
    pId = Object.entries(say).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  return [
    { id: me.clientId, ad: profil?.ben()?.ad || me.name || 'Sen', foto: profil?.ben()?.foto || null },
    { id: pId, ad: p?.ad || canliP?.name || bilinen?.name || 'Sevgilin', foto: p?.foto || null },
  ];
}

// ---------- Yıl seçimi ----------
const secenekler = yilSecenekleri({ baslangic: baslangic(), bugun, ekYillar: aniYillari(aniCol.all()) });
const ilkParam = kitapParametreleri(location.search);
let secili = secenekler.includes(ilkParam.yil) ? ilkParam.yil : varsayilanYil(secenekler, bugun);
let sonVeri = null; // son yüklenen yıl: { yil, ozet, kisiler, mesajlar } (Anı Kitabı bunu kullanır)
let kitap = null; // açık kitap: { el, temizle, gecmiste }
let bekleyenKitap = ilkParam.kitap; // ?kitap=1 ile gelindi: yıl yüklenince aç
let gunCol = null;
function yillariCiz() {
  yilSec.replaceChildren(...secenekler.map((y) => h('button', {
    type: 'button', 'aria-pressed': String(y === secili),
    onclick: () => { if (y !== secili) { secili = y; yillariCiz(); hazirla(y); } },
  }, String(y))));
  yilSec.hidden = secenekler.length < 2;
}
yillariCiz();

// ---------- Yükleme (sırayla: aynı koleksiyona eşzamanlı loadOlder gitmesin) ----------
let sira = Promise.resolve();
let durumZaman = 0;
function durumGoster(metin, oran = null) {
  durumMetni.textContent = metin;
  cubukKap.hidden = oran === null;
  if (oran !== null) {
    cubuk.style.transform = `scaleX(${oran.toFixed(3)})`;
    cubukKap.setAttribute('aria-valuenow', String(Math.round(oran * 100)));
  }
}
function hazirla(yil) {
  kitapBtn.disabled = true;
  hikaye.setAttribute('aria-busy', 'true');
  clearTimeout(durumZaman);
  durumZaman = setTimeout(() => { durumEl.hidden = false; }, 250); // hızlı yüklemede yanıp sönmesin
  durumGoster('Yılınız hazırlanıyor…', 0);
  sira = sira.then(() => yukle(yil)).catch((e) => {
    console.error(e);
    durumGoster('Yüklenemedi. Bağlantını kontrol edip sayfayı yenile.');
    durumEl.hidden = false;
  });
}

async function yukle(yil) {
  if (yil !== secili) return;
  const kadar = new Date(yil, 0, 1).getTime();
  const simdi = Date.now();
  const vazgec = () => yil !== secili; // yıl değişti: bu yüklemeyi bırak
  const m = await geriYukle(mesajCol, {
    kadar,
    yeter: vazgec,
    ilerleme: ({ sayi, enEski }) => {
      if (yil === secili) durumGoster(`Mesajlarınız okunuyor… ${sayiYaz(sayi)}`, ilerlemeOrani(enEski, kadar, simdi));
    },
  });
  const d = await geriYukle(dokunusCol, { kadar, yeter: vazgec });
  if (yil !== secili) return;
  const veri = {
    baslangic: baslangic(), mesajlar: m.docs, dokunuslar: d.docs, anilar: aniCol.all(), gs: gsCol.all(),
    skor: skorHarita, mesajAsildi: m.asildi, gunfoto: fotoCol.all(), mektuplar: mektupCol.all(),
  };
  let k = kisiler(null);
  let ozet = yilOzeti(veri, { yil, bugun, ids: k.map((x) => x.id) });
  if (!k[1].id) { k = kisiler(ozet); ozet = yilOzeti(veri, { yil, bugun, ids: k.map((x) => x.id) }); }
  clearTimeout(durumZaman);
  durumEl.hidden = true;
  ciz(ozet, k);
  sonVeri = { yil, ozet, kisiler: k, mesajlar: m.docs };
  kitapBtn.disabled = false;
  if (bekleyenKitap) { bekleyenKitap = false; kitabiAc({ push: false }); }
}

// ---------- Kartlar ----------
// Kartın köşesindeki soluk motif (simgeler.js).
const MOTIF = {
  kapak: 'kalp', mesaj: 'balon', tepki: 'isilti', gece: 'ay', ani: 'foto', soru: 'soru',
  oyun: 'zar', dokunus: 'dokunus', taslar: 'bayrak', bos: 'tuy', paylas: 'paylas', gunfoto: 'resim', mektup: 'zarf',
};

function baslikEl(k) {
  const el = h('h2', { class: 'yl-kart-baslik' });
  const i = k.vurgu ? k.baslik.indexOf(k.vurgu) : -1;
  if (i < 0) el.textContent = k.baslik;
  else el.append(k.baslik.slice(0, i), h('span', { class: 'yl-vurgu' }, k.vurgu), k.baslik.slice(i + k.vurgu.length));
  return el;
}

let gorsel = null; // { yil, blob, url }
function paylasimParcasi(ozet, k) {
  const img = h('img', { class: 'yl-onizleme', alt: `${ozet.yil} özet görseli`, width: '1080', height: '1350', hidden: true });
  const paylasilir = dosyaPaylasilir();
  const ikon = h('span', { class: 'yl-btn-ikon', html: simgeSvg(paylasilir ? 'paylas' : 'indir', 2) });
  const btn = h('button', { type: 'button', class: 'btn primary wide', disabled: true },
    ikon, paylasilir ? 'Görseli paylaş' : 'Görseli indir');
  const hazir = (async () => {
    if (gorsel?.yil !== ozet.yil) {
      if (gorsel?.url) URL.revokeObjectURL(gorsel.url);
      const blob = await gorselCiz(gorselOzeti(ozet, { kisiler: k }));
      gorsel = { yil: ozet.yil, blob, url: URL.createObjectURL(blob) };
    }
    img.src = gorsel.url;
    img.hidden = false;
    btn.disabled = false;
  })().catch((e) => { console.error(e); btn.textContent = 'Görsel hazırlanamadı'; });
  btn.addEventListener('click', async () => {
    await hazir;
    if (!gorsel) return;
    btn.disabled = true;
    try {
      const r = await paylasVeyaIndir(gorsel.blob, { ad: `biz-ikimiz-${ozet.yil}.png`, baslik: `${ozet.yil} · Biz İkimiz` });
      if (r === 'indirildi') toast('Görsel indirildi.');
    } finally {
      btn.disabled = false;
    }
  });
  return h('div', { class: 'yl-paylas' }, h('div', { class: 'yl-onizleme-kap' }, img), btn);
}

function kartEl(k, i, n, ozet, kisi) {
  const kart = h('article', {
    class: 'yl-kart', dataset: { ton: String(k.ton), id: k.id },
    'aria-roledescription': 'kart', 'aria-label': `${i + 1} / ${n}`,
  });
  kart.append(h('span', { class: 'yl-motif', html: simgeSvg(MOTIF[k.id], 1.25) }));
  const govde = h('div', { class: 'yl-govde' });
  if (k.id === 'kapak') {
    govde.append(pairEl({ meName: kisi[0].ad, partnerName: kisi[1].ad, meFoto: kisi[0].foto, partnerFoto: kisi[1].foto, link: 'on' }));
  }
  govde.append(baslikEl(k));
  if (k.satirlar.length) govde.append(h('ul', { class: 'yl-satirlar', role: 'list' }, k.satirlar.map((s) => h('li', {}, s))));
  if (k.liste?.length) {
    govde.append(h('ol', { class: 'yl-taslar', role: 'list' }, k.liste.map((x) => h('li', {},
      h('span', { class: 'yl-tas-ad' }, x.sol), h('span', { class: 'yl-tas-tarih' }, x.sag)))));
  }
  if (k.not) govde.append(h('p', { class: 'yl-not' }, k.not));
  if (k.eylem) govde.append(h('a', { class: 'btn small yl-kart-git', href: pageUrl(k.eylem.yol) }, k.eylem.metin));
  if (k.id === 'paylas') govde.append(paylasimParcasi(ozet, kisi));
  kart.append(govde, h('p', { class: 'yl-folyo', 'aria-hidden': 'true' },
    h('span', {}, String(ozet.yil)), h('span', {}, `${i + 1} / ${n}`)));
  return kart;
}

let aktif = 0;
function ciz(ozet, kisi) {
  const kartlar = hikayeKartlari(ozet, {
    kisiler: kisi,
    oyunAdi: (id) => gameById(id)?.title || id,
    dokunusAdi: (tur) => touchByTur(tur)?.label || tur,
  });
  serit.replaceChildren(...kartlar.map((k, i) => kartEl(k, i, kartlar.length, ozet, kisi)));
  parcalar.replaceChildren(...kartlar.map(() => h('span', {})));
  hikaye.hidden = false;
  hikaye.removeAttribute('aria-busy');
  hikaye.setAttribute('aria-label', `${ozet.yil} hikâyesi`);
  serit.scrollTo({ left: 0 });
  aktif = 0;
  isaretle();
}

function adim() {
  const a = serit.children[0];
  const b = serit.children[1];
  return a && b ? b.offsetLeft - a.offsetLeft : serit.clientWidth || 1;
}
function isaretle() {
  const n = serit.children.length;
  [...parcalar.children].forEach((p, i) => p.classList.toggle('dolu', i <= aktif));
  geriBtn.disabled = aktif <= 0;
  ileriBtn.disabled = aktif >= n - 1;
  canli.textContent = n ? `Kart ${aktif + 1} / ${n}` : '';
}
function git(i) {
  const n = serit.children.length;
  const hedef = Math.max(0, Math.min(n - 1, i));
  serit.scrollTo({ left: hedef * adim(), behavior: REDUCED.matches ? 'auto' : 'smooth' });
}
let kare = 0;
serit.addEventListener('scroll', () => {
  cancelAnimationFrame(kare);
  kare = requestAnimationFrame(() => {
    const i = Math.round(serit.scrollLeft / adim());
    if (i !== aktif) { aktif = i; isaretle(); }
  });
}, { passive: true });
serit.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); git(aktif + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); git(aktif - 1); }
});

hazirla(secili);
// Ad, fotoğraf ya da başlangıç sonradan gelirse yeniden kur (presence değişimleri kaydırmayı sıfırlamasın).
const imza = () => JSON.stringify([kisiler(null).map((x) => [x.id, x.ad, x.foto]), baslangic()]);
let sonImza = imza();
profil?.on('change', () => {
  const y = imza();
  if (y === sonImza) return;
  sonImza = y;
  if (gorsel?.url) URL.revokeObjectURL(gorsel.url);
  gorsel = null;
  hazirla(secili);
});

// ---------- Anı Kitabı (aynı sayfada; adres ?kitap=1&yil=YYYY, geri tuşu kitabı kapatır) ----------
const kitapAdresi = (acik) => pageUrl('sayfalar/yilimiz/', acik ? { kitap: 1, yil: secili } : {});

/** push: adres geçmişine kitap girişi ekle. gecmiste: kitabın altında sayfanın kendi girişi var (geri tuşu kapatır). */
async function kitabiAc({ push = true, gecmiste = push } = {}) {
  if (kitap || !sonVeri || sonVeri.yil !== secili) return;
  kitapBtn.disabled = true;
  try {
    gunCol ||= openCollection(room, 'gun');
    const gunler = (await gunCol).all();
    const kisiDocs = [profil?.ben(), profil?.partner()].filter((k) => k?.clientId).map((k) => ({ id: k.clientId, data: k }));
    const k = kitapKur({ ...sonVeri, anilar: aniCol.all(), gunler, kisiDocs, baslangic: baslangic() }, { kapat: kitabiKapat });
    kitap = { ...k, gecmiste };
    if (push) history.pushState({ kitap: secili }, '', kitapAdresi(true));
    ana.hidden = true;
    app.append(k.el);
    scrollTo({ top: 0 });
    k.el.querySelector('.kt-geri')?.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    gunCol = null;
    toast('Kitap hazırlanamadı. Biraz sonra yeniden dene.');
  } finally {
    kitapBtn.disabled = false;
  }
}
function kitabiKapat({ gecmisten = false } = {}) {
  if (!kitap) return;
  if (kitap.gecmiste && !gecmisten) { history.back(); return; } // popstate kapatır
  if (!kitap.gecmiste && !gecmisten) history.replaceState(null, '', kitapAdresi(false));
  kitap.temizle();
  kitap.el.remove();
  kitap = null;
  ana.hidden = false;
  kitapBtn.focus({ preventScroll: true });
}
addEventListener('popstate', () => {
  const p = kitapParametreleri(location.search);
  if (!p.kitap && kitap) kitabiKapat({ gecmisten: true });
  else if (p.kitap && !kitap && p.yil === secili) kitabiAc({ push: false, gecmiste: true });
});
