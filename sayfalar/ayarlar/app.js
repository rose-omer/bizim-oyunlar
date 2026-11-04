// Ayarlar: profil, biz, bildirimler, kilit, görünüm, konum paylaşımı (satır → Konum sayfası), yedek (indir / geri yükle), cihazlar, oda, hakkında.
import { bootPage } from '../../js/core/sayfa.js';
import { openProfil } from '../../js/core/profil.js';
import { openCollection, listDocs, putDoc, iceAktar, onbellekTemizle, kaliciSil } from '../../js/core/veri.js';
import { sayfaById } from '../../js/core/games.js';
import { COP_TURLERI, copListesi, copOnizleme, copKimZaman } from './mantik.js';
import {
  setName, inviteUrl, lobbyUrl, pageUrl, readStore, writeStore, parseYapistirilanLink, buildTasimaUrl, SITE_ROOT, isLocalMode,
} from '../../js/core/identity.js';
import { yapistirilanLinkiUygula } from '../../js/core/kapi.js';
import {
  h, icon, toast, confirmDialog, shareInvite, copyInvite, copyText, initial, formatDay, readTema, parseTema, davetHazirla,
} from '../../js/core/ui.js';
import {
  cihazlar, cihazOnayla, cihazReddet, cihazCikar, kurtarmaOlustur, odaGiris, uyelikModu, tasimaLinki, davetOlustur,
  medyaKullanim, odaSilDurum, odaSilIste, odaSilVazgec, odaSilOnayla,
} from '../../js/core/uyelik.js';
import {
  uploadPhoto, uploadAudio, medyaAdresi, loadPhoto, medyaGeriYukle, medyaVarMi, medyaYolu,
} from '../../js/core/storage.js';
import { sifreliMi, sifreDestegi, YedekHatasi } from '../../js/core/yedek-sifre.js';
import { yedekAlindi, sonYedek } from '../../js/core/yedek-hatirlat.js';
import { tamYedekUret, tamYedekOku, yedekMedyalari, medyaEsle, belgelereUygula } from './yedek-tam.js';
import { fotoKirp } from '../../js/core/kirp.js';
import { isMuted, setMuted, sfx } from '../../js/core/sound.js';
import { bildirimDestegi, bildirimDurumu, bildirimAc, bildirimKapat, bildirimGizliMi, bildir } from '../../js/core/bildirim.js';
import { dosyaPaylas } from '../../js/core/dosya-paylas.js';
import { kilitAyarla, kilitVarMi, pinHatasi, pinDogruMu, cihazdanUnut } from '../../js/core/kilit.js';
import { daysTogether, toDay } from '../../js/core/gunler.js';
import { isNative, paylas } from '../../js/core/mobil.js';
import { IOS_ADIMLARI, apkGoster } from '../daha/mantik.js';
import { tarihYazi } from '../gunler/mantik.js';
import {
  SURUM, K_TEMA, TEMA_RENKLERI, TEMA_MODLARI, KISI_RENKLERI, K_ACIK_BOLUMLER, acikBolumler, acikGuncelle,
  bulusmaMetni,
  bildirimGorunum, YEDEK_TURLERI, yedekVerisi, yedekSayisi, yedekDosyaAdi, yedekSonucMesaji, yedektenBelgeler, parcala, yedekOzeti,
  tamYedekDosyaAdi, parolaHatasi, yedekSonGun, kullanimGorunum, odaSilGorunum,
} from './mantik.js';
import { konumOku, durumEtiketi } from '../konum/mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'ayarlar', title: 'Ayarlar', tab: 'daha' });
const app = document.getElementById('app');
const myId = me.clientId;
const [profil, konum] = await Promise.all([openProfil(room), openCollection(room, 'konum')]);

const AD_MAX = 24;

// ---------- Küçük yardımcılar ----------
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const SVG = {
  kamera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.2"/>',
  foto: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 4.5-4.5 3.5 3.5 2.5-2.5L20 18"/>',
  tik: '<path d="m5.5 12.5 4 4 9-9"/>',
  kilit: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  zil: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  indir: '<path d="M12 4v10.5M7.5 10 12 14.5 16.5 10"/><path d="M5 19.5h14"/>',
  yukle: '<path d="M12 15.5V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19.5h14"/>',
  telefon: '<rect x="6.5" y="3" width="11" height="18" rx="2.6"/><path d="M10.5 17.6h3"/>',
  tablet: '<rect x="4.5" y="3" width="15" height="18" rx="2.4"/><path d="M10.5 17.6h3"/>',
  bilgisayar: '<rect x="4" y="5" width="16" height="11" rx="1.8"/><path d="M2.5 19h19"/>',
  anahtar: '<circle cx="8" cy="15" r="3.6"/><path d="m10.6 12.4 7.4-7.4M15.5 7.5l2.2 2.2M13.4 9.6l1.6 1.6"/>',
  kopya: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.2A1.7 1.7 0 0 0 13.8 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/>',
  cikis: '<path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8 6 12l4 4M6 12h9.5"/>',
  bilgi: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  asagi: '<path d="m6 9.5 6 6 6-6"/>',
  takvim: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.8"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  telefon: '<rect x="6.5" y="3" width="11" height="18" rx="2.8"/><path d="M10.5 17.6h3"/>',
};
const svg = (ad, cls = 'ayar-svg') => h('span', { class: cls, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" ${STROKE}>${SVG[ad]}</svg>` });

const canli = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
function duyur(metin) {
  canli.textContent = '';
  requestAnimationFrame(() => { canli.textContent = metin; });
}

const okZaman = new WeakMap();
function kaydedildi(alanEl, metin = 'Kaydedildi') {
  const ok = alanEl?.querySelector('.ayar-ok');
  if (ok) {
    ok.replaceChildren(svg('tik'), metin);
    ok.classList.add('gorunur');
    clearTimeout(okZaman.get(ok));
    okZaman.set(ok, setTimeout(() => ok.classList.remove('gorunur'), 1800));
  }
  duyur(metin);
}

/** Yazmayı bekler; geçersiz veri hatasını gösterir. Ağ hatası fırlatmaz (veri.js giden kutusunda bekletir). */
async function yaz(is, alanEl = null) {
  try {
    await is;
    if (alanEl) kaydedildi(alanEl);
    return true;
  } catch (e) {
    toast(e?.message || 'Kaydedilemedi. Tekrar dener misin?');
    return false;
  }
}

const odakta = (el) => document.activeElement === el;
function degerKoy(input, deger) {
  if (!odakta(input) && input.value !== (deger ?? '')) input.value = deger ?? '';
}

// Bölümler katlanır: ilk açılışta yalnız Profilim açık; açık olanlar bu cihazda hatırlanır.
const ilkAcik = acikBolumler(readStore('local', K_ACIK_BOLUMLER));
function bolum(id, baslik, ...icerik) {
  const d = h('details', { class: 'ayar-bolum', id: `ayar-${id}`, open: ilkAcik.includes(id) },
    h('summary', { class: 'ayar-ozet' },
      h('h2', { class: 'ayar-baslik', id: `ayar-${id}-h` }, baslik),
      svg('asagi', 'ayar-katla')),
    h('div', { class: 'ayar-icerik' }, ...icerik));
  d.addEventListener('toggle', () => {
    const liste = acikGuncelle(acikBolumler(readStore('local', K_ACIK_BOLUMLER)), id, d.open);
    writeStore('local', K_ACIK_BOLUMLER, JSON.stringify(liste));
  });
  return d;
}
const kart = (...icerik) => h('div', { class: 'ayar-kart' }, ...icerik);

/** Etiketli alan. kontrol id'si etiketle bağlanır; yardım metni aria-describedby olur. */
function alan(etiket, kontrol, { yardim = null, grup = false } = {}) {
  const id = kontrol.id;
  const yardimEl = yardim != null ? h('p', { class: 'ayar-yardim', id: `${id}-y` }, yardim) : null;
  if (yardimEl) kontrol.setAttribute('aria-describedby', `${id}-y`);
  const etiketEl = grup
    ? h('span', { class: 'ayar-etiket', id: `${id}-e` }, etiket)
    : h('label', { class: 'ayar-etiket', for: id }, etiket);
  if (grup) kontrol.setAttribute('aria-labelledby', `${id}-e`);
  return h('div', { class: 'ayar-alan' },
    h('div', { class: 'ayar-alan-ust' }, etiketEl, h('span', { class: 'ayar-ok', 'aria-hidden': 'true' })),
    kontrol, yardimEl);
}

function anahtar(id, acik, onDegis) {
  const b = h('button', { type: 'button', role: 'switch', class: 'ayar-anahtar', id, 'aria-checked': String(!!acik) },
    h('span', { class: 'ayar-anahtar-top', 'aria-hidden': 'true' }));
  b.addEventListener('click', () => onDegis(b.getAttribute('aria-checked') !== 'true', b));
  return b;
}

function anahtarSatiri(baslik, aciklama, anahtarEl) {
  const id = anahtarEl.id;
  if (aciklama) anahtarEl.setAttribute('aria-describedby', `${id}-a`);
  return h('div', { class: 'ayar-satir' },
    h('div', { class: 'ayar-satir-metin' },
      h('label', { class: 'ayar-satir-baslik', for: id }, baslik),
      aciklama ? h('p', { class: 'ayar-satir-aciklama', id: `${id}-a` }, aciklama) : null),
    anahtarEl);
}

/** Yuvarlak renk seçici (radiogroup, ok tuşlarıyla gezilir). */
function renkGrubu(id, secenekler, onSec) {
  const grup = h('div', { class: 'ayar-renkler', role: 'radiogroup', id });
  const dugmeler = secenekler.map((s) => h('button', {
    type: 'button', role: 'radio', class: 'ayar-renk', 'aria-label': s.ad, title: s.ad,
    dataset: { deger: s.deger }, style: { '--sw': s.renk }, onclick: () => onSec(s.deger),
  }, svg('tik', 'ayar-renk-tik')));
  grup.append(...dugmeler);
  grup.addEventListener('keydown', (e) => {
    const yon = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!yon) return;
    e.preventDefault();
    const i = dugmeler.indexOf(document.activeElement);
    const sonraki = dugmeler[(i + yon + dugmeler.length) % dugmeler.length];
    sonraki.focus();
    sonraki.click();
  });
  grup.sec = (deger) => {
    let bulundu = false;
    for (const d of dugmeler) {
      const on = d.dataset.deger === deger;
      bulundu ||= on;
      d.setAttribute('aria-checked', String(on));
      d.tabIndex = on ? 0 : -1;
    }
    if (!bulundu) dugmeler[0].tabIndex = 0;
  };
  return grup;
}

// ---------- Fotoğraf ----------
/** img'ye fotoğrafı koyar; yoksa gizler. -> fotoğraf var mı */
async function fotoKoy(img, url) {
  img.dataset.url = url || '';
  const src = await medyaAdresi(url);
  if (img.dataset.url !== (url || '')) return; // bu arada değişti
  if (src) {
    if (img.getAttribute('src') !== src) img.src = src;
    img.hidden = false;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
  }
  img.dispatchEvent(new Event('foto'));
}

function dosyaSecici(onDosya) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) onDosya(f);
  });
  return input;
}

