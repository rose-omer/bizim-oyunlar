// Sohbet Özetimiz: WhatsApp dışa aktarımı telefonda, bellekte işlenir; odaya yalnız sayılar gider (belge 'sohbetozet'/'bizim').
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection, checkData } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { h, toast, confirmDialog, avatarEl, pairEl, knownPartner } from '../../js/core/ui.js';
import { gunYazi } from '../anilar/mantik.js';
import { sayiYaz } from '../yilimiz/mantik.js';
import { simgeSvg } from '../yilimiz/simgeler.js';
import { dosyaMetni } from './zip.js';
import { ayristirParcali, yazanlar } from './ayristir.js';
import { hesaplaParcali, taraflar } from './hesapla.js';
import { rozetler } from './rozet.js';
import {
  sureYaz, cevapYaz, ilkler, kategoriler, yillar, aylikSeri, isiHaritasi, kisaAy,
} from './gorunum.js';

const { room, roomId, me } = await bootPage({ ns: 'sohbetozet', title: 'Sohbet Özetimiz', tab: 'daha' });
const app = document.getElementById('app');
const BELGE = 'bizim';
const MAX_DOSYA = 80 * 1024 * 1024;

const [col, profil] = await Promise.all([
  openCollection(room, 'sohbetozet'),
  openProfil(room).catch((e) => { console.warn('[sohbetozet] profil', e); return null; }),
]);
let sonHata = 0;
col.on('error', (e) => { if (Date.now() - sonHata > 15000) { sonHata = Date.now(); toast(e.message); } });

