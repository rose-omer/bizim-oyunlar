// Günün Fotoğrafı: her gün birer fotoğraf; ikiniz de gönderince ikisi birden açılır. Saf mantık mantik.js'te.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { toDay } from '../../js/core/gunler.js';
import { pageUrl, writeStore } from '../../js/core/identity.js';
import { h, toast, initial, genitive, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { dosyaSec, fotoMu, fotoKucult, fotoImg, hataMetni } from '../../js/core/foto.js';
import { uploadPhoto } from '../../js/core/storage.js';
import { ikon } from '../anilar/ikon.js';
import { ANI_TASLAK_ANAHTARI } from '../anilar/mantik.js';
import {
  NOT_MAX, docId, gunlereGore, gunDurumu, gorunum, yeniKayit, arsiv, bildirimMetni, aniTaslagi,
} from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'gunfoto', title: 'Günün Fotoğrafı', tab: 'daha' });
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'gf' }, h('p', { class: 'gf-yukleniyor muted', role: 'status' }, 'Fotoğraflar geliyor…')));

const [col, profil] = await Promise.all([
  openCollection(room, 'gunfoto'),
  openProfil(room).catch((e) => { console.warn('[gunfoto] profil açılamadı', e); return null; }),
]);

const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || '';
const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const yerelTarih = (gun) => {
  const [y, m, d] = gun.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const uzunTarih = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const yilliTarih = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
const ayAdi = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });
const kisaGun = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });
const tarihMetni = (gun) => (gun.slice(0, 4) === bugun.slice(0, 4) ? uzunTarih : yilliTarih).format(yerelTarih(gun));
const buyukHarf = (s) => (s ? s[0].toLocaleUpperCase('tr') + s.slice(1) : s);

// ---------- Durum ----------
let bugun = toDay();
let secim = null;       // { blob, url } seçilmiş (küçültülmüş) ama gönderilmemiş fotoğraf
let gonderiliyor = false;
let onceki = null;      // { gun, ikisi, partner }: canlı açılışı yakalamak için

// ---------- İskelet ----------
const tarihEl = h('time', { class: 'gf-tarih' });
const benKare = h('figure', { class: 'gf-kare', dataset: { kim: 'ben' } });
const oKare = h('figure', { class: 'gf-kare', dataset: { kim: 'partner' } });
const ikili = h('div', { class: 'gf-ikili' }, benKare, oKare);
const durumEl = h('p', { class: 'gf-durum', role: 'status' });
const aniYapEl = h('div', { class: 'gf-ani-yap', hidden: true });

const notGirdi = h('input', {
  id: 'gf-not', class: 'input', type: 'text', maxlength: NOT_MAX, autocomplete: 'off', enterkeyhint: 'send',
  placeholder: 'ör. Sabah kahvem ve sen aklımda',
});
const gonderBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Gönder');
const vazgecBtn = h('button', { type: 'button', class: 'btn ghost', onclick: secimBirak }, 'Vazgeç');
const formEl = h('form', { class: 'gf-form', hidden: true, novalidate: true, onsubmit: gonder },
  h('label', { class: 'gf-etiket', for: 'gf-not' }, 'Kısa bir not ', h('span', { class: 'muted' }, '(isteğe bağlı)')),
  notGirdi,
  h('div', { class: 'gf-dugmeler' }, vazgecBtn, gonderBtn));

const arsivEl = h('div', { class: 'gf-aylar' });

app.replaceChildren(h('div', { class: 'gf' },
  h('section', { class: 'gf-bugun', 'aria-labelledby': 'gf-bugun-baslik' },
    h('header', { class: 'gf-bas' }, h('h2', { id: 'gf-bugun-baslik' }, 'Bugün'), tarihEl),
    ikili, durumEl, aniYapEl, formEl),
  h('section', { class: 'gf-arsiv', 'aria-labelledby': 'gf-arsiv-baslik' },
    h('h2', { id: 'gf-arsiv-baslik' }, 'Arşivimiz'), arsivEl)));