async function fotoYukle(blob, mesgulEl) {
  mesgulEl.setAttribute('aria-busy', 'true');
  mesgulEl.classList.add('yukleniyor');
  try {
    return await uploadPhoto(blob, roomId);
  } finally {
    mesgulEl.removeAttribute('aria-busy');
    mesgulEl.classList.remove('yukleniyor');
  }
}

/** Seçilen dosya → kırpma penceresi → yükle → kaydet. Vazgeçilirse hiçbir şey değişmez. */
async function fotoAyarla(dosya, { kirp, mesgulEl, kaydet, basari }) {
  let blob;
  try {
    blob = await fotoKirp(dosya, kirp);
  } catch (e) {
    toast(e?.message || 'Bu fotoğraf açılamadı. Başka bir fotoğraf dener misin?');
    return;
  }
  if (!blob) return;
  try {
    const url = await fotoYukle(blob, mesgulEl);
    if (await yaz(kaydet(url))) toast(basari);
  } catch (e) {
    toast(e?.message || 'Fotoğraf yüklenemedi. Tekrar dener misin?');
  }
}

// ---------- Profilim ----------
const avatarImg = h('img', { class: 'ayar-avatar-foto', alt: '', hidden: true, decoding: 'async' });
const avatarHarf = h('span', { class: 'ayar-avatar-harf', 'aria-hidden': 'true' });
const avatarSec = dosyaSecici((f) => fotoAyarla(f, {
  kirp: { oran: 1, cikti: 512, daire: true, baslik: 'Profil fotoğrafı' },
  mesgulEl: avatarBtn,
  kaydet: (url) => profil.setBen({ foto: url }),
  basari: 'Profil fotoğrafın güncellendi',
}));
const avatarBtn = h('button', {
  type: 'button', class: 'ayar-avatar', 'aria-label': 'Profil fotoğrafını değiştir', onclick: () => avatarSec.click(),
}, avatarImg, avatarHarf, h('span', { class: 'ayar-avatar-rozet' }, svg('kamera')));
const adGoster = h('p', { class: 'ayar-profil-ad' });
const fotoKaldirBtn = h('button', {
  type: 'button', class: 'btn small ghost',
  onclick: async () => { if (await yaz(profil.setBen({ foto: undefined }))) toast('Profil fotoğrafı kaldırıldı'); },
}, 'Kaldır');
const profilBaslik = h('div', { class: 'ayar-profil' },
  avatarBtn,
  h('div', { class: 'ayar-profil-metin' },
    adGoster,
    h('div', { class: 'ayar-eylemler' },
      h('button', { type: 'button', class: 'btn small', onclick: () => avatarSec.click() }, svg('foto'), 'Fotoğraf seç'),
      fotoKaldirBtn)),
  avatarSec);

const adInput = h('input', {
  class: 'input', id: 'ayar-ad', type: 'text', maxlength: AD_MAX, autocomplete: 'nickname',
  autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done',
});
const adHata = h('p', { class: 'ayar-hata', id: 'ayar-ad-h', hidden: true }, 'Bir ad yaz; kısa olsa da olur.');
const adAlan = alan('Adın', adInput);
adAlan.append(adHata);
adInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') adInput.blur(); });
adInput.addEventListener('change', async () => {
  const v = adInput.value.replace(/\s+/g, ' ').trim().slice(0, AD_MAX);
  if (!v) {
    adInput.setAttribute('aria-invalid', 'true');
    adInput.setAttribute('aria-errormessage', 'ayar-ad-h');
    adHata.hidden = false;
    return;
  }
  adInput.removeAttribute('aria-invalid');
  adHata.hidden = true;
  adInput.value = v;
  setName(v);
  await yaz(profil.setBen({ ad: v }), adAlan);
  // Cihaz listesindeki ad da güncellensin (onaylı cihazda oda_katil adı yazar).
  if (uyeModu()) odaGiris(roomId).then(() => cihazYukle()).catch(() => {});
});

const dogumInput = h('input', { class: 'input', id: 'ayar-dogum', type: 'date', max: toDay() });
const dogumAlan = alan('Doğum günün', dogumInput, { yardim: 'Özel Günler\'e kendiliğinden eklenir.' });
dogumInput.addEventListener('change', () => yaz(profil.setBen({ dogum: dogumInput.value || undefined }), dogumAlan));

const kisiRenk = renkGrubu('ayar-renk', KISI_RENKLERI.map((r) => ({ deger: r.renk, ad: r.ad, renk: r.renk })),
  (deger) => { kisiRenk.sec(deger); yaz(profil.setBen({ renk: deger }), renkAlan); });
const renkAlan = alan('Rengin', kisiRenk, { grup: true, yardim: 'Avatarında ve mesajlarında görünür.' });

function profilYenile() {
  const ben = profil.ben();
  const ad = ben.ad || me.name || '';
  adGoster.textContent = ad || 'Adını yaz';
  avatarHarf.textContent = initial(ad);
  avatarBtn.style.setProperty('--av-renk', ben.renk || '');
  avatarBtn.toggleAttribute('data-renkli', !!ben.renk);
  fotoKoy(avatarImg, ben.foto);
  fotoKaldirBtn.hidden = !ben.foto;
  degerKoy(adInput, ad);
  degerKoy(dogumInput, ben.dogum || '');
  kisiRenk.sec(ben.renk || '');
}
avatarImg.addEventListener('foto', () => avatarBtn.classList.toggle('fotolu', !avatarImg.hidden));

// ---------- Biz ----------
const ciftAdInput = h('input', { class: 'input', id: 'ayar-cift-ad', type: 'text', maxlength: 40, autocapitalize: 'words', enterkeyhint: 'done' });
const ciftAdAlan = alan('Çiftimizin adı', ciftAdInput);
ciftAdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') ciftAdInput.blur(); });
ciftAdInput.addEventListener('change', () => {
  const v = ciftAdInput.value.replace(/\s+/g, ' ').trim();
  ciftAdInput.value = v;
  yaz(profil.setCift({ ad: v || undefined }), ciftAdAlan);
});

function baslangicMetni(b) {
  if (!b) return 'Bu tarihten bu yana birlikte geçen günleri sayarız.';
  const n = daysTogether(b, new Date());
  return n > 0 ? `Bugün birlikteliğinizin ${n.toLocaleString('tr-TR')}. günü.` : 'Bu tarih henüz gelmedi.';
}

const kapakImg = h('img', { class: 'ayar-kapak-foto', alt: 'Kapak fotoğrafınız', hidden: true, decoding: 'async' });
const kapakBos = h('div', { class: 'ayar-kapak-bos' }, svg('foto'), h('span', {}, 'Henüz kapak yok. Birlikte bir fotoğrafınızı seçelim mi?'));
const kapakKutu = h('div', { class: 'ayar-kapak', id: 'ayar-kapak' }, kapakImg, kapakBos);
kapakImg.addEventListener('foto', () => { kapakBos.hidden = !kapakImg.hidden; });
const kapakSec = dosyaSecici((f) => fotoAyarla(f, {
  kirp: { oran: 16 / 9, cikti: 1280, daire: false, baslik: 'Kapak fotoğrafı' },
  mesgulEl: kapakKutu,
  kaydet: (url) => profil.setCift({ kapak: url }),
  basari: 'Kapak fotoğrafı güncellendi',
}));
const kapakKaldirBtn = h('button', {
  type: 'button', class: 'btn small ghost',
  onclick: async () => { if (await yaz(profil.setCift({ kapak: undefined }))) toast('Kapak kaldırıldı'); },
}, 'Kaldır');
const kapakAlan = h('div', { class: 'ayar-alan' },
  h('div', { class: 'ayar-alan-ust' }, h('span', { class: 'ayar-etiket', id: 'ayar-kapak-e' }, 'Kapak fotoğrafı')),
  kapakKutu,
  h('div', { class: 'ayar-eylemler' },
    h('button', { type: 'button', class: 'btn small', onclick: () => kapakSec.click() }, svg('foto'), 'Fotoğraf seç'),
    kapakKaldirBtn),
  kapakSec);

// Başlangıç tarihi ve sonraki buluşma: burada yalnız gösterilir; tek düzenleme yeri Özel Günler.
const baslangicDeger = h('p', { class: 'ayar-deger' });
const baslangicAlt = h('p', { class: 'ayar-yardim' });
const bulusmaDeger = h('p', { class: 'ayar-deger' });
const bulusmaAlt = h('p', { class: 'ayar-yardim' });
const gunlerAlan = h('div', { class: 'ayar-alan ayar-gunler' },
  h('dl', { class: 'ayar-degerler' },
    h('div', {}, h('dt', { class: 'ayar-etiket' }, 'Başlangıç tarihimiz'), h('dd', {}, baslangicDeger, baslangicAlt)),
    h('div', {}, h('dt', { class: 'ayar-etiket' }, 'Sonraki buluşmamız'), h('dd', {}, bulusmaDeger, bulusmaAlt))),
  h('div', { class: 'ayar-eylemler' },
    h('a', { class: 'btn small', href: pageUrl('sayfalar/gunler/') }, svg('takvim'), 'Özel Günler\'de düzenle')));