// ---------- Simgeler (yilimiz/simgeler.js + birkaç ek; aynı çizgi ailesi) ----------
const EK_SIMGE = {
  simsek: '<path d="M13 3.5 5.5 13.5H11l-1 7 7.5-10H12z"/>',
  gunes: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  gulus: '<circle cx="12" cy="12" r="8.5"/><path d="M8 13.5a4.5 4.5 0 0 0 8 0z"/><path d="M8.5 9.5h.01M15.5 9.5h.01"/>',
  yildiz: '<path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7z"/>',
  tac: '<path d="M4 17.5 3 8l5 4 4-6.5 4 6.5 5-4-1 9.5z"/><path d="M4.5 20.5h15"/>',
  yukle: '<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  saat: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  chevron: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
};
const simge = (ad, kalinlik = 1.75) => (EK_SIMGE[ad]
  ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${kalinlik}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${EK_SIMGE[ad]}</svg>`
  : simgeSvg(ad, kalinlik));
const simgeEl = (ad, cls = 'so-simge') => h('span', { class: cls, html: simge(ad) });

// ---------- Kişiler ----------
function partnerId() {
  return profil?.partner()?.clientId || room.partner?.()?.clientId || knownPartner(roomId)?.clientId || null;
}
/** Ekrandaki iki kişi: [{ id, ad, foto, renk, cls }] (ben, partner). */
function kisiler(ozet) {
  const [b, p] = taraflar(ozet, me.clientId);
  const ben = profil?.ben();
  const par = profil?.partner();
  const bilinen = knownPartner(roomId);
  return [
    { id: b, ad: ben?.ad || me.name || 'Sen', foto: ben?.foto || null, renk: ben?.renk || null, cls: 'me' },
    { id: p, ad: par?.ad || bilinen?.name || 'Sevgilin', foto: par?.foto || null, renk: par?.renk || null, cls: 'partner' },
  ];
}
const renkStil = (k) => {
  const s = {};
  if (/^#[0-9a-f]{6}$/i.test(k[0].renk || '')) s['--ben'] = k[0].renk;
  if (/^#[0-9a-f]{6}$/i.test(k[1].renk || '')) s['--partner'] = k[1].renk;
  return s;
};

// ---------- Durum ----------
// akis: null | { adim: 'okuma'|'secim'|'hesap'|'onizleme'|'hata', ... }
let akis = null;
const dosyaInput = h('input', {
  type: 'file', accept: '.txt,.zip,text/plain,application/zip', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true',
  onchange: () => { const f = dosyaInput.files?.[0]; dosyaInput.value = ''; if (f) dosyaIsle(f); },
});
document.body.append(dosyaInput);
const dosyaSec = () => dosyaInput.click();

const kayitli = () => col.get(BELGE)?.data || null;

function ciz() {
  let govde;
  if (akis) govde = akisEl();
  else if (kayitli()?.kisi) govde = ozetEl(kayitli(), { onizleme: false });
  else govde = bosEl();
  app.replaceChildren(h('div', { class: 'so' }, govde));
}

col.on('change', () => { if (!akis) ciz(); });
profil?.on('change', () => { if (!akis || akis.adim === 'onizleme') ciz(); });

// ---------- Boş durum ----------
function nasilEl() {
  return h('div', { class: 'so-nasil' },
    h('div', { class: 'so-nasil-blok' },
      h('h3', {}, 'Android'),
      h('p', {}, 'Sohbeti aç › ⋮ › Daha fazla › Sohbeti dışa aktar › ', h('b', {}, 'Medya olmadan'), '.')),
    h('div', { class: 'so-nasil-blok' },
      h('h3', {}, 'iPhone'),
      h('p', {}, 'Sohbette kişinin adına dokun › Sohbeti Dışa Aktar › ', h('b', {}, 'Medya Ekleme'), '.')),
    h('p', { class: 'so-nasil-son' }, 'Dosyayı telefona kaydet, sonra buradan seç.'));
}
function gizlilikEl() {
  return h('p', { class: 'so-gizlilik' }, simgeEl('kilit'), 'Mesajlarınız telefondan çıkmaz; yalnız sayılar kaydedilir.');
}
function bosEl() {
  return h('section', { class: 'so-bos', 'aria-labelledby': 'so-bos-baslik' },
    h('span', { class: 'so-bos-ikon', html: simge('balon', 1.5) }),
    h('h2', { class: 'so-bos-baslik', id: 'so-bos-baslik' }, 'WhatsApp sohbetinizi yükleyin'),
    h('p', { class: 'so-bos-alt' }, 'Kim daha çok yazdı, ilk “seviyorum” ne zamandı, en uzun seriniz kaç gün? Hepsi tek özette.'),
    nasilEl(),
    h('button', { type: 'button', class: 'btn primary wide', onclick: dosyaSec }, simgeEl('yukle', 'so-btn-ikon'), 'Dosya seç'),
    gizlilikEl());
}

// ---------- Yükleme akışı ----------
const bekle = () => new Promise((r) => setTimeout(r, 0));

async function dosyaIsle(file) {
  if (file.size > MAX_DOSYA) { akis = { adim: 'hata', metin: 'Bu dosya çok büyük. Medyasız dışa aktarmayı dene.' }; ciz(); return; }
  akis = { adim: 'okuma', metin: 'Dosya açılıyor…', oran: 0 };
  ciz();
  try {
    let metin = await dosyaMetni(file);
    akisGuncelle('Mesajlar okunuyor…', 0);
    const ayr = await ayristirParcali(metin, { ilerleme: (o) => akisGuncelle('Mesajlar okunuyor…', o) });
    metin = null;
    if (!ayr.bicim || !ayr.mesajlar.length) {
      akis = { adim: 'hata', metin: 'Bu dosyada WhatsApp mesajı bulamadık. Dışa aktardığın .txt ya da .zip dosyasını seç.' };
      ciz();
      return;
    }
    const adlar = yazanlar(ayr.mesajlar);
    if (adlar.length < 2) {
      akis = { adim: 'hata', metin: 'Dosyada iki kişi bulamadık. İkinizin sohbetini dışa aktardığından emin ol.' };
      ciz();
      return;
    }
    akis = { adim: 'secim', ayr, adlar: adlar.slice(0, 2), grup: adlar.length > 2 };
    ciz();
  } catch (e) {
    console.error(e);
    akis = { adim: 'hata', metin: e?.message && /ZIP|tarayıcı/.test(e.message) ? e.message : 'Dosya okunamadı. Başka bir dosya dene.' };
    ciz();
  }
}

let durumMetin = null;
let durumCubuk = null;
let durumKap = null;
function akisGuncelle(metin, oran) {
  if (!akis || (akis.adim !== 'okuma' && akis.adim !== 'hesap')) return;
  akis.metin = metin;
  akis.oran = oran;
  if (durumMetin) durumMetin.textContent = metin;
  if (durumCubuk) durumCubuk.style.transform = `scaleX(${Math.max(0, Math.min(1, oran)).toFixed(3)})`;
  durumKap?.setAttribute('aria-valuenow', String(Math.round(oran * 100)));
}

async function sec(benimAdim) {
  const { ayr, adlar } = akis;
  const digeri = adlar.find((x) => x.ad !== benimAdim).ad;
  const eslesme = { [benimAdim]: me.clientId, [digeri]: partnerId() || 'partner' };
  akis = { adim: 'hesap', metin: 'Özetiniz hazırlanıyor…', oran: 0 };
  ciz();
  await bekle();
  try {
    const ozet = await hesaplaParcali(ayr, eslesme, {
      yukleyen: me.clientId,
      ilerleme: (o) => akisGuncelle('Özetiniz hazırlanıyor…', o),
    });
    const hata = checkData(ozet);
    if (hata) throw new Error(hata);
    akis = { adim: 'onizleme', ozet };
    ciz();
    scrollTo({ top: 0 });
  } catch (e) {
    console.error(e);
    akis = { adim: 'hata', metin: 'Özet hazırlanamadı. Başka bir dosya dene.' };
    ciz();
  }
}

async function kaydet(btn) {
  const { ozet } = akis;
  if (kayitli()) {
    const tamam = await confirmDialog('Var olan özetiniz bu dosyanınkiyle değişecek. Devam edelim mi?', { ok: 'Değiştir', cancel: 'Vazgeç' });
    if (!tamam) return;
  }
  btn.disabled = true;
  try {
    await col.put({ ...ozet, at: new Date().toISOString() }, BELGE);
    akis = null;
    ciz();
    scrollTo({ top: 0 });
    toast('Özetiniz kaydedildi. Sevgilin de görecek.');
  } catch (e) {
    console.error(e);
    btn.disabled = false;
    toast(e?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
  }
}
function vazgec() {
  akis = null;
  ciz();
  scrollTo({ top: 0 });
}

function akisEl() {
  durumMetin = null; durumCubuk = null; durumKap = null;
  if (akis.adim === 'okuma' || akis.adim === 'hesap') {
    durumMetin = h('p', { class: 'so-durum-metin' }, akis.metin);
    durumCubuk = h('span', { class: 'so-cubuk-dolu', style: { transform: `scaleX(${(akis.oran || 0).toFixed(3)})` } });
    durumKap = h('span', {
      class: 'so-cubuk', role: 'progressbar', 'aria-label': akis.metin, 'aria-valuemin': '0', 'aria-valuemax': '100',
      'aria-valuenow': String(Math.round((akis.oran || 0) * 100)),
    }, durumCubuk);
    return h('section', { class: 'so-akis', role: 'status' }, durumMetin, durumKap, gizlilikEl());
  }
  if (akis.adim === 'hata') {
    return h('section', { class: 'so-akis', role: 'alert' },
      h('h2', { class: 'so-akis-baslik' }, 'Olmadı'),
      h('p', { class: 'so-akis-metin' }, akis.metin),
      h('div', { class: 'so-dugmeler' },
        h('button', { type: 'button', class: 'btn ghost', onclick: vazgec }, 'Vazgeç'),
        h('button', { type: 'button', class: 'btn primary', onclick: dosyaSec }, 'Başka dosya seç')));
  }
  if (akis.adim === 'secim') {
    return h('section', { class: 'so-akis', 'aria-labelledby': 'so-sec-baslik' },
      h('h2', { class: 'so-akis-baslik', id: 'so-sec-baslik' }, 'Hangisi sensin?'),
      h('p', { class: 'so-akis-metin' }, 'Dosyadaki adlardan seninkini seç. Diğeri sevgilin olur.'),
      akis.grup ? h('p', { class: 'so-uyari', role: 'note' }, 'Bu bir grup sohbeti gibi görünüyor. Yalnız en çok yazan iki kişi sayılacak.') : null,
      h('div', { class: 'so-secim' }, akis.adlar.map((x, i) => h('button', {
        type: 'button', class: 'so-secim-btn', onclick: () => sec(x.ad),
      },
      avatarEl(x.ad, i === 0 ? 'me' : 'partner'),
      h('span', { class: 'so-secim-ad' }, x.ad),
      h('span', { class: 'so-secim-sayi' }, `${sayiYaz(x.n)} mesaj`)))),
      h('button', { type: 'button', class: 'btn ghost wide', onclick: vazgec }, 'Vazgeç'),
      gizlilikEl());
  }
  // önizleme
  const kaydetBtn = h('button', { type: 'button', class: 'btn primary', onclick: (e) => kaydet(e.currentTarget) }, 'Kaydet');
  const kaydetBtn2 = h('button', { type: 'button', class: 'btn primary wide', onclick: (e) => kaydet(e.currentTarget) }, 'Kaydet ve ikimiz görelim');
  return h('div', { class: 'so-onizleme' },
    h('section', { class: 'so-onizleme-bant', 'aria-label': 'Önizleme' },
      h('p', {}, h('b', {}, 'Önizleme. '), 'Henüz kaydedilmedi; beğenirsen kaydet, ikiniz de görün.'),
      h('div', { class: 'so-dugmeler' },
        h('button', { type: 'button', class: 'btn ghost', onclick: vazgec }, 'Vazgeç'), kaydetBtn)),
    ozetEl(akis.ozet, { onizleme: true }),
    h('div', { class: 'so-onizleme-son' }, kaydetBtn2,
      h('button', { type: 'button', class: 'btn ghost wide', onclick: vazgec }, 'Vazgeç')));
}

// ---------- Özet ----------
const tarih = (gun) => gunYazi(gun) || '—';
const anTarih = (iso) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '—' : `${gunYazi(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)}`;
};
const saatYaz = (iso) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '' : `${String(t.getHours()).padStart(2, '0')}.${String(t.getMinutes()).padStart(2, '0')}`;
};

function kart(id, baslik, ...icerik) {
  const hid = `so-k-${id}`;
  return h('section', { class: 'so-kart', dataset: { id }, 'aria-labelledby': hid },
    h('h2', { class: 'so-kart-baslik', id: hid }, baslik), ...icerik);
}
const buyuk = (sayi, birim) => h('p', { class: 'so-buyuk' }, h('span', { class: 'so-buyuk-sayi' }, sayi), birim ? h('span', { class: 'so-buyuk-birim' }, birim) : null);
const cumle = (metin) => h('p', { class: 'so-cumle' }, metin);
const kisiEtiket = (k) => h('span', { class: `so-kisi so-kisi-${k.cls}` }, avatarEl(k.ad, k.cls, k.foto), h('span', {}, k.ad));

function ozetEl(o, { onizleme }) {
  const k = kisiler(o);
  const ids = k.map((x) => x.id);
  const byId = (id) => k.find((x) => x.id === id) || { ad: 'Biri', cls: 'partner', id };
  const ka = o.kisi[ids[0]] || {};
  const kb = o.kisi[ids[1]] || {};
  const kartlar = [
    kapakKart(o, k),
    ilklerKart(o, ids, byId),
    kimKart(o, k),
    rekorKart(o, byId),
    seriKart(o),
    isiKart(o),
    saatKart(o, k),
    bekletmeKart(o, k, ka, kb),
    yillarKart(o, k),
    kelimeKart(k, ka, kb),
    rozetKart(o, k),
    altBilgi(o, byId, onizleme),
  ].filter(Boolean);
  kartlar.forEach((el, i) => el.style.setProperty('--i', String(Math.min(i, 6))));
  return h('div', { class: 'so-ozet', style: renkStil(k) }, kartlar);
}

function kapakKart(o, k) {
  const s = o.kaynak;
  const el = h('section', { class: 'so-kart so-kapak', dataset: { id: 'kapak' }, 'aria-labelledby': 'so-k-kapak' },
    h('span', { class: 'so-motif', html: simge('balon', 1.25) }),
    pairEl({ meName: k[0].ad, partnerName: k[1].ad, meFoto: k[0].foto, partnerFoto: k[1].foto, link: 'on' }),
    h('p', { class: 'so-kapak-aralik' }, `${tarih(s.ilk)} – ${tarih(s.son)}`),
    h('h2', { class: 'so-kapak-baslik', id: 'so-k-kapak' },
      h('span', { class: 'so-kapak-sayi' }, sayiYaz(s.mesaj)), ' mesaj'),
    h('p', { class: 'so-kapak-alt' }, `${sayiYaz(s.gun)} günün ${sayiYaz(s.konusulanGun)} gününde konuştunuz.`),
    o.arama != null && o.arama > 0 ? h('p', { class: 'so-kapak-not' }, `Bir de ${sayiYaz(o.arama)} arama.`) : null);
  return el;
}
function ilklerKart(o, ids, byId) {
  const l = ilkler(o, ids);
  if (!l.length) return null;
  return kart('ilkler', 'İlklerimiz',
    h('ol', { class: 'so-zaman', role: 'list' }, l.map((x) => {
      const kisi = byId(x.kim);
      return h('li', {},
        h('span', { class: 'so-zaman-nokta', 'aria-hidden': 'true' }),
        h('span', { class: 'so-zaman-baslik' }, x.baslik),
        h('span', { class: 'so-zaman-alt' }, tarih(x.gun), x.an ? ` · ${saatYaz(x.an)}` : '', ' · ', kisiEtiket(kisi)));
    })));
}

function tacEl() { return h('span', { class: 'so-tac', html: simge('tac', 2) }); }

function kimKart(o, k) {
  const l = kategoriler(o, k.map((x) => x.id));
  if (!l.length) return null;
  const mesaj = l.find((x) => x.id === 'mesaj');
  const onde = mesaj?.onde == null ? null : k[mesaj.onde];
  return kart('kim', 'Kim daha çok?',
    onde ? cumle(`${onde.ad} biraz daha konuşkan: ${sayiYaz(Math.abs(mesaj.a - mesaj.b))} mesaj farkla önde.`)
      : cumle('Mesajlar neredeyse yarı yarıya. Tam bir denge!'),
    h('div', { class: 'so-lejant', 'aria-hidden': 'true' },
      h('span', { class: 'so-lejant-ben' }, k[0].ad), h('span', { class: 'so-lejant-partner' }, k[1].ad)),
    h('ul', { class: 'so-kim', role: 'list' }, l.map((x) => h('li', {
      'aria-label': `${x.ad}: ${k[0].ad} ${sayiYaz(x.a)}, ${k[1].ad} ${sayiYaz(x.b)}`,
    },
    h('div', { class: 'so-kim-ust', 'aria-hidden': 'true' },
      h('span', { class: 'so-kim-sayi' }, x.onde === 0 ? tacEl() : null, sayiYaz(x.a)),
      h('span', { class: 'so-kim-ad' }, x.ad),
      h('span', { class: 'so-kim-sayi sag' }, sayiYaz(x.b), x.onde === 1 ? tacEl() : null)),
    h('div', { class: 'so-kim-cubuk', 'aria-hidden': 'true' },
      h('span', { class: 'so-kim-ben', style: { flexGrow: String(Math.max(x.a, 0.0001)) } }),
      h('span', { class: 'so-kim-partner', style: { flexGrow: String(Math.max(x.b, 0.0001)) } }))))));
}

function rekorKart(o, byId) {
  const satir = (sim, baslik, deger, alt) => h('li', {},
    simgeEl(sim, 'so-rekor-ikon'),
    h('span', { class: 'so-rekor-govde' },
      h('span', { class: 'so-rekor-baslik' }, baslik),
      h('span', { class: 'so-rekor-deger' }, deger),
      alt ? h('span', { class: 'so-rekor-alt' }, alt) : null));
  const l = [];
  const [gun, n] = o.enYogunGunler?.[0] || [];
  if (gun) l.push(satir('takvim', 'En yoğun gün', `${sayiYaz(n)} mesaj`, tarih(gun)));
  const kisiRekor = (alan) => Object.entries(o.kisi).map(([id, x]) => ({ id, ...x[alan] })).sort((a, b) => (b.harf ?? b.n ?? 0) - (a.harf ?? a.n ?? 0))[0];
  const um = kisiRekor('enUzunMesaj');
  if (um?.harf) l.push(satir('tuy', 'En uzun mesaj', `${sayiYaz(um.harf)} harf`, `${byId(um.id).ad} · ${tarih(um.gun)}`));
  const us = kisiRekor('enUzunSeri');
  if (us?.n > 1) l.push(satir('balon', 'Cevap beklemeden üst üste', `${sayiYaz(us.n)} mesaj`, `${byId(us.id).ad} · ${anTarih(us.an)}`));
  if (o.sohbet?.enUzun) l.push(satir('saat', 'En uzun sohbet', sureYaz(o.sohbet.enUzun.dk), `${sayiYaz(o.sohbet.enUzun.mesaj)} mesaj · ${anTarih(o.sohbet.enUzun.bas)}`));
  if (o.sohbet?.enHizli) l.push(satir('simsek', 'En hızlı sohbet', `${sayiYaz(o.sohbet.enHizli.mesaj)} mesaj, ${sureYaz(o.sohbet.enHizli.dk)}`, anTarih(o.sohbet.enHizli.bas)));
  if (o.sessizlik?.enUzunSaat >= 1) l.push(satir('ay', 'En uzun sessizlik', sureYaz(o.sessizlik.enUzunSaat * 60), anTarih(o.sessizlik.bas)));
  if (!l.length) return null;
  return kart('rekor', 'Rekorlarımız', h('ul', { class: 'so-rekor', role: 'list' }, l));
}

function seriKart(o) {
  const s = o.seri;
  if (!s?.enUzun?.gun) return null;
  const guncel = s.guncel > 1
    ? `Dosyanın son gününde ${sayiYaz(s.guncel)} günlük seriniz sürüyordu.`
    : null;
  return kart('seri', 'Hiç ara vermeden',
    buyuk(sayiYaz(s.enUzun.gun), 'gün üst üste'),
    cumle(`${tarih(s.enUzun.bas)} ile ${tarih(s.enUzun.bit)} arasında her gün konuştunuz.`),
    guncel ? h('p', { class: 'so-ek' }, simgeEl('alev'), guncel) : null,
    o.sessizlik?.sessizGun > 0 ? h('p', { class: 'so-ek soluk' }, `Konuşmadığınız gün: ${sayiYaz(o.sessizlik.sessizGun)}.`) : null);
}

const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const GUN_TAM = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

function isiKart(o) {
  const ilk = o.kaynak.gunlukKesik || o.kaynak.ilk;
  const harita = isiHaritasi(o.gunluk, ilk, o.kaynak.son);
  if (!harita.haftalar.length) return null;
  const cikti = h('p', { class: 'so-isi-cikti', 'aria-live': 'polite' }, 'Bir güne dokun, o gün kaç mesaj yazdığınızı gör.');
  let secili = null;
  const izgara = h('div', {
    class: 'so-isi-izgara', role: 'group', 'aria-label': 'Günlük mesaj takvimi',
    style: { '--hafta': String(harita.haftalar.length) },
    onclick: (e) => {
      const b = e.target.closest('button[data-gun]');
      if (!b) return;
      secili?.removeAttribute('aria-pressed');
      b.setAttribute('aria-pressed', 'true');
      secili = b;
      const n = Number(b.dataset.n);
      cikti.textContent = `${tarih(b.dataset.gun)}: ${n ? `${sayiYaz(n)} mesaj` : 'mesaj yok'}`;
    },
  });
  harita.haftalar.forEach((hf, i) => {
    if (hf.ay) izgara.append(h('span', { class: 'so-isi-ay', 'aria-hidden': 'true', style: { gridColumn: String(i + 2), gridRow: '1' } }, hf.ay));
    hf.gunler.forEach((g, j) => {
      if (!g) return;
      izgara.append(h('button', {
        type: 'button', class: 'so-isi-gun', tabindex: '-1',
        dataset: { gun: g.gun, n: String(g.n), s: String(g.seviye) },
        style: { gridColumn: String(i + 2), gridRow: String(j + 2) },
        'aria-label': `${tarih(g.gun)}: ${sayiYaz(g.n)} mesaj`,
      }));
    });
  });
  GUN_ADLARI.forEach((g, j) => { if (j % 2 === 0) izgara.append(h('span', { class: 'so-isi-gunad', 'aria-hidden': 'true', style: { gridRow: String(j + 2) } }, g)); });
  const kaydir = h('div', { class: 'so-isi-kaydir', tabindex: '0', 'aria-label': 'Takvim. Yana kaydırın.' }, izgara);
  queueMicrotask(() => requestAnimationFrame(() => { kaydir.scrollLeft = kaydir.scrollWidth; }));
  return kart('isi', 'Takvimimiz',
    cumle(`${sayiYaz(o.kaynak.konusulanGun)} gün konuştunuz. Koyu kareler en hareketli günler.`),
    kaydir,
    h('div', { class: 'so-isi-lejant', 'aria-hidden': 'true' }, 'Az', [0, 1, 2, 3, 4].map((s) => h('span', { class: 'so-isi-gun', dataset: { s: String(s) } })), 'Çok'),
    cikti,
    o.kaynak.gunlukKesik ? h('p', { class: 'so-ek soluk' }, `Takvim ${tarih(o.kaynak.gunlukKesik)} sonrasını gösteriyor.`) : null);
}

function saatKart(o, k) {
  const sa = o.saat?.[k[0].id] || new Array(24).fill(0);
  const sb = o.saat?.[k[1].id] || new Array(24).fill(0);
  const enCok = Math.max(1, ...sa, ...sb);
  const toplam = sa.map((x, i) => x + sb[i]);
  const tepe = toplam.indexOf(Math.max(...toplam));
  const ha = o.haftaGunu?.[k[0].id] || new Array(7).fill(0);
  const hb = o.haftaGunu?.[k[1].id] || new Array(7).fill(0);
  const hToplam = ha.map((x, i) => x + hb[i]);
  const hTepe = hToplam.indexOf(Math.max(...hToplam));
  const hEnCok = Math.max(1, ...ha, ...hb);
  const ayna = (a, b, max, etiketler, sinif) => h('div', { class: `so-ayna ${sinif}`, 'aria-hidden': 'true' },
    a.map((x, i) => h('div', { class: 'so-ayna-sutun' },
      h('span', { class: 'so-ayna-ben', style: { height: `${(x / max) * 100}%` } }),
      h('span', { class: 'so-ayna-partner', style: { height: `${(b[i] / max) * 100}%` } }),
      etiketler[i] ? h('span', { class: 'so-ayna-etiket' }, etiketler[i]) : null)));
  const saatEt = Array.from({ length: 24 }, (_, i) => (i % 6 === 0 ? String(i).padStart(2, '0') : ''));
  return kart('saat', 'Ne zaman yazıyoruz?',
    cumle(`En hareketli saatiniz ${String(tepe).padStart(2, '0')}.00 civarı; en hareketli gününüz ${GUN_TAM[hTepe]}.`),
    h('div', { class: 'so-lejant', 'aria-hidden': 'true' },
      h('span', { class: 'so-lejant-ben' }, k[0].ad), h('span', { class: 'so-lejant-partner' }, k[1].ad)),
    ayna(sa, sb, enCok, saatEt, 'saat'),
    ayna(ha, hb, hEnCok, GUN_ADLARI, 'hafta'),
    h('p', { class: 'sr-only' }, `Saatlere göre toplam mesaj: ${toplam.map((x, i) => `${i}: ${x}`).join(', ')}.`));
}

function bekletmeKart(o, k, ka, kb) {
  if (ka.cevapOrtDk == null && kb.cevapOrtDk == null) return null;
  const hizli = ka.cevapOrtDk != null && kb.cevapOrtDk != null && ka.cevapOrtDk !== kb.cevapOrtDk
    ? (ka.cevapOrtDk < kb.cevapOrtDk ? k[0] : k[1]) : null;
  const ayniEt = o.kaynak.saniye ? 'Bir dakikadan kısa sürede' : 'Aynı dakika içinde';
  const sutun = (kisi, x) => h('div', { class: 'so-bek-sutun' },
    kisiEtiket(kisi),
    h('dl', {},
      h('dt', {}, 'Ortalama cevap'), h('dd', {}, cevapYaz(x.cevapOrtDk)),
      h('dt', {}, ayniEt), h('dd', {}, x.cevapAyniDk == null ? '—' : `%${x.cevapAyniDk}`),
      h('dt', {}, 'En uzun bekletme'), h('dd', {}, x.enBekletme ? sureYaz(x.enBekletme.dk) : '—'),
      h('dt', {}, 'Cevap beklemeden yeniden yazma'), h('dd', {}, sayiYaz(x.artArda))));
  return kart('bekletme', 'Kim bekletiyor?',
    cumle(hizli ? `${hizli.ad} daha hızlı cevaplıyor. Diğeri de az sonra geliyor, merak etme.` : 'Cevap hızınız birbirine çok yakın.'),
    h('div', { class: 'so-bek' }, sutun(k[0], ka), sutun(k[1], kb)));
}

function yillarKart(o, k) {
  const y = yillar(o);
  const ay = aylikSeri(o);
  if (!y.length) return null;
  const ayMax = Math.max(1, ...ay.map((x) => x.toplam));
  const enIyiAy = ay.reduce((a, b) => (b.toplam > a.toplam ? b : a), ay[0]);
  return kart('yillar', 'Yıllar boyunca',
    h('ul', { class: 'so-yil', role: 'list' }, y.map((r) => {
      const a = r.pay[k[0].id] || 0;
      const b = r.pay[k[1].id] || 0;
      return h('li', {},
        h('div', { class: 'so-yil-ust' },
          h('span', { class: 'so-yil-ad' }, String(r.yil)),
          h('span', { class: 'so-yil-toplam' }, `${sayiYaz(r.toplam)} mesaj`),
          h('span', { class: 'so-yil-ort' }, `günde ${sayiYaz(r.gunlukOrt)}`)),
        h('div', { class: 'so-kim-cubuk', role: 'img', 'aria-label': `${k[0].ad} ${sayiYaz(a)}, ${k[1].ad} ${sayiYaz(b)}` },
          h('span', { class: 'so-kim-ben', style: { flexGrow: String(Math.max(a, 0.0001)) } }),
          h('span', { class: 'so-kim-partner', style: { flexGrow: String(Math.max(b, 0.0001)) } })));
    })),
    ay.length > 1 ? h('div', { class: 'so-ay' },
      h('h3', { class: 'so-alt-baslik' }, 'Ay ay'),
      h('div', { class: 'so-ay-cubuklar', role: 'img', 'aria-label': `En çok yazılan ay: ${kisaAy(enIyiAy.ay)}, ${sayiYaz(enIyiAy.toplam)} mesaj` },
        ay.map((x) => h('span', { class: 'so-ay-cubuk', dataset: { en: String(x === enIyiAy) }, style: { height: `${Math.max(2, (x.toplam / ayMax) * 100)}%` } }))),
      h('div', { class: 'so-ay-uclar', 'aria-hidden': 'true' }, h('span', {}, kisaAy(ay[0].ay)), h('span', {}, kisaAy(ay.at(-1).ay))),
      h('p', { class: 'so-ek soluk' }, `En çok yazılan ay: ${kisaAy(enIyiAy.ay)} (${sayiYaz(enIyiAy.toplam)} mesaj).`)) : null);
}

function kelimeKart(k, ka, kb) {
  const sutun = (kisi, x) => h('div', { class: 'so-kel-sutun' },
    kisiEtiket(kisi),
    x.emojiler?.length ? h('ul', { class: 'so-emoji', role: 'list', 'aria-label': 'En çok emojiler' },
      x.emojiler.slice(0, 8).map(([e, n]) => h('li', { title: `${sayiYaz(n)} kez` }, h('span', { class: 'so-emoji-e' }, e), h('span', { class: 'so-emoji-n' }, sayiYaz(n))))) : null,
    x.kelimeler?.length ? h('ol', { class: 'so-kelime', role: 'list' },
      x.kelimeler.slice(0, 10).map(([w, n]) => h('li', {}, h('span', { class: 'so-kelime-w' }, w), h('span', { class: 'so-kelime-n' }, sayiYaz(n)))))
      : h('p', { class: 'so-ek soluk' }, 'Kelime yok.'));
  if (!ka.kelimeler?.length && !kb.kelimeler?.length && !ka.emojiler?.length && !kb.emojiler?.length) return null;
  return kart('kelime', 'En sık kullandıklarımız',
    h('div', { class: 'so-kel' }, sutun(k[0], ka), sutun(k[1], kb)));
}

function rozetKart(o, k) {
  const r = rozetler(o, k.map((x) => x.id));
  const sutun = (kisi) => {
    const l = r[kisi.id] || [];
    return h('div', { class: 'so-rozet-sutun' },
      kisiEtiket(kisi),
      l.length ? h('ul', { class: 'so-rozet', role: 'list' }, l.map((x) => h('li', {},
        simgeEl(x.simge, 'so-rozet-ikon'),
        h('span', {}, h('span', { class: 'so-rozet-ad' }, x.ad), h('span', { class: 'so-rozet-acik' }, x.aciklama)))))
        : h('p', { class: 'so-ek soluk' }, 'Bu sefer berabere!'));
  };
  if (!Object.values(r).some((l) => l.length)) return null;
  return kart('rozet', 'Rozetlerimiz', h('div', { class: 'so-rozetler' }, sutun(k[0]), sutun(k[1])));
}

const YONTEM = [
  'Dosya yalnız bu telefonda, bellekte okunur. Odaya mesaj metni gitmez; yalnız sayılar ve sıralamalar kaydedilir.',
  '30 dakikadan uzun ara yeni bir sohbet başlatır. 4 saatten uzun sessizlikten sonra ilk yazan “sohbeti açan” olur.',
  'Cevap süresi: karşı tarafın mesajından sonraki ilk mesaja kadar geçen süre. 12 saatten uzun aralar sayılmaz.',
  'Cevap beklemeden yeniden yazma: kendi mesajından 10 dakika ile 4 saat sonra, cevap gelmeden yeniden yazmak.',
  'Gün sabah 05.00\'te başlar: günün ilk ve son mesajı buna göre. 00.00–04.59 arası gece sayılır.',
  'Kelimelerde “ve, ama, bir” gibi sık kelimeler, 3 harften kısalar, bağlantılar ve gülmeler sayılmaz. “aşkım” ile “askim” aynı kelimedir.',
  'Bir mesajdaki aynı emojiden en çok 20 tanesi sayılır. Ten rengi ayrı emoji değildir.',
  'Rozet: o konuda önde olan alır; fark %5\'ten azsa kimse almaz.',
];

function altBilgi(o, byId, onizleme) {
  const s = o.kaynak;
  const yukleyen = o.yukleyen === me.clientId ? 'sen' : byId(o.yukleyen).ad;
  return h('footer', { class: 'so-alt', dataset: { id: 'alt' } },
    h('p', {}, `Dosya: ${tarih(s.ilk)} – ${tarih(s.son)} · ${s.bicim === 'ios' ? 'iPhone' : 'Android'}`),
    onizleme ? null : h('p', {}, `Yükleyen: ${yukleyen} · ${anTarih(o.at)}`),
    !s.medyaTuru ? h('p', { class: 'soluk' }, 'Bu dosyada medya türleri ayrılmıyor; hepsi “Medya” sayıldı.') : null,
    h('details', { class: 'so-yontem' },
      h('summary', {}, 'Nasıl hesaplandı?', h('span', { class: 'so-yontem-ok', html: simge('chevron') })),
      h('ul', { role: 'list' }, YONTEM.map((x) => h('li', {}, x)))),
    onizleme ? null : h('button', { type: 'button', class: 'btn ghost wide', onclick: dosyaSec }, simgeEl('yukle', 'so-btn-ikon'), 'Yeni dosya yükle'),
    onizleme ? null : gizlilikEl());
}

ciz();