// ---------- Anı yap: görünen fotoğraflarla Anılar'da yeni anı formu açılır ----------
function aniYap(gun) {
  const d = gunDurumu(gunlereGore(col.all()), gun, me.clientId);
  const taslak = aniTaslagi(d, gorunum(d, gun, bugun));
  if (!taslak.fotolar.length) return;
  writeStore('session', ANI_TASLAK_ANAHTARI, JSON.stringify(taslak));
  location.href = pageUrl('sayfalar/anilar/', { yeni: 1, taslak: 1, tarih: gun, baslik: 'Günün fotoğrafımız' });
}
const aniYapBtn = (gun) => h('button', {
  type: 'button', class: 'btn ghost small', dataset: { odak: `ani-yap:${gun}` }, onclick: () => aniYap(gun),
}, ikon('kalp'), 'Anı yap');

// ---------- Çizim: bugün ----------
function fotoAlt(kim, ad, gun, not) {
  const kimin = kim === 'ben' ? 'Senin' : genitive(ad);
  return `${kimin} ${tarihMetni(gun)} fotoğrafı${not ? `: ${not}` : ''}`;
}

function altyazi(ad, not, ek = null) {
  return h('figcaption', { class: 'gf-altyazi' },
    h('span', { class: 'gf-altyazi-bas' }, h('span', { class: 'gf-ad' }, ad), ek),
    not ? h('span', { class: 'gf-not' }, not) : null);
}

function acikFoto(kim, ad, f, gun) {
  const img = fotoImg(f.foto, { alt: fotoAlt(kim, ad, gun, f.not), eager: true });
  return h('button', {
    type: 'button', class: 'gf-foto', dataset: { odak: `foto:${kim}:${gun}` }, 'aria-label': `${fotoAlt(kim, ad, gun, f.not)}. Büyüt`,
    onclick: () => buyukAc(gun),
  }, img);
}