function bulusmaYenile() {
  const c = profil.cift();
  if (c.bulusma) {
    const d = new Date(c.bulusma);
    const ne = `${formatDay(d)} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    bulusmaDeger.textContent = bulusmaMetni(c.bulusma);
    bulusmaAlt.textContent = [ne, c.bulusmaNotu].filter(Boolean).join(' · ');
  } else {
    bulusmaDeger.textContent = 'Henüz plan yok';
    bulusmaAlt.textContent = 'Özel Günler\'den bir tarih seçin; geri sayım başlasın.';
  }
}

function bizYenile() {
  const c = profil.cift();
  const benAd = profil.ben().ad || me.name || 'Sen';
  const pAd = profil.partner()?.ad || 'Sevgilin';
  ciftAdInput.placeholder = `${benAd} & ${pAd}`;
  degerKoy(ciftAdInput, c.ad || '');
  baslangicDeger.textContent = c.baslangic ? tarihYazi(c.baslangic, new Date(), { haftaGunu: false }) : 'Henüz seçilmedi';
  baslangicAlt.textContent = baslangicMetni(c.baslangic);
  fotoKoy(kapakImg, c.kapak);
  kapakKaldirBtn.hidden = !c.kapak;
  bulusmaYenile();
}

// ---------- Bildirimler ----------
const bildirimKutu = kart();
function adimListesi() {
  return h('ol', { class: 'ayar-adimlar' }, IOS_ADIMLARI.map((m, i) => h('li', {}, m,
    i === 0 ? h('span', { class: 'ayar-adim-ikon' }, icon('share')) : null)));
}
function bilgi(metin, ...ek) {
  return h('div', { class: 'ayar-bilgi' }, svg('bilgi'), h('div', { class: 'ayar-bilgi-metin' }, h('p', {}, metin), ...ek));
}

let bildirimSira = 0;
async function bildirimCiz() {
  const sira = ++bildirimSira;
  const destek = bildirimDestegi();
  let durum = 'yok';
  try { durum = await bildirimDurumu(); } catch { durum = 'yok'; }
  if (sira !== bildirimSira) return;
  const g = bildirimGorunum(destek, durum);
  bildirimKutu.dataset.durum = g;

  if (g === 'acik' || g === 'kapali') {
    const sw = anahtar('ayar-bildirim-sw', g === 'acik', async (ac, b) => {
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
      try {
        if (ac) {
          const ok = await bildirimAc(roomId);
          if (ok) toast('Bildirimler açık. Sevgilin yazınca haberin olacak.');
          else toast((await bildirimDurumu().catch(() => '')) === 'engelli' ? 'İzin verilmedi. Tarayıcı ayarlarından açabilirsin.' : 'Bildirimler açılamadı. Biraz sonra tekrar dener misin?');
        } else {
          await bildirimKapat(roomId);
          toast('Bildirimler kapandı');
        }
      } catch {
        toast('Bir sorun çıktı. Biraz sonra tekrar dener misin?');
      }
      await bildirimCiz();
      document.getElementById('ayar-bildirim-sw')?.focus({ preventScroll: true });
    });
    // Ayar alıcınındır: gönderen, partnerin kisi.bildirimGizli alanına bakar (bildirim.js bildir).
    const gizliSw = anahtar('ayar-bildirim-gizli-sw', bildirimGizliMi(profil.ben()), async (ac, b) => {
      if (await yaz(profil.setBen({ bildirimGizli: ac }))) b.setAttribute('aria-checked', String(ac));
    });
    bildirimKutu.replaceChildren(anahtarSatiri('Anlık bildirimler',
      'Sevgilin yazınca, dokununca ya da anı ekleyince bu cihaza haber veririz.', sw),
    anahtarSatiri('Bildirimde mesajı gizle',
      'Açıkken kilit ekranında mesajın kendisi görünmez, yalnız "Yeni mesaj" yazar.', gizliSw));
  } else if (g === 'engelli') {
    bildirimKutu.replaceChildren(
      bilgi(isNative()
        ? 'Bildirim izni kapalı. Telefon Ayarlar → Uygulamalar → Biz İkimiz → Bildirimler\'den aç.'
        : 'Bildirimler bu tarayıcıda engellenmiş. Adres çubuğundaki site ayarlarından (ya da tarayıcı ayarlarından) bu siteye bildirim izni ver, sonra buraya dön.'),
      h('div', { class: 'ayar-eylemler' }, h('button', { type: 'button', class: 'btn small', onclick: () => bildirimCiz() }, 'Tekrar kontrol et')));
  } else if (g === 'ana-ekran-gerek') {
    bildirimKutu.replaceChildren(
      bilgi('iPhone\'da bildirim almak için önce Biz İkimiz\'i ana ekrana ekle:'),
      adimListesi(),
      h('p', { class: 'ayar-yardim' }, 'Sonra uygulamayı ana ekrandaki simgeden aç ve bildirimleri buradan aç.'));
  } else {
    const apk = apkGoster(navigator.userAgent, isNative());
    bildirimKutu.replaceChildren(bilgi('Bu tarayıcı anlık bildirim desteklemiyor.',
      apk ? h('p', {}, 'Android uygulamasında hatırlatıcılar çalışır. ', h('a', { href: pageUrl('sayfalar/daha/') }, 'Daha sayfasından indirebilirsin.')) : null));
  }
}

// ---------- Uygulama kilidi ----------
const kilitKutu = kart();
let kilitMod = null; // null | 'kur' | 'degistir' | 'kaldir'

function pinInput(id) {
  const inp = h('input', {
    class: 'input ayar-pin', id, type: 'password', inputmode: 'numeric', pattern: '[0-9]*',
    maxlength: 6, autocomplete: 'off', enterkeyhint: 'done', spellcheck: 'false',
  });
  inp.addEventListener('input', () => {
    const temiz = inp.value.replace(/\D/g, '').slice(0, 6);
    if (temiz !== inp.value) inp.value = temiz;
  });
  return inp;
}

function kilitFormu(mod) {
  const mevcut = mod !== 'kur' ? pinInput('ayar-pin-mevcut') : null;
  const yeni = mod !== 'kaldir' ? pinInput('ayar-pin-yeni') : null;
  const tekrar = mod !== 'kaldir' ? pinInput('ayar-pin-tekrar') : null;
  const hata = h('p', { class: 'ayar-hata', id: 'ayar-pin-hata', role: 'alert', hidden: true });
  const goster = (metin, el) => {
    hata.textContent = metin;
    hata.hidden = false;
    for (const i of [mevcut, yeni, tekrar]) i?.removeAttribute('aria-invalid');
    el?.setAttribute('aria-invalid', 'true');
    el?.focus();
  };
  const kaydet = h('button', { type: 'submit', class: 'btn primary small' },
    mod === 'kaldir' ? 'Kilidi kaldır' : 'PIN\'i kaydet');
  const form = h('form', {
    class: 'ayar-pin-form', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      kaydet.disabled = true;
      try {
        if (mevcut && !(await pinDogruMu(mevcut.value))) return goster('Şu anki PIN yanlış.', mevcut);
        if (mod === 'kaldir') {
          await kilitAyarla(null);
          kilitMod = null;
          kilitCiz();
          toast('Kilit kaldırıldı');
          return;
        }
        const hataMetni = pinHatasi(yeni.value);
        if (hataMetni) return goster(hataMetni, yeni);
        if (tekrar.value !== yeni.value) return goster('İki PIN aynı değil. Bir daha yazar mısın?', tekrar);
        await kilitAyarla(yeni.value);
        kilitMod = null;
        kilitCiz();
        sfx('pop');
        toast('Kilit kuruldu. Uygulama açılırken PIN\'in sorulacak.');
      } catch (err) {
        goster(err?.message || 'PIN kaydedilemedi.');
      } finally {
        kaydet.disabled = false;
      }
    },
  });
  const satir = (inp, etiket) => inp && h('div', { class: 'ayar-mini' }, h('label', { class: 'ayar-mini-etiket', for: inp.id }, etiket), inp);
  form.append(...[
    satir(mevcut, 'Şu anki PIN'),
    satir(yeni, mod === 'kur' ? 'PIN (4–6 rakam)' : 'Yeni PIN (4–6 rakam)'),
    satir(tekrar, 'PIN\'i tekrar yaz'),
    hata,
    h('div', { class: 'ayar-eylemler' },
      kaydet,
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => { kilitMod = null; kilitCiz(); } }, 'Vazgeç')),
  ].filter(Boolean));
  for (const i of [mevcut, yeni, tekrar]) i?.setAttribute('aria-describedby', 'ayar-pin-hata');
  return form;
}

function kilitCiz() {
  const var_ = kilitVarMi();
  const durum = h('div', { class: 'ayar-durum-satir' },
    h('span', { class: 'ayar-durum-ikon', dataset: { acik: String(var_) } }, svg('kilit')),
    h('div', { class: 'ayar-satir-metin' },
      h('p', { class: 'ayar-satir-baslik' }, var_ ? 'PIN kilidi açık' : 'PIN kilidi kapalı'),
      h('p', { class: 'ayar-satir-aciklama' }, var_
        ? 'Uygulama açılırken ve 5 dakikadan uzun arka planda kalınca PIN sorulur.'
        : 'Açılışta 4–6 haneli bir PIN sorulsun. PIN yalnız bu cihazda saklanır.')));
  const icerik = [durum];
  if (kilitMod) {
    icerik.push(kilitFormu(kilitMod));
  } else {
    const ac = (m) => () => {
      kilitMod = m;
      kilitCiz();
      kilitKutu.querySelector('input')?.focus();
    };
    icerik.push(h('div', { class: 'ayar-eylemler' }, var_
      ? [h('button', { type: 'button', class: 'btn small', onclick: ac('degistir') }, 'PIN\'i değiştir'),
        h('button', { type: 'button', class: 'btn small danger', onclick: ac('kaldir') }, 'Kilidi kaldır')]
      : [h('button', { type: 'button', class: 'btn small primary', onclick: ac('kur') }, svg('kilit'), 'PIN belirle')]));
  }
  icerik.push(h('p', { class: 'ayar-yardim' }, 'PIN\'i unutursan bu cihaz odanızı unutur; davet linkini yeniden açarak dönersin.'));
  kilitKutu.replaceChildren(...icerik);
}

// ---------- Görünüm ----------
let tema = readTema();
function temaKaydet(degisim) {
  tema = { ...tema, ...degisim };
  writeStore('local', K_TEMA, JSON.stringify(tema));
  window.dispatchEvent(new Event('bizim:tema'));
}

const temaRenk = renkGrubu('ayar-tema-renk', TEMA_RENKLERI.map((r) => ({ deger: r.id, ad: r.ad, renk: r.renk })), (id) => {
  temaKaydet({ renk: id });
  temaYenile();
  kaydedildi(temaRenkAlan, 'Uygulandı');
});
const temaRenkAlan = alan('Tema rengi', temaRenk, { grup: true });
const temaRenkAdi = h('span', { class: 'ayar-etiket-ek' });
temaRenkAlan.querySelector('.ayar-etiket').append(temaRenkAdi);

const modSeg = h('div', { class: 'seg ayar-seg', role: 'group', id: 'ayar-mod' },
  TEMA_MODLARI.map((m) => h('button', {
    type: 'button', dataset: { mod: m.id },
    onclick: () => { temaKaydet({ mod: m.id }); temaYenile(); kaydedildi(modAlan, 'Uygulandı'); },
  }, m.ad)));
const modAlan = alan('Açık / koyu', modSeg, { grup: true, yardim: 'Otomatik: telefonunun ayarına uyar.' });

function temaYenile() {
  temaRenk.sec(tema.renk);
  temaRenkAdi.textContent = ` · ${TEMA_RENKLERI.find((r) => r.id === tema.renk)?.ad || ''}`;
  for (const b of modSeg.children) b.setAttribute('aria-pressed', String(b.dataset.mod === tema.mod));
}

const sesAnahtar = anahtar('ayar-ses', !isMuted(), (ac) => {
  setMuted(!ac);
  if (ac) sfx('tap');
});
const sesSatiri = anahtarSatiri('Ses efektleri', 'Oyunlardaki ve dokunuşlardaki kısa sesler.', sesAnahtar);
window.addEventListener('bizim:mute', () => sesAnahtar.setAttribute('aria-checked', String(!isMuted())));
window.addEventListener('storage', (e) => { if (e.key === K_TEMA) { tema = parseTema(e.newValue); temaYenile(); } });

// ---------- Konum paylaşımı: tek satır, ayrıntı Konum sayfasında ----------
const konumDurum = h('span', { class: 'chip' });
const konumSatiri = h('div', { class: 'ayar-bolum' },
  h('a', { class: 'ayar-git', id: 'ayar-konum', href: pageUrl('sayfalar/konum/') },
    h('h2', { class: 'ayar-baslik' }, 'Konum paylaşımı'),
    konumDurum,
    h('span', { class: 'ayar-git-ok', 'aria-hidden': 'true' }, icon('chevron'))));

/** Kapalı / Yaklaşık / Tam / Canlı (kendi belgem). */
function konumCiz() {
  const durum = durumEtiketi(konumOku(konum.get(myId)?.data), Date.now());
  konumDurum.textContent = durum;
  konumDurum.classList.toggle('accent', durum !== 'Kapalı');
}

// ---------- Verilerimiz ----------
const DUZ_ETIKET = 'Düz yedek (fotoğrafsız)';
const yedekBtn = h('button', { type: 'button', class: 'btn small ghost', onclick: yedekIndir }, svg('indir'), h('span', {}, DUZ_ETIKET));

/** Tüm türlerin belgeleri → yedek nesnesi | null (hiçbiri alınamadı: toast gösterilmiş olur). */
async function belgeleriTopla(simdi) {
  const sonuclar = {};
  const hatalar = {};
  const sonuc = await Promise.allSettled(YEDEK_TURLERI.map((t) => listDocs(roomId, t)));
  sonuc.forEach((r, i) => {
    if (r.status === 'fulfilled') sonuclar[YEDEK_TURLERI[i]] = r.value;
    else hatalar[YEDEK_TURLERI[i]] = r.reason?.message || 'hata';
  });
  if (!Object.keys(sonuclar).length) {
    toast('Yedek alınamadı. Bağlantını kontrol edip tekrar dener misin?');
    return null;
  }
  return yedekVerisi({ sonuclar, hatalar, simdi });
}

async function yedekIndir() {
  const etiket = yedekBtn.querySelector('span:last-child');
  yedekBtn.disabled = true;
  yedekBtn.setAttribute('aria-busy', 'true');
  etiket.textContent = 'Hazırlanıyor…';
  try {
    const simdi = new Date();
    const yedek = await belgeleriTopla(simdi);
    if (!yedek) return;
    const cikti = await dosyaPaylas({
      metin: JSON.stringify(yedek, null, 2), ad: yedekDosyaAdi(simdi), tur: 'application/json',
      dialogBaslik: 'Yedeği kaydet', webShare: false,
    });
    const mesaj = yedekSonucMesaji(cikti, { sayi: yedekSayisi(yedek).toLocaleString('tr-TR'), eksik: !!yedek.eksik });
    if (mesaj) toast(mesaj, cikti === 'yok' || cikti === 'hata' ? { ms: 5000 } : undefined);
  } finally {
    yedekBtn.disabled = false;
    yedekBtn.removeAttribute('aria-busy');
    etiket.textContent = DUZ_ETIKET;
  }
}

// ---------- Tam yedek (parolalı, fotoğraf ve sesler dahil) ----------
/**
 * Metin girdili pencere. alanlar: [{ etiket, tur?, otomatik? }]. dogrula(değerler) -> hata metni | null.
 * -> değerler[] | null (vazgeçildi).
 */
function girdiPenceresi({ metin, alanlar, ok, dogrula }) {
  return new Promise((resolve) => {
    let sonuc = null;
    const hata = h('p', { class: 'ayar-hata', role: 'alert' });
    const girdiler = alanlar.map((a) => h('input', {
      class: 'input', type: a.tur || 'password', autocomplete: a.otomatik || 'new-password', autocapitalize: 'off', spellcheck: 'false',
    }));
    const dlg = h('dialog', { class: 'ui-dialog', 'aria-label': ok });
    const form = h('form', { class: 'dialog-card stack', method: 'dialog' },
      h('p', { class: 'dialog-text' }, metin),
      ...alanlar.map((a, i) => h('label', { class: 'ayar-parola' }, h('span', { class: 'ayar-etiket' }, a.etiket), girdiler[i])),
      hata,
      h('div', { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Vazgeç'),
        h('button', { type: 'submit', class: 'btn primary' }, ok)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const degerler = girdiler.map((g) => g.value);
      const sorun = dogrula?.(degerler);
      if (sorun) {
        hata.textContent = sorun;
        return;
      }
      sonuc = degerler;
      dlg.close();
    });
    dlg.append(form);
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(sonuc);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

const yedekSonSatir = h('p', { class: 'ayar-yardim' });
const yedekSonCiz = () => { yedekSonSatir.textContent = yedekSonGun(sonYedek(roomId)); };
const TAM_ETIKET = 'Tam yedek al';
const tamBtn = h('button', { type: 'button', class: 'btn small primary', onclick: tamYedekAl }, svg('indir'), h('span', {}, TAM_ETIKET));

async function tamYedekAl() {
  if (!sifreDestegi()) {
    toast('Parolalı yedek bu adreste çalışmaz. Siteyi https adresinden ya da uygulamadan aç.', { ms: 6000 });
    return;
  }
  const girdi = await girdiPenceresi({
    metin: 'Yedek bu parolayla şifrelenir. Parolayı unutursan dosya açılmaz; kimse geri getiremez.',
    alanlar: [{ etiket: 'Parola (en az 8 karakter)' }, { etiket: 'Parola tekrar' }],
    ok: 'Yedeği hazırla',
    dogrula: ([p, t]) => parolaHatasi(p, t),
  });
  if (!girdi) return;
  for (const b of [tamBtn, geriBtn, yedekBtn]) b.disabled = true;
  tamBtn.setAttribute('aria-busy', 'true');
  geriKutu.hidden = false;
  geriIlerleme.value = 0;
  geriDurum.textContent = 'Kayıtlar okunuyor…';
  try {
    const simdi = new Date();
    const yedek = await belgeleriTopla(simdi);
    if (!yedek) return;
    const { blob, medyaSayisi, eksikMedya } = await tamYedekUret({
      yedek,
      parola: girdi[0],
      indir: loadPhoto,
      onIlerleme: (biten, toplam) => {
        geriIlerleme.max = toplam;
        geriIlerleme.value = biten;
        geriDurum.textContent = `Yedek hazırlanıyor… ${sayi(biten)} / ${sayi(toplam)}`;
      },
    });
    const cikti = await dosyaPaylas({
      blob, ad: tamYedekDosyaAdi(simdi), tur: 'application/octet-stream', dialogBaslik: 'Yedeği kaydet', webShare: false,
    });
    const mesaj = yedekSonucMesaji(cikti, { sayi: `${sayi(yedekSayisi(yedek))} kayıt ve ${sayi(medyaSayisi)} dosya`, eksik: !!yedek.eksik || eksikMedya.length > 0 });
    if (cikti === 'indirildi' || cikti === 'paylasildi') {
      yedekAlindi(roomId, simdi);
      yedekSonCiz();
    }
    if (mesaj) toast(eksikMedya.length ? `${mesaj} Alınamayan dosya: ${sayi(eksikMedya.length)}.` : mesaj, { ms: 6000 });
  } catch (e) {
    console.warn('[yedek]', e);
    toast('Yedek hazırlanamadı. Telefonda yer azsa bilgisayardan dene.', { ms: 6000 });
  } finally {
    for (const b of [tamBtn, geriBtn, yedekBtn]) b.disabled = false;
    tamBtn.removeAttribute('aria-busy');
    geriKutu.hidden = true;
  }
}

// Yedekten geri yükleme: dosya → doğrula → özet + onay → 200'lük parçalarla doc_ice_aktar → ilerleme → toast.
const PARCA = 200;
const sayi = (n) => n.toLocaleString('tr-TR');
const geriSecici = h('input', { type: 'file', accept: '.json,.bizyedek,application/json,application/octet-stream', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
const geriBtn = h('button', { type: 'button', class: 'btn small', onclick: () => geriSecici.click() }, svg('yukle'), h('span', {}, 'Yedekten geri yükle'));
const geriIlerleme = h('progress', { class: 'ayar-ilerleme', max: '1', value: '0', 'aria-labelledby': 'ayar-geri-durum' });
const geriDurum = h('p', { class: 'ayar-yardim', id: 'ayar-geri-durum', role: 'status' });
const geriKutu = h('div', { class: 'ayar-geri', hidden: true }, geriDurum, geriIlerleme);
geriSecici.addEventListener('change', () => {
  const f = geriSecici.files?.[0];
  geriSecici.value = '';
  if (f) geriYukle(f);
});

/** Parolalı yedek: parola sor, aç, onay al; önce dosyalar, sonra kayıtlar. */
async function tamGeriYukle(dosya) {
  if (!sifreDestegi()) {
    toast('Parolalı yedek bu adreste açılmaz. Siteyi https adresinden ya da uygulamadan aç.', { ms: 6000 });
    return;
  }
  const girdi = await girdiPenceresi({
    metin: 'Bu yedek parolalı. Yedeği alırken yazdığın parolayı gir.',
    alanlar: [{ etiket: 'Parola', otomatik: 'current-password' }],
    ok: 'Aç',
  });
  if (!girdi) return;
  let acik;
  try {
    acik = await tamYedekOku(dosya, girdi[0]);
  } catch (e) {
    toast(e instanceof YedekHatasi ? e.message : 'Yedek açılamadı.', { ms: 6000 });
    return;
  }
  const { belgeler, hatalar, sayilar } = yedektenBelgeler(acik.yedek);
  if (!belgeler.length) {
    toast(hatalar[0] || 'Bu yedekte geri yüklenecek kayıt yok.');
    return;
  }
  const medya = yedekMedyalari(acik.yedek);
  const atlanan = hatalar.length ? ' Okunamayan birkaç kayıt atlanır.' : '';
  const ok = await confirmDialog(`${yedekOzeti(sayilar)}, ${sayi(medya.length)} dosya.${atlanan} Var olan kayıtlar silinmez; daha yeni kopyalar korunur; silinmiş kayıtlar geri gelir.`, { ok: 'Geri yükle' });
  if (!ok) return;

  await geriYuklemeCalistir(belgeler, async () => {
    const yerel = isLocalMode();
    let varOlan = new Set();
    if (!yerel) {
      try {
        varOlan = new Set((await medyaVarMi(roomId, medya.map(medyaYolu).filter(Boolean))).var);
      } catch { /* bilinmiyor: yükleme 409 ile yine atlar */ }
    }
    let biten = 0;
    geriIlerleme.max = Math.max(medya.length, 1);
    const ilerle = (n) => {
      biten = n;
      geriIlerleme.value = biten;
      geriDurum.textContent = `Dosyalar yükleniyor… ${sayi(biten)} / ${sayi(medya.length)}`;
    };
    ilerle(0);
    try {
      return await medyaEsle({
        roomId, yerel, varOlan, medyalar: acik.medyalar(), geriYukle: medyaGeriYukle, yeniFoto: uploadPhoto, yeniSes: uploadAudio, onIlerleme: ilerle,
      });
    } catch (e) {
      // Dosyanın devamı bozuk: elde kalan kayıtlar yine yüklensin.
      return { harita: new Map(), yuklenen: biten, atlanan: 0, hata: 1, ilkHata: e?.message || 'Yedek dosyası bozulmuş.' };
    }
  });
}

async function geriYukle(dosya) {
  let sifreli = false;
  try { sifreli = await sifreliMi(dosya); } catch { /* aşağıda okuma hatası verir */ }
  if (sifreli) {
    await tamGeriYukle(dosya);
    return;
  }
  if (dosya.size > 25 * 1024 * 1024) {
    toast('Bu dosya bir Biz İkimiz yedeği olamayacak kadar büyük.');
    return;
  }
  let metin;
  try { metin = await dosya.text(); } catch { toast('Dosya okunamadı. Başka bir dosya dener misin?'); return; }
  const { belgeler, hatalar, sayilar } = yedektenBelgeler(metin);
  if (!belgeler.length) {
    toast(hatalar[0] || 'Bu yedekte geri yüklenecek kayıt yok.');
    return;
  }
  const atlanan = hatalar.length ? ' Okunamayan birkaç kayıt atlanır.' : '';
  const ok = await confirmDialog(`${yedekOzeti(sayilar)}.${atlanan} Var olan kayıtlar silinmez; daha yeni kopyalar korunur; silinmiş kayıtlar geri gelir.`, { ok: 'Geri yükle' });
  if (!ok) return;
  await geriYuklemeCalistir(belgeler);
}

/** Belgeleri parçalarla yazar; önce medyaAdimi (varsa) dosyaları koyar ve yeni başvuruları verir. */
async function geriYuklemeCalistir(belgelerIlk, medyaAdimi = null) {
  let belgeler = belgelerIlk;
  const toplam = belgeler.length;
  let giden = 0;
  let yazilan = 0;
  let medya = null;
  for (const b of [geriBtn, yedekBtn, tamBtn]) { b.disabled = true; }
  geriBtn.setAttribute('aria-busy', 'true');
  geriKutu.hidden = false;
  const ilerle = () => {
    geriIlerleme.value = giden;
    geriDurum.textContent = `Geri yükleniyor… ${sayi(giden)} / ${sayi(toplam)}`;
  };
  try {
    if (medyaAdimi) {
      medya = await medyaAdimi();
      belgeler = belgelereUygula(belgeler, medya.harita);
    }
    geriIlerleme.max = toplam;
    for (const parca of parcala(belgeler, PARCA)) {
      ilerle();
      yazilan += await iceAktar(roomId, parca);
      giden += parca.length;
    }
    ilerle();
    // Geri gelen kayıtların tarihi eski olabilir: önbellekler baştan yüklensin, bu sayfa tam tazelensin.
    onbellekTemizle(roomId, YEDEK_TURLERI);
    profil.kisiler.refresh({ tam: true });
    profil.ciftKoleksiyon.refresh({ tam: true });
    konum.refresh({ tam: true });
    copYukle({ zorla: true }); // yedek silinmiş kayıtları geri getirmiş olabilir
    sfx('pop');
    const dosyaMetni = medya ? ` Dosya: ${sayi(medya.yuklenen)} yüklendi, ${sayi(medya.atlanan)} zaten vardı.` : '';
    const dosyaHata = medya?.hata ? ` ${sayi(medya.hata)} dosya yüklenemedi: ${medya.ilkHata}` : '';
    toast((yazilan
      ? `Geri yükleme bitti: ${sayi(yazilan)} kayıt eklendi ya da güncellendi.`
      : 'Geri yükleme bitti. Yedekteki kayıtlar zaten burada.') + dosyaMetni + dosyaHata, dosyaHata ? { ms: 10000 } : undefined);
    kullanimYukle();
  } catch (e) {
    const kalan = giden ? ` ${sayi(giden)} kayıt yüklendi; kalanı için yeniden deneyebilirsin.` : '';
    toast(`${e?.message || 'Geri yüklenemedi.'}${kalan}`, { ms: 8000 });
  } finally {
    for (const b of [geriBtn, yedekBtn, tamBtn]) { b.disabled = false; }
    geriBtn.removeAttribute('aria-busy');
    geriKutu.hidden = true;
  }
}

// ---------- Son silinenler ----------
// Silme veriyi korur; içerik türlerinin son 50 silineni listelenir. Geri al = putDoc (deleted=false). İkiniz de geri alırsınız.
const COP_SAYFA = { mesaj: 'sohbet', ani: 'anilar', mektup: 'mektup', gun: 'gunler', liste: 'listeler', randevu: 'randevu', harcama: 'harcama', kupon: 'kupon', gunfoto: 'gunfoto' };
const copIcerik = h('div', { class: 'cop-icerik' });
let copKayitlar = null; // null: yüklenmedi
let copEksik = false;
let copHata = '';
let copYukleniyor = false;
let copSon = 0;

async function copYukle({ zorla = false } = {}) {
  if (copYukleniyor || (!zorla && Date.now() - copSon < 30_000)) return;
  copYukleniyor = true;
  copHata = '';
  if (!copKayitlar) copCiz();
  try {
    const sonuc = await Promise.allSettled(COP_TURLERI.map((t) => listDocs(roomId, t)));
    const sonuclar = {};
    sonuc.forEach((r, i) => { if (r.status === 'fulfilled') sonuclar[COP_TURLERI[i]] = r.value; });
    if (!Object.keys(sonuclar).length) {
      copHata = sonuc[0]?.reason?.message || 'Liste alınamadı.';
    } else {
      copKayitlar = copListesi(sonuclar);
      copEksik = Object.keys(sonuclar).length < COP_TURLERI.length;
      copSon = Date.now();
    }
  } finally {
    copYukleniyor = false;
    copCiz();
  }
}

function copAdlar() {
  const adlar = {};
  for (const d of profil.kisiler.all()) if (d.data?.ad) adlar[d.id] = d.data.ad;
  return adlar;
}

function copSatiri(k, adlar) {
  const o = copOnizleme(k.tur, k.data);
  const simge = h('span', { class: 'cop-simge', 'aria-hidden': 'true' }, sayfaById(COP_SAYFA[k.tur])?.icon || '🗂️');
  if (o.foto) {
    const img = h('img', { alt: '', decoding: 'async', loading: 'lazy', hidden: true });
    simge.append(img);
    fotoKoy(img, o.foto);
  }
  return h('li', { class: 'cop', dataset: { tur: k.tur, id: k.id } },
    simge,
    h('div', { class: 'cop-metin' },
      h('p', { class: 'cop-baslik' }, o.metin),
      h('p', { class: 'cop-alt' }, `${o.tur} · ${copKimZaman(k.author, k.updated_at, { benId: myId, adlar })}`)),
    h('div', { class: 'cop-eylem' },
      islem('Geri al', 'btn small', `Geri al: ${o.tur}, ${o.metin}`, () => geriAl(k)),
      islem('Kalıcı sil', 'btn small ghost', `Kalıcı sil: ${o.tur}, ${o.metin}`, () => copKaliciSil(k))));
}

async function copKaliciSil(k) {
  const ok = await confirmDialog('Bu kayıt ve fotoğrafı ya da sesi sunucudan da silinecek. Geri alınamaz.', { ok: 'Kalıcı sil' });
  if (!ok) return;
  try {
    await kaliciSil(roomId, k.tur, k.id);
  } catch (e) {
    toast(e?.message || 'Silinemedi. Bağlantını kontrol et.');
    return;
  }
  copKayitlar = copKayitlar.filter((x) => x !== k);
  copCiz();
  copIcerik.querySelector('.cop .btn, [tabindex="-1"]')?.focus();
  toast('Kalıcı olarak silindi.');
}

// ---------- Kullanım göstergesi ----------
const kullanimMetin = h('p', { class: 'ayar-kullanim-metin' });
const kullanimCubuk = h('progress', { class: 'ayar-ilerleme', max: '1', value: '0', 'aria-label': 'Fotoğraf ve ses alanı' });
const kullanimAlt = h('p', { class: 'ayar-yardim' });
const kullanimKutu = kart(h('div', { class: 'ayar-alan' },
  h('div', { class: 'ayar-alan-ust' }, h('h3', { class: 'ayar-etiket' }, 'Fotoğraf ve ses alanı')), kullanimMetin, kullanimCubuk, kullanimAlt));
kullanimKutu.hidden = true;

async function kullanimYukle() {
  let g = null;
  try {
    g = kullanimGorunum(await medyaKullanim(roomId));
  } catch (e) {
    console.warn('[kullanım]', e?.message || e); // işlev henüz yayında değilse gösterge çıkmaz
  }
  kullanimKutu.hidden = !g;
  if (!g) return;
  kullanimMetin.textContent = g.metin;
  kullanimCubuk.value = g.oran;
  kullanimAlt.textContent = g.uyari ? `${g.alt}. ${g.uyari}` : g.alt;
}

async function geriAl(k) {
  let doc;
  try {
    doc = await putDoc(roomId, k.tur, k.id, k.data, myId);
  } catch (e) {
    toast(e?.message || 'Geri alınamadı. Bağlantını kontrol et.');
    return;
  }
  room.sendAll?.({ t: 'veri', kind: k.tur, doc }); // açık sayfalar (ikinizde de) hemen görsün
  const sira = copKayitlar.indexOf(k);
  copKayitlar = copKayitlar.filter((x) => x !== k);
  copCiz();
  const dugmeler = copIcerik.querySelectorAll('.cop .btn');
  (dugmeler[Math.min(sira, dugmeler.length - 1)] || copIcerik.querySelector('[tabindex="-1"]'))?.focus();
  sfx('pop');
  toast('Geri geldi 💞');
}

function copCiz() {
  if (!copKayitlar) {
    copIcerik.replaceChildren(copHata
      ? h('div', { class: 'ayar-eylemler' },
        h('p', { class: 'ayar-satir-aciklama' }, copHata),
        h('button', { type: 'button', class: 'btn small', onclick: () => copYukle({ zorla: true }) }, 'Tekrar dene'))
      : h('p', { class: 'ayar-satir-aciklama', role: 'status', 'aria-busy': 'true' }, 'Yükleniyor…'));
    return;
  }
  if (!copKayitlar.length) {
    copIcerik.replaceChildren(h('p', { class: 'ayar-satir-aciklama', tabindex: '-1' }, 'Silinen bir şey yok.'));
    return;
  }
  const adlar = copAdlar();
  copIcerik.replaceChildren(...[
    h('ul', { class: 'cop-liste', 'aria-labelledby': 'ayar-cop-h' }, copKayitlar.map((k) => copSatiri(k, adlar))),
    copEksik ? h('p', { class: 'ayar-yardim' }, 'Bazı bölümler alınamadı; liste eksik olabilir.') : null,
  ].filter(Boolean));
}

const copKart = kart(h('div', { class: 'ayar-alan' },
  h('div', { class: 'ayar-alan-ust' }, h('h3', { class: 'ayar-etiket', id: 'ayar-cop-h' }, 'Son silinenler')),
  h('p', { class: 'ayar-yardim' }, 'Silinen şeyler kaybolmaz. İkiniz de buradan geri alabilirsiniz.'),
  copIcerik));

// ---------- Cihazlar (TALIMAT §5.4) ----------
// Mod: 'sunucu' | 'yerel-siki' → tam yönetim; 'eski-sunucu' → bilgi + kodsuz link; 'yerel-gevsek' → bilgi + bu cihaz.
const uyeModu = () => ['sunucu', 'yerel-siki'].includes(uyelikModu(roomId));
const cihazKutu = kart();
let cihazListe = null; // son başarılı liste
let cihazHata = false;
let cihazSira = 0;
let davetUrl = null; // bu sayfada oluşturulan davet linki
let yeniTel = null; // bu sayfada oluşturulan yeni telefon linki: { ad, url }
let kurtarmaKodu = null; // bir kez gösterilir (sayfadan çıkınca kaybolur)

const DURUM_ADI = { onayli: 'Onaylı', bekliyor: 'Onay bekliyor', reddedildi: 'Reddedildi' };
const SIRA = { bekliyor: 0, onayli: 2, reddedildi: 3 };
const cihazTuru = (ad) => (/iPad|tablet/i.test(ad || '') ? 'tablet' : /telefon|iPhone/i.test(ad || '') ? 'telefon' : 'bilgisayar');

async function cihazYukle() {
  const sira = ++cihazSira;
  try {
    const l = await cihazlar(roomId);
    if (sira !== cihazSira) return;
    cihazListe = l;
    cihazHata = false;
  } catch {
    if (sira !== cihazSira) return;
    cihazHata = true;
  }
  cihazCiz();
}

function islem(etiket, sinif, aria, is) {
  const b = h('button', { type: 'button', class: sinif, 'aria-label': aria }, etiket);
  b.addEventListener('click', async () => {
    b.disabled = true;
    b.setAttribute('aria-busy', 'true');
    try { await is(); } finally {
      if (b.isConnected) { b.disabled = false; b.removeAttribute('aria-busy'); }
    }
  });
  return b;
}

async function onayla(c, ad) {
  if (await cihazOnayla(roomId, c.cihaz)) {
    sfx('pop');
    toast(`${ad} onaylandı. Artık odanızda.`);
    room.sendAll({ t: 'uyelik' });
  } else {
    toast('Onaylanamadı. Biraz sonra tekrar dener misin?');
  }
  await cihazYukle();
}

async function reddet(c) {
  toast(await cihazReddet(roomId, c.cihaz) ? 'İstek reddedildi.' : 'Reddedilemedi. Biraz sonra tekrar dener misin?');
  await cihazYukle();
}

async function cikar(c, ad) {
  const ok = await confirmDialog(`${ad} çıkarılsın mı? Bu cihaz artık verilerinize erişemez.`, { ok: 'Çıkar' });
  if (!ok) return;
  toast(await cihazCikar(roomId, c.cihaz) ? `${ad} çıkarıldı.` : 'Çıkarılamadı. Biraz sonra tekrar dener misin?');
  await cihazYukle();
}

function cihazSatiri(c) {
  const ad = c.ad || 'Adsız cihaz';
  const zaman = c.son_gorulme ? `son görülme ${formatDay(c.son_gorulme)}`
    : c.durum === 'bekliyor' && c.olusturma ? `${formatDay(c.olusturma)} istedi` : '';
  const eylem = [];
  if (c.durum === 'bekliyor') {
    eylem.push(islem('Onayla', 'btn small primary', `${ad}: onayla`, () => onayla(c, ad)),
      islem('Reddet', 'btn small ghost', `${ad}: reddet`, () => reddet(c)));
  } else if (c.durum === 'reddedildi') {
    eylem.push(islem('Onayla', 'btn small', `${ad}: onayla`, () => onayla(c, ad)));
  } else if (!c.ben && uyeModu()) {
    eylem.push(islem('Çıkar', 'btn small danger', `${ad}: odadan çıkar`, () => cikar(c, ad)));
  }
  return h('li', { class: 'cihaz', dataset: { durum: c.durum } },
    h('span', { class: 'cihaz-simge', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" ${STROKE}>${SVG[cihazTuru(ad)]}</svg>` }),
    h('div', { class: 'cihaz-metin' },
      h('p', { class: 'cihaz-ad' }, h('span', {}, ad), c.ben ? h('span', { class: 'chip accent' }, 'Bu cihaz') : null),
      h('p', { class: 'cihaz-alt' }, [DURUM_ADI[c.durum] || c.durum, zaman].filter(Boolean).join(' · '))),
    eylem.length ? h('div', { class: 'cihaz-eylemler' }, eylem) : null);
}

function davetAlani() {
  const kodlu = uyeModu();
  const yardim = kodlu
    ? 'Bu linkle gelen cihaz onay beklemeden girer. 7 gün geçerli, tek kullanımlık.'
    : 'Bu link odanızın anahtarı. Yalnız sevgilinle paylaş.';
  const url = davetUrl || (kodlu ? null : inviteUrl(roomId));
  const icerik = [];
  if (url) {
    icerik.push(h('div', { class: 'linkbox' },
      h('input', {
        class: 'input', id: 'ayar-davet', type: 'text', readonly: true, value: url, 'aria-describedby': 'ayar-davet-y',
        onfocus: (e) => e.currentTarget.select(), onclick: (e) => e.currentTarget.select(),
      }),
      h('button', { type: 'button', class: 'btn small', onclick: () => copyInvite(roomId) }, icon('copy'), 'Kopyala')),
    h('div', { class: 'ayar-eylemler' },
      h('button', { type: 'button', class: 'btn small', onclick: () => shareInvite(roomId) }, icon('share'), 'Linki paylaş'),
      kodlu ? islem('Yeni link', 'btn small ghost', 'Yeni davet linki oluştur', davetOlusturVeGoster) : null));
  } else {
    icerik.push(h('div', { class: 'ayar-eylemler' },
      islem('Davet linki oluştur', 'btn small primary', null, davetOlusturVeGoster)));
  }
  return h('div', { class: 'ayar-alan' },
    h('div', { class: 'ayar-alan-ust' }, h(url ? 'label' : 'span', { class: 'ayar-etiket', for: url ? 'ayar-davet' : null }, 'Davet linki')),
    ...icerik,
    h('p', { class: 'ayar-yardim', id: 'ayar-davet-y' }, yardim));
}