function cizBenKare(d, g) {
  if (secim) {
    const img = h('img', { src: secim.url, alt: 'Seçtiğin fotoğrafın önizlemesi', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(h('span', { class: 'gf-onizlemesiz' }, 'Önizleme yok; yine de gönderebilirsin.')));
    benKare.dataset.durum = 'onizleme';
    benKare.replaceChildren(h('div', { class: 'gf-cerceve' }, img), altyazi('Sen', 'Gönderilmedi'));
    return;
  }
  if (g.ben === 'acik') {
    benKare.dataset.durum = 'acik';
    benKare.replaceChildren(h('div', { class: 'gf-cerceve' }, acikFoto('ben', 'Sen', d.ben, bugun)),
      altyazi('Sen', d.ben.not, h('button', {
        type: 'button', class: 'btn ghost small gf-degistir', dataset: { odak: 'sec' }, onclick: sec, 'aria-label': 'Fotoğrafını değiştir',
      }, 'Değiştir')));
    return;
  }
  benKare.dataset.durum = 'bos';
  benKare.replaceChildren(
    h('div', { class: 'gf-cerceve' },
      h('button', { type: 'button', class: 'gf-sec', dataset: { odak: 'sec' }, onclick: sec },
        h('span', { class: 'gf-sec-ikon', 'aria-hidden': 'true' }, ikon('foto')),
        h('span', { class: 'gf-sec-metin' }, 'Fotoğrafını seç'),
        h('span', { class: 'gf-sec-ince' }, 'Bugün ne görüyorsun?'))),
    altyazi('Sen'));
}

function cizOKare(d, g, pAd) {
  oKare.dataset.durum = g.partner;
  if (g.partner === 'acik') {
    oKare.replaceChildren(h('div', { class: 'gf-cerceve' }, acikFoto('partner', pAd, d.partner, bugun)), altyazi(pAd, d.partner.not));
    return;
  }
  if (g.partner === 'kilitli') {
    // Bulanık önizleme: içerik seçilemez, ekran okuyucuya gösterilmez.
    const img = fotoImg(d.partner.foto, { alt: '', eager: true, className: 'gf-bulanik' });
    img.setAttribute('aria-hidden', 'true');
    oKare.replaceChildren(
      h('div', { class: 'gf-cerceve' }, img,
        h('div', { class: 'gf-kilit' },
          h('span', { class: 'gf-kilit-ikon', 'aria-hidden': 'true' }, ikon('kilit')),
          h('span', { class: 'gf-kilit-metin' }, `${pAd} gönderdi`),
          h('span', { class: 'gf-kilit-ince' }, 'Seninki gidince açılır'))),
      altyazi(pAd));
    return;
  }
  oKare.replaceChildren(
    h('div', { class: 'gf-cerceve' },
      h('div', { class: 'gf-bekle' },
        h('span', { class: 'avatar partner', 'aria-hidden': 'true' }, initial(pAd)),
        h('span', { class: 'gf-bekle-metin' }, 'Henüz göndermedi'))),
    altyazi(pAd));
}

function cizDurum(d, g, pAd) {
  let ton = '';
  let metin;
  if (secim) metin = gonderiliyor ? 'Gönderiliyor…' : 'Beğendiysen gönder. İstersen kısa bir not ekle.';
  else if (d.ikisi) { ton = 'acik'; metin = 'İkiniz de gönderdiniz. Bugünün karesi tamam.'; }
  else if (g.partner === 'kilitli') { ton = 'bekliyor'; metin = `${pAd} fotoğrafını gönderdi. Seninkini gönder, ikisi birden açılsın.`; }
  else if (d.ben) metin = `Fotoğrafın gitti. ${pAd} gönderince ikisi birden açılır.`;
  else metin = 'Bugün henüz kimse göndermedi. İlk kare senden olsun.';
  durumEl.dataset.ton = ton;
  durumEl.textContent = metin;
}

function gecisler(d) {
  if (onceki && onceki.gun === bugun) {
    if (!onceki.ikisi && d.ikisi) {
      ikili.classList.remove('gf-acildi');
      void ikili.offsetWidth; // animasyonu yeniden başlat
      ikili.classList.add('gf-acildi');
      sfx('match');
    } else if (!onceki.partner && d.partner && !d.ben) {
      sfx('pop');
      toast(`${partnerAdi()} bugünün fotoğrafını gönderdi. Sıra sende.`);
    }
  }
  onceki = { gun: bugun, ikisi: d.ikisi, partner: !!d.partner };
}

// ---------- Çizim: arşiv ----------
function yarim(f, ad, gun, kim) {
  if (!f) return h('span', { class: 'gf-yarim bos', 'aria-hidden': 'true' }, initial(kim === 'ben' ? benAdi() || 'Sen' : ad));
  return h('span', { class: 'gf-yarim' }, fotoImg(f.foto, { alt: '' }));
}

function gunKarti(g, pAd) {
  const tarih = yerelTarih(g.gun);
  const kimler = g.ikisi ? 'ikinizin fotoğrafı' : g.ben ? 'yalnız senin fotoğrafın' : `yalnız ${genitive(pAd)} fotoğrafı`;
  return h('li', {},
    h('button', {
      type: 'button', class: 'gf-gun', dataset: { ikisi: String(g.ikisi), odak: `gun:${g.gun}` },
      'aria-label': `${tarihMetni(g.gun)}: ${kimler}. Büyüt`, onclick: () => buyukAc(g.gun),
    },
    h('span', { class: 'gf-gun-ikili' }, yarim(g.ben, pAd, g.gun, 'ben'), yarim(g.partner, pAd, g.gun, 'partner')),
    h('span', { class: 'gf-gun-etiket', 'aria-hidden': 'true' },
      h('strong', {}, String(tarih.getDate())), ` ${kisaGun.format(tarih)}`)));
}

function cizArsiv(harita, pAd) {
  const aylar = arsiv(harita, { bugun, benId: me.clientId });
  if (!aylar.length) {
    arsivEl.replaceChildren(h('div', { class: 'gf-bos' },
      h('strong', {}, 'Arşiv henüz boş'),
      h('p', {}, 'Bugünün fotoğrafları yarın burada, yan yana duracak.')));
    return;
  }
  arsivEl.replaceChildren(...aylar.map((a) => {
    const [y, m] = a.ay.split('-').map(Number);
    const baslikId = `gf-ay-${a.ay}`;
    return h('section', { class: 'gf-ay', 'aria-labelledby': baslikId },
      h('div', { class: 'gf-ay-bas' },
        h('h3', { id: baslikId }, buyukHarf(ayAdi.format(new Date(y, m - 1, 1)))),
        h('span', { class: 'gf-ay-sayi' }, a.ortak ? `${a.ortak} gün ikiniz de` : `${a.gunler.length} gün`)),
      h('ol', { class: 'gf-izgara' }, a.gunler.map((g) => gunKarti(g, pAd))));
  }));
}

function ciz() {
  const odakEl = document.activeElement;
  const odak = odakEl?.dataset?.odak || null;
  const harita = gunlereGore(col.all());
  const d = gunDurumu(harita, bugun, me.clientId);
  const g = gorunum(d, bugun, bugun);
  const pAd = partnerAdi();
  tarihEl.dateTime = bugun;
  tarihEl.textContent = buyukHarf(uzunTarih.format(yerelTarih(bugun)));
  cizBenKare(d, g);
  cizOKare(d, g, pAd);
  cizDurum(d, g, pAd);
  formEl.hidden = !secim;
  aniYapEl.hidden = !d.ikisi || !!secim;
  aniYapEl.replaceChildren(...(aniYapEl.hidden ? [] : [aniYapBtn(bugun)]));
  cizArsiv(harita, pAd);
  gecisler(d);
  buyukTazele?.();
  if (odak && !odakEl.isConnected) odakla(odak);
}

/** data-odak anahtarlı düğmeye odaklan (yeniden çizimden sonra). */
function odakla(anahtar) {
  document.querySelector(`.gf [data-odak="${CSS.escape(anahtar)}"]`)?.focus({ preventScroll: true });
}

// ---------- Seç ve gönder ----------
async function sec() {
  if (gonderiliyor) return;
  const files = await dosyaSec({ coklu: false });
  const file = files[0];
  if (!file) return;
  if (!fotoMu(file)) {
    toast('Bu bir fotoğraf değil gibi. Lütfen bir fotoğraf seç.');
    return;
  }
  // Hemen küçült: Android'de seçilen dosya bir süre sonra okunamaz olabiliyor.
  let blob;
  try {
    ({ blob } = await fotoKucult(file));
  } catch (err) {
    toast(hataMetni(err, file));
    return;
  }
  if (secim) URL.revokeObjectURL(secim.url);
  secim = { blob, url: URL.createObjectURL(blob) };
  ciz();
  notGirdi.value = '';
  notGirdi.focus({ preventScroll: true });
  formEl.scrollIntoView({ block: 'nearest', behavior: azHareket() ? 'auto' : 'smooth' });
}

function secimBirak() {
  if (gonderiliyor) return;
  if (secim) URL.revokeObjectURL(secim.url);
  secim = null;
  notGirdi.value = '';
  ciz();
  odakla('sec');
}

async function gonder(e) {
  e.preventDefault();
  if (!secim || gonderiliyor) return;
  const gun = toDay(); // seçimden sonra gün değiştiyse yeni güne yazılır
  const kontrol = yeniKayit({ foto: 'yer-tutucu', not: notGirdi.value });
  if (kontrol.hata) {
    notGirdi.setAttribute('aria-invalid', 'true');
    toast(kontrol.hata);
    return;
  }
  notGirdi.removeAttribute('aria-invalid');
  const once = gunDurumu(gunlereGore(col.all()), gun, me.clientId);
  gonderiliyor = true;
  gonderBtn.disabled = true;
  vazgecBtn.disabled = true;
  formEl.setAttribute('aria-busy', 'true');
  gonderBtn.textContent = 'Gönderiliyor…';
  ciz();
  try {
    const url = await uploadPhoto(secim.blob, roomId).catch((e) => { throw new Error(hataMetni(e)); });
    const r = yeniKayit({ foto: url, not: notGirdi.value });
    await col.put(r.data, docId(gun, me.clientId));
  } catch (err) {
    toast(err?.message || 'Gönderilemedi. Bağlantını kontrol edip tekrar dene.');
    return;
  } finally {
    gonderiliyor = false;
    gonderBtn.disabled = false;
    vazgecBtn.disabled = false;
    formEl.removeAttribute('aria-busy');
    gonderBtn.textContent = 'Gönder';
    ciz(); // hata olursa "Gönderiliyor…" durumu kalmasın
  }
  URL.revokeObjectURL(secim.url);
  secim = null;
  notGirdi.value = '';
  bugun = gun; // gece yarısını geçen gönderim: ekran da yeni güne geçer
  if (!once.partner) sfx('pop'); // partner göndermişse açılışta 'match' çalar
  if (once.ben) toast('Fotoğrafın değişti');
  ciz();
  odakla('sec');
  if (!once.ben && !partnerGoruyor(room.partner?.(), 'gunfoto')) {
    const b = bildirimMetni({ benAd: benAdi(), partnerGonderdi: !!once.partner });
    bildir(roomId, { tur: 'ani', ...b, url: 'sayfalar/gunfoto/' })
      .catch((err) => console.warn('[gunfoto] bildirim gönderilemedi', err));
  }
}

// ---------- Büyük görünüm ----------
let buyukTazele = null;

/** Gezilebilir günler: arşiv (yeniden eskiye) ve açık olan bugün. */
function gezilecekGunler(harita) {
  const gunler = arsiv(harita, { bugun, benId: me.clientId }).flatMap((a) => a.gunler.map((g) => g.gun));
  const d = gunDurumu(harita, bugun, me.clientId);
  if (d.ben || d.partner) gunler.unshift(bugun);
  return gunler;
}

function buyukAc(baslangic) {
  const onceOdak = document.activeElement;
  let gun = baslangic;
  const baslik = h('h2', { id: 'gf-buyuk-baslik', class: 'gf-buyuk-baslik' });
  const govde = h('div', { class: 'gf-buyuk-govde' });
  const geri = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Daha yeni gün', onclick: () => git(-1) }, ikon('sol'));
  const ileri = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Daha eski gün', onclick: () => git(1) }, ikon('sag'));
  const kapat = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onclick: () => dlg.close() }, ikon('kapat'));
  const dlg = h('dialog', { class: 'gf-buyuk', 'aria-labelledby': 'gf-buyuk-baslik' },
    h('div', { class: 'gf-buyuk-kart' },
      h('header', { class: 'gf-buyuk-bas' }, baslik, h('div', { class: 'gf-buyuk-gez' }, geri, ileri, kapat)),
      govde));

  function tek(kim, ad, f, gorunurluk) {
    if (gorunurluk === 'acik') {
      return h('figure', { class: 'gf-buyuk-foto' },
        fotoImg(f.foto, { alt: fotoAlt(kim, ad, gun, f.not), eager: true }),
        h('figcaption', {}, h('strong', {}, ad), f.not ? h('span', {}, f.not) : null));
    }
    let metin = kim === 'ben' ? 'Bu gün fotoğraf göndermedin.' : 'Bu gün fotoğraf yok.';
    if (gorunurluk === 'kilitli') metin = 'Seninki gidince açılır.';
    else if (gun === bugun) metin = kim === 'ben' ? 'Henüz göndermedin.' : 'Henüz göndermedi.';
    return h('figure', { class: 'gf-buyuk-foto bos' },
      h('div', { class: 'gf-buyuk-yok' }, metin),
      h('figcaption', {}, h('strong', {}, ad)));
  }

  function boya() {
    const harita = gunlereGore(col.all());
    const liste = gezilecekGunler(harita);
    if (!liste.includes(gun)) liste.push(gun);
    const i = liste.indexOf(gun);
    const d = gunDurumu(harita, gun, me.clientId);
    const g = gorunum(d, gun, bugun);
    baslik.textContent = gun === bugun ? 'Bugün' : buyukHarf(tarihMetni(gun));
    govde.replaceChildren(tek('ben', 'Sen', d.ben, g.ben), tek('partner', partnerAdi(), d.partner, g.partner));
    if (g.ben === 'acik' || g.partner === 'acik') govde.append(h('div', { class: 'gf-ani-yap' }, aniYapBtn(gun)));
    geri.disabled = i <= 0;
    ileri.disabled = i >= liste.length - 1;
    return liste;
  }
  function git(yon) {
    const liste = gezilecekGunler(gunlereGore(col.all()));
    const i = liste.indexOf(gun);
    const hedef = liste[i + yon];
    if (!hedef) return;
    gun = hedef;
    boya();
  }
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { git(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { git(1); e.preventDefault(); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => {
    buyukTazele = null;
    dlg.remove();
    if (onceOdak?.isConnected) onceOdak.focus({ preventScroll: true });
  });
  buyukTazele = boya;
  boya();
  document.body.append(dlg);
  dlg.showModal();
  kapat.focus({ preventScroll: true });
}

// ---------- Canlı ----------
notGirdi.addEventListener('input', () => notGirdi.removeAttribute('aria-invalid'));
let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Fotoğrafın kaydedilip gönderilecek.');
});
col.on('change', ciz);
profil?.on('change', ciz);
room.on('presence', () => ciz());

const gunKontrol = () => {
  if (toDay() === bugun) return;
  bugun = toDay();
  ciz();
};
setInterval(gunKontrol, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') gunKontrol(); });

ciz();