// Tarayıcıdaki kimlik ve cihaz anahtarı Android uygulamasına (APK ayrı depo kullanır) yapıştırılarak taşınır.
function tasimaAlani() {
  const kopyala = async () => {
    const ok = await confirmDialog('Bu link bu cihazın anahtarını taşır. Yalnız kendi telefonundaki Biz İkimiz uygulamasına yapıştır; kimseyle paylaşma. 30 dakika geçerli.', { ok: 'Linki kopyala' });
    if (!ok) return;
    const url = tasimaLinki(roomId);
    if (await copyText(url)) {
      toast('Kopyalandı. Uygulamayı aç; ilk ekranda ya da Ayarlar → Oda bölümünde "Linki buraya yapıştır" alanına yapıştır.');
    } else {
      kutu.replaceChildren(h('input', {
        class: 'input', type: 'text', readonly: true, value: url, 'aria-label': 'Taşıma linki',
        onfocus: (e) => e.currentTarget.select(), onclick: (e) => e.currentTarget.select(),
      }));
    }
  };
  const kutu = h('div');
  return h('div', { class: 'ayar-alan' },
    h('div', { class: 'ayar-alan-ust' }, h('span', { class: 'ayar-etiket' }, 'Uygulamaya taşı')),
    h('p', { class: 'ayar-yardim' }, 'Bu telefona Biz İkimiz uygulamasını kurduysan, buradaki seni (mesajların, anıların, adın) uygulamaya taşı.'),
    h('div', { class: 'ayar-eylemler' }, h('button', { type: 'button', class: 'btn small', onclick: kopyala }, icon('copy'), 'Taşıma linkini kopyala')),
    kutu);
}

async function davetOlusturVeGoster() {
  const kod = await davetHazirla(roomId, { yeni: true });
  if (!kod) toast('Davet kodu alınamadı. Kodsuz linkle gelen cihaz onay bekler.');
  davetUrl = inviteUrl(roomId, kod);
  cihazCiz();
  document.getElementById('ayar-davet')?.focus();
}

// Yeni telefon linki: kişiye bağlı davet (uyelik.js davetOlustur kimlik). Sevgilin uygulamayı yeniden kurunca ya da
// telefon değiştirince kimliğini (verisini) geri alır; sunucu bu daveti yalnız o kimliğe verir. Anahtar taşımaz.
// Kişiler: kisi belgeleri, benim dışımdakiler (en son güncellenen önce).
async function yeniTelefonLinki(d) {
  const ad = String(d.data?.ad || '').trim();
  const kod = await davetOlustur(roomId, { kimlik: d.id });
  if (!kod) {
    toast('Link oluşturulamadı. Biraz sonra tekrar dener misin?');
    return;
  }
  yeniTel = { ad: ad || 'Sevgilin', url: buildTasimaUrl(SITE_ROOT, { oda: roomId, davet: kod, kim: d.id, ad }) };
  cihazCiz();
  document.getElementById('ayar-yenitel')?.focus();
}

async function yeniTelefonKopyala() {
  toast(await copyText(yeniTel.url)
    ? "Kopyalandı. Sevgiline gönder; uygulamada 'Linki buraya yapıştır' alanına yapıştırsın."
    : 'Kopyalanamadı. Linki seçip elle kopyala.');
}

async function yeniTelefonPaylas() {
  const durum = await paylas("Biz İkimiz'e yeni telefonundan dön: uygulamada 'Linki buraya yapıştır' alanına yapıştır.", yeniTel.url);
  if (durum !== 'shared' && durum !== 'cancelled') await yeniTelefonKopyala();
}

function yeniTelefonAlani() {
  const kisiler = profil.kisiler.all().filter((d) => d.id !== myId)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  if (!kisiler.length) return null;
  const satir = (d) => {
    const ad = String(d.data?.ad || '').trim() || 'Sevgilin';
    const cihaz = (cihazListe || []).find((c) => c.cihaz === d.id);
    return h('li', { class: 'cihaz' },
      h('span', { class: 'cihaz-simge', 'aria-hidden': 'true' }, initial(ad)),
      h('div', { class: 'cihaz-metin' },
        h('p', { class: 'cihaz-ad' }, h('span', {}, ad)),
        cihaz?.ad ? h('p', { class: 'cihaz-alt' }, cihaz.ad) : null),
      h('div', { class: 'cihaz-eylemler' },
        islem('Yeni telefonu için link', 'btn small', `${ad}: yeni telefonu için link`, () => yeniTelefonLinki(d))));
  };
  const link = yeniTel ? [
    h('div', { class: 'linkbox' },
      h('input', {
        class: 'input', id: 'ayar-yenitel', type: 'text', readonly: true, value: yeniTel.url,
        'aria-label': `${yeniTel.ad} için yeni telefon linki`,
        onfocus: (e) => e.currentTarget.select(), onclick: (e) => e.currentTarget.select(),
      }),
      h('button', { type: 'button', class: 'btn small', onclick: yeniTelefonKopyala }, icon('copy'), 'Kopyala')),
    h('div', { class: 'ayar-eylemler' },
      h('button', { type: 'button', class: 'btn small', onclick: yeniTelefonPaylas }, icon('share'), 'Linki paylaş')),
  ] : [];
  return h('div', { class: 'ayar-alan' },
    h('div', { class: 'ayar-alan-ust' }, h('span', { class: 'ayar-etiket' }, 'Yeni telefon linki')),
    h('p', { class: 'ayar-yardim' }, "Sevgilin uygulamayı yeniden kurduysa ya da telefon değiştirdiyse bu linki gönder. Uygulamada 'Linki buraya yapıştır'a yapıştırınca her şeyi geri gelir. 7 gün geçerli, tek kullanımlık."),
    h('ul', { class: 'cihaz-liste', 'aria-label': 'Yeni telefon linki verilecek kişiler' }, kisiler.map(satir)),
    ...link);
}

function kurtarmaAlani() {
  const ust = h('div', { class: 'ayar-alan-ust' }, h('span', { class: 'ayar-etiket' }, 'Kurtarma kodu'));
  const metin = 'Bu kodu güvenli bir yere yaz. Tüm cihazların kaybolursa odaya bununla dönersin. Yeni kod eskisini geçersiz yapar.';
  if (kurtarmaKodu) {
    return h('div', { class: 'ayar-alan' }, ust,
      h('div', { class: 'ayar-kod' },
        h('span', { class: 'ayar-kod-deger', id: 'ayar-kurtarma-kod', tabindex: '-1' }, kurtarmaKodu),
        h('button', {
          type: 'button', class: 'btn small', 'aria-label': 'Kurtarma kodunu kopyala',
          onclick: async () => toast(await copyText(kurtarmaKodu) ? 'Kod kopyalandı' : 'Kopyalanamadı. Kodu elle yaz.'),
        }, svg('kopya'), 'Kopyala')),
      h('p', { class: 'ayar-yardim' }, metin),
      h('p', { class: 'ayar-yardim ayar-vurgu' }, 'Bu kod bir daha gösterilmez.'));
  }
  return h('div', { class: 'ayar-alan' }, ust,
    h('p', { class: 'ayar-yardim' }, metin),
    h('div', { class: 'ayar-eylemler' },
      islem('Kurtarma kodu oluştur', 'btn small', null, async () => {
        try {
          kurtarmaKodu = await kurtarmaOlustur(roomId);
        } catch {
          toast('Kurtarma kodu oluşturulamadı. Biraz sonra tekrar dener misin?');
          return;
        }
        cihazCiz();
        document.getElementById('ayar-kurtarma-kod')?.focus();
      })));
}

/** Taşıma yalnız tarayıcıda, sunucu modunda ve bu cihaz onaylıyken anlamlı. */
const tasimaGoster = (mod) => !isNative() && mod === 'sunucu' && (cihazListe || []).some((c) => c.ben && c.durum === 'onayli');

function cihazCiz() {
  const mod = uyelikModu(roomId);
  const ayrac = () => h('div', { class: 'ayar-ayrac' });
  if (mod === 'eski-sunucu') {
    cihazKutu.replaceChildren(bilgi('Sunucu güncellenince burada cihazlarınız görünecek.'), ayrac(), davetAlani());
    return;
  }
  let liste;
  if (cihazListe) {
    const sirali = [...cihazListe].sort((a, b) => ((SIRA[a.durum] ?? 4) - (a.ben ? 1 : 0)) - ((SIRA[b.durum] ?? 4) - (b.ben ? 1 : 0)));
    liste = h('ul', { class: 'cihaz-liste', 'aria-label': 'Odadaki cihazlar' }, sirali.map(cihazSatiri));
  } else if (cihazHata) {
    liste = h('div', { class: 'ayar-eylemler' },
      h('p', { class: 'ayar-satir-aciklama' }, 'Cihaz listesi alınamadı.'),
      h('button', { type: 'button', class: 'btn small', onclick: cihazYukle }, 'Tekrar dene'));
  } else {
    liste = h('p', { class: 'ayar-satir-aciklama', role: 'status', 'aria-busy': 'true' }, 'Cihazlar yükleniyor…');
  }
  const bekleyen = (cihazListe || []).filter((c) => c.durum === 'bekliyor').length;
  const yeniTelAlan = mod === 'yerel-gevsek' ? null : yeniTelefonAlani();
  cihazKutu.replaceChildren(...[
    mod === 'yerel-gevsek'
      ? bilgi('Yerel test modu: her cihaz onaylı sayılır.')
      : h('p', { class: 'ayar-satir-aciklama' }, bekleyen
        ? 'Yeni bir cihaz odanıza katılmak istiyor. Tanıyorsan onayla.'
        : 'Odanıza yalnız onayladığınız cihazlar girer.'),
    liste,
    ayrac(),
    davetAlani(),
    yeniTelAlan ? ayrac() : null,
    yeniTelAlan,
    mod === 'yerel-gevsek' ? null : ayrac(),
    mod === 'yerel-gevsek' ? null : kurtarmaAlani(),
    tasimaGoster(mod) ? ayrac() : null,
    tasimaGoster(mod) ? tasimaAlani() : null,
  ].filter(Boolean));
}

// ---------- Oda ----------
// APK linkleri kendisi açamaz: davet ya da taşıma linki buraya yapıştırılır (odasız ekrandaki alanla aynı).
const linkGirdi = h('input', {
  class: 'input', id: 'ayar-link', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false',
  enterkeyhint: 'go', placeholder: 'Linki buraya yapıştır', 'aria-describedby': 'ayar-link-y',
});
const linkFormu = h('form', {
  class: 'ayar-alan',
  novalidate: true,
  onsubmit: async (e) => {
    e.preventDefault();
    const p = parseYapistirilanLink(linkGirdi.value);
    if (!p) {
      toast('Bu bir Biz İkimiz linkine benzemiyor.');
      linkGirdi.focus();
      return;
    }
    if (p.oda === roomId && !p.kim && !p.davet) {
      toast('Zaten bu odadasın.');
      return;
    }
    const metin = p.kim
      ? `Bu cihaz ${p.ad || 'linkteki kişi'} olarak linkteki odaya geçsin mi? Şu anki odadaki veriler silinmez.`
      : 'Bu cihaz linkteki odaya geçsin mi? Şu anki odadaki veriler silinmez.';
    if (!(await confirmDialog(metin, { ok: 'Odaya geç' }))) return;
    yapistirilanLinkiUygula(p);
    location.replace(lobbyUrl());
  },
},
  h('div', { class: 'ayar-alan-ust' }, h('label', { class: 'ayar-etiket', for: 'ayar-link' }, 'Başka bir odaya geç')),
  linkGirdi,
  h('p', { class: 'ayar-yardim', id: 'ayar-link-y' }, 'Sevgilinin davet linkini ya da tarayıcıdan aldığın taşıma linkini yapıştır.'),
  h('div', { class: 'ayar-eylemler' }, h('button', { type: 'submit', class: 'btn small' }, 'Linki uygula')));

// ---------- Odayı tamamen sil (iki onay) ----------
const odaSilKutu = h('div', { class: 'ayar-tehlike', hidden: true });

async function odaSilOnayAkisi() {
  const girdi = await girdiPenceresi({
    metin: 'Bu oda; mesajlar, anılar, fotoğraflar ve seslerle birlikte ikiniz için de kalıcı olarak silinir. Geri dönüşü yok. Önce tam yedek al. Onaylamak için SİL yaz.',
    alanlar: [{ etiket: 'Onay', tur: 'text', otomatik: 'off' }],
    ok: 'Odayı sil',
    dogrula: ([m]) => (m.trim().toLocaleUpperCase('tr') === 'SİL' ? null : 'Onaylamak için SİL yaz.'),
  });
  if (!girdi) return;
  try {
    if (!(await odaSilOnayla(roomId))) throw new Error('Silinemedi.');
  } catch (e) {
    toast(/ikinci cihaz/.test(e?.message || '') ? 'Bu isteği başka bir cihaz onaylamalı.' : 'Oda silinemedi. Bağlantını kontrol et.');
    odaSilCiz();
    return;
  }
  await cihazdanUnut(roomId);
  location.replace(lobbyUrl());
}

async function odaSilCiz() {
  let d = null;
  try {
    d = await odaSilDurum(roomId);
  } catch (e) {
    console.warn('[oda sil]', e?.message || e);
  }
  const g = odaSilGorunum(d);
  odaSilKutu.hidden = g === 'yok';
  if (g === 'yok') return;
  const kalan = d.bekliyor ? Math.max(1, Math.ceil((Date.parse(d.son) - Date.now()) / 3_600_000)) : 0;
  if (g === 'bos') {
    odaSilKutu.replaceChildren(
      h('p', { class: 'ayar-satir-aciklama' }, 'Odayı tamamen silmek ikinizin de onayını ister. Mesajlar, anılar, fotoğraflar ve sesler sunucudan kalıcı olarak silinir.'),
      islem('Odayı tamamen sil', 'btn small danger', 'Odayı tamamen sil', async () => {
        if (!(await confirmDialog('Silme isteği sevgiline gider. 48 saat içinde o da onaylarsa oda kalıcı olarak silinir. Önce tam yedek almanı öneririz.', { ok: 'İsteği gönder' }))) return;
        try {
          await odaSilIste(roomId);
          bildir(roomId, { tur: 'mesaj', baslik: 'Biz İkimiz', metin: 'Odayı silme isteği var. Ayarlar › Oda’dan bak.', url: 'sayfalar/ayarlar/#ayar-oda' });
          toast('İstek gönderildi.');
        } catch {
          toast('İstek gönderilemedi. Bağlantını kontrol et.');
        }
        odaSilCiz();
      }));
  } else if (g === 'bekliyorum') {
    odaSilKutu.replaceChildren(
      h('p', { class: 'ayar-satir-aciklama', role: 'status' }, `Silme isteğin bekliyor. Sevgilin ${kalan} saat içinde onaylarsa oda silinir.`),
      islem('Vazgeç', 'btn small', 'Silme isteğinden vazgeç', vazgec));
  } else {
    odaSilKutu.replaceChildren(
      h('p', { class: 'ayar-satir-aciklama', role: 'status' }, d.ben
        ? `Odada başka cihaz yok; silmeyi sen onaylarsın. İstek ${kalan} saat geçerli.`
        : `Sevgilin odayı tamamen silmek istiyor. İstek ${kalan} saat geçerli.`),
      h('div', { class: 'ayar-eylemler' },
        islem('Onayla ve sil', 'btn small danger', 'Onayla ve odayı kalıcı sil', odaSilOnayAkisi),
        islem('Vazgeç', 'btn small', 'Silme isteğinden vazgeç', vazgec)));
  }
}

async function vazgec() {
  try {
    await odaSilVazgec(roomId);
    toast('Silme isteği kaldırıldı.');
  } catch {
    toast('Bağlantını kontrol et.');
  }
  odaSilCiz();
}

const odaKart = kart(
  linkFormu,
  h('div', { class: 'ayar-ayrac' }),
  h('div', { class: 'ayar-tehlike' },
    h('p', { class: 'ayar-satir-aciklama' }, uyeModu()
      ? 'Bu cihaz odadan çıkar ve odanızı unutur. Verileriniz silinmez. Geri dönmek için yeni bir davet linki gerekir.'
      : 'Bu cihaz odanızı ve bu odanın önbelleğini unutur. Verileriniz silinmez; davet linkini yeniden açarak dönebilirsin.'),
    h('button', {
      type: 'button', class: 'btn small danger',
      onclick: async () => {
        const uye = uyeModu();
        const baskaOnayli = (cihazListe || []).some((c) => !c.ben && c.durum === 'onayli');
        const metin = !uye
          ? 'Bu cihazda odadan çıkılsın mı? Davet linkini yeniden açarak dönebilirsin.'
          : baskaOnayli
            ? 'Bu cihaz odadan çıkarılsın mı? Geri dönmek için yeni bir davet linki gerekir.'
            : 'Bu cihaz odadan çıkarılsın mı? Odada onaylı başka cihaz yok; geri dönmek için kurtarma kodu gerekir.';
        const ok = await confirmDialog(metin, { ok: 'Odadan çık' });
        if (!ok) return;
        // Cihaz kaydını da sil: anahtar unutulunca aynı cihazla geri dönüş çakışma vermesin.
        // Silinemezse (bağlantı yok) unutma: yoksa bu cihaz geri dönünce "tanınmadı" ekranında kalır.
        if (uye && !(await cihazCikar(roomId, myId))) {
          toast('Odadan çıkılamadı. İnternet bağlantını kontrol edip tekrar dener misin?');
          return;
        }
        await cihazdanUnut(roomId);
        location.replace(lobbyUrl());
      },
    }, svg('cikis'), 'Bu cihazda odadan çık')),
  odaSilKutu);

// ---------- Sayfa ----------
const veriBolumu = bolum('veri', 'Verilerimiz', kart(
  h('p', { class: 'ayar-satir-aciklama' }, 'Tam yedek: mesajlar, anılar, fotoğraflar ve sesler tek dosyada, senin parolanla şifreli. Ayda bir almanı öneririz. Geri yüklerken var olan kayıtlar silinmez.'),
  h('div', { class: 'ayar-eylemler' }, tamBtn, geriBtn, geriSecici),
  yedekSonSatir,
  geriKutu,
  h('div', { class: 'ayar-ayrac' }),
  h('p', { class: 'ayar-yardim' }, 'Düz yedek yalnız kayıtları alır: fotoğrafların kendisi girmez ve dosya şifresizdir.'),
  h('div', { class: 'ayar-eylemler' }, yedekBtn)), kullanimKutu, copKart);
yedekSonCiz();
const veriAcildi = () => { if (veriBolumu.open) { copYukle(); kullanimYukle(); } };
// Son silinenler ve kullanım yalnız bölüm açılınca yüklenir (her türün tüm belgeleri okunur).
veriBolumu.addEventListener('toggle', veriAcildi);

app.replaceChildren(h('div', { class: 'ayar' },
  canli,
  bolum('profil', 'Profilim', kart(profilBaslik, adAlan, dogumAlan, renkAlan)),
  bolum('biz', 'Biz', kart(ciftAdAlan, gunlerAlan, kapakAlan)),
  bolum('bildirim', 'Bildirimler', bildirimKutu),
  bolum('kilit', 'Uygulama kilidi', kilitKutu),
  bolum('gorunum', 'Görünüm', kart(temaRenkAlan, modAlan), kart(sesSatiri)),
  konumSatiri,
  veriBolumu,
  bolum('cihaz', 'Cihazlar', cihazKutu),
  bolum('oda', 'Oda', odaKart),
  bolum('hakkinda', 'Hakkında', kart(
    h('p', { class: 'ayar-hakkinda-ad' }, 'Biz İkimiz', h('span', { class: 'chip' }, `Sürüm ${SURUM}`)),
    h('p', { class: 'ayar-satir-aciklama' }, uyelikModu(roomId) === 'eski-sunucu'
      ? 'İkiniz için ücretsiz, hesapsız bir köşe. Verileriniz oda kodunuzla korunur: davet linkini bilen herkes odanıza girebilir, o yüzden linki yalnız sevgilinle paylaş.'
      : 'İkiniz için ücretsiz, hesapsız bir köşe. Odanıza yalnız onayladığınız cihazlar girer; onları Cihazlar bölümünden yönetirsin.')))));

const hepsiniYenile = () => { profilYenile(); bizYenile(); };
profil.on('change', hepsiniYenile);
konum.on('change', konumCiz);
hepsiniYenile();
veriAcildi();
odaSilCiz();
konumCiz();
temaYenile();
kilitCiz();
bildirimCiz();
cihazCiz();
cihazYukle();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  bildirimCiz();
  konumCiz();
  cihazYukle();
  odaSilCiz();
});
window.addEventListener('bizim:uyelik', (e) => { if (e.detail?.roomId === roomId) cihazYukle(); });
setInterval(() => { if (document.visibilityState === 'visible' && uyeModu()) cihazYukle(); }, 20_000);
setInterval(() => { if (document.visibilityState === 'visible') { bulusmaYenile(); konumCiz(); } }, 60_000); // canlı süresi dolunca

// #ayar-cihaz gibi bir bağlantıyla gelindiyse o bölümü aç ve oraya kaydır.
function hashBolumu() {
  let id = '';
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const d = id ? document.getElementById(id)?.closest('details.ayar-bolum') : null;
  if (!d) return;
  d.open = true;
  d.scrollIntoView({ block: 'start' });
}
hashBolumu();
window.addEventListener('hashchange', hashBolumu);
