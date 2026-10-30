// Ayarlar: profil, biz, bildirimler, kilit, görünüm, mesafe, yedek (indir / geri yükle), cihazlar, oda, hakkında.
import { bootPage } from '../../js/core/sayfa.js';
import { openProfil } from '../../js/core/profil.js';
import { openCollection, listDocs, iceAktar, onbellekTemizle } from '../../js/core/veri.js';
import { setName, inviteUrl, lobbyUrl, pageUrl, writeStore } from '../../js/core/identity.js';
import {
  h, icon, toast, confirmDialog, shareInvite, copyInvite, copyText, initial, formatDay, readTema, parseTema, davetHazirla,
} from '../../js/core/ui.js';
import {
  cihazlar, cihazOnayla, cihazReddet, cihazCikar, kurtarmaOlustur, odaGiris, uyelikModu,
} from '../../js/core/uyelik.js';
import { uploadPhoto, loadPhoto, isAllowedPhotoUrl } from '../../js/core/storage.js';
import { fotoKirp } from '../../js/core/kirp.js';
import { isMuted, setMuted, sfx } from '../../js/core/sound.js';
import { bildirimDestegi, bildirimDurumu, bildirimAc, bildirimKapat } from '../../js/core/bildirim.js';
import { kilitAyarla, kilitVarMi, pinHatasi, pinDogruMu, cihazdanUnut } from '../../js/core/kilit.js';
import { daysTogether, toDay } from '../../js/core/gunler.js';
import { isNative } from '../../js/core/mobil.js';
import { IOS_ADIMLARI, apkGoster } from '../daha/mantik.js';
import { bulusmaDogrula } from '../gunler/mantik.js';
import {
  SURUM, K_TEMA, TEMA_RENKLERI, TEMA_MODLARI, KISI_RENKLERI,
  bulusmaAyir, bulusmaMetni, konumVerisi, mesafeKm, mesafeMetni,
  KONUM_SECENEK, konumHataTuru, konumPlatformu, konumRehberi,
  bildirimGorunum, YEDEK_TURLERI, yedekVerisi, yedekSayisi, yedekDosyaAdi, yedektenBelgeler, parcala, yedekOzeti,
} from './mantik.js';

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
  konum: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  indir: '<path d="M12 4v10.5M7.5 10 12 14.5 16.5 10"/><path d="M5 19.5h14"/>',
  yukle: '<path d="M12 15.5V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19.5h14"/>',
  telefon: '<rect x="6.5" y="3" width="11" height="18" rx="2.6"/><path d="M10.5 17.6h3"/>',
  tablet: '<rect x="4.5" y="3" width="15" height="18" rx="2.4"/><path d="M10.5 17.6h3"/>',
  bilgisayar: '<rect x="4" y="5" width="16" height="11" rx="1.8"/><path d="M2.5 19h19"/>',
  anahtar: '<circle cx="8" cy="15" r="3.6"/><path d="m10.6 12.4 7.4-7.4M15.5 7.5l2.2 2.2M13.4 9.6l1.6 1.6"/>',
  kopya: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.2A1.7 1.7 0 0 0 13.8 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/>',
  cikis: '<path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8 6 12l4 4M6 12h9.5"/>',
  bilgi: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
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

function bolum(id, baslik, ...icerik) {
  return h('section', { class: 'ayar-bolum', id: `ayar-${id}`, 'aria-labelledby': `ayar-${id}-h` },
    h('h2', { class: 'ayar-baslik', id: `ayar-${id}-h` }, baslik),
    ...icerik);
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
const yerelFoto = new Map();
function fotoAdresi(url) {
  if (!url) return Promise.resolve(null);
  if (url.startsWith('local:')) {
    if (!yerelFoto.has(url)) yerelFoto.set(url, loadPhoto(url).then((b) => URL.createObjectURL(b)).catch(() => null));
    return yerelFoto.get(url);
  }
  return Promise.resolve(isAllowedPhotoUrl(url) ? url : null);
}

/** img'ye fotoğrafı koyar; yoksa gizler. -> fotoğraf var mı */
async function fotoKoy(img, url) {
  img.dataset.url = url || '';
  const src = await fotoAdresi(url);
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

const baslangicInput = h('input', { class: 'input', id: 'ayar-baslangic', type: 'date', max: toDay() });
const baslangicAlan = alan('Başlangıç tarihimiz', baslangicInput, { yardim: '' });
const baslangicYardim = baslangicAlan.querySelector('.ayar-yardim');
baslangicInput.addEventListener('change', () => yaz(profil.setCift({ baslangic: baslangicInput.value || undefined }), baslangicAlan));
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

// Sonraki buluşma (tarih + saat + not birlikte kaydedilir).
const bTarih = h('input', { class: 'input', id: 'ayar-bulusma-tarih', type: 'date', min: toDay() });
const bSaat = h('input', { class: 'input', id: 'ayar-bulusma-saat', type: 'time' });
const bNot = h('input', { class: 'input', id: 'ayar-bulusma-not', type: 'text', maxlength: 80, placeholder: 'Örn. Sahilde kahvaltı', enterkeyhint: 'done' });
const bDurum = h('p', { class: 'ayar-bulusma-durum', id: 'ayar-bulusma-durum' });
const bHata = h('p', { class: 'ayar-hata', hidden: true }, 'Önce bir tarih seç.');
const bSil = h('button', {
  type: 'button', class: 'btn small ghost',
  onclick: async () => {
    if (await yaz(profil.setCift({ bulusma: undefined, bulusmaNotu: undefined }), bulusmaAlan)) {
      bTarih.value = ''; bSaat.value = ''; bNot.value = '';
      bulusmaYenile();
    }
  },
}, 'Temizle');
const bulusmaAlan = h('form', {
  class: 'ayar-alan ayar-bulusma', novalidate: true, 'aria-labelledby': 'ayar-bulusma-e',
  onsubmit: async (e) => {
    e.preventDefault();
    // Günler sayfasıyla aynı kural: geçmiş zaman kabul edilmez.
    const { hata, iso } = bulusmaDogrula(bTarih.value, bSaat.value);
    if (hata) {
      bHata.textContent = hata;
      bHata.hidden = false;
      bTarih.setAttribute('aria-invalid', 'true');
      bTarih.focus();
      return;
    }
    bHata.hidden = true;
    bTarih.removeAttribute('aria-invalid');
    if (!bSaat.value) bSaat.value = '20:00';
    if (await yaz(profil.setCift({ bulusma: iso, bulusmaNotu: bNot.value.trim() || undefined }), bulusmaAlan)) {
      sfx('pop');
      bulusmaYenile();
    }
  },
},
h('div', { class: 'ayar-alan-ust' },
  h('span', { class: 'ayar-etiket ayar-etiket-buyuk', id: 'ayar-bulusma-e' }, 'Sonraki buluşmamız'),
  h('span', { class: 'ayar-ok', 'aria-hidden': 'true' })),
bDurum,
h('div', { class: 'ayar-iki' },
  h('div', { class: 'ayar-mini' }, h('label', { class: 'ayar-mini-etiket', for: 'ayar-bulusma-tarih' }, 'Tarih'), bTarih),
  h('div', { class: 'ayar-mini' }, h('label', { class: 'ayar-mini-etiket', for: 'ayar-bulusma-saat' }, 'Saat'), bSaat)),
bHata,
h('div', { class: 'ayar-mini' }, h('label', { class: 'ayar-mini-etiket', for: 'ayar-bulusma-not' }, 'Not (isteğe bağlı)'), bNot),
h('div', { class: 'ayar-eylemler' }, h('button', { type: 'submit', class: 'btn primary small' }, 'Buluşmayı kaydet'), bSil));
bTarih.addEventListener('input', () => { bHata.hidden = true; bTarih.removeAttribute('aria-invalid'); });

function bulusmaYenile() {
  const c = profil.cift();
  const { tarih, saat } = bulusmaAyir(c.bulusma);
  const formOdakta = bulusmaAlan.contains(document.activeElement);
  if (!formOdakta) {
    degerKoy(bTarih, tarih);
    degerKoy(bSaat, saat);
    degerKoy(bNot, c.bulusmaNotu || '');
  }
  bSil.hidden = !c.bulusma;
  if (c.bulusma) {
    const d = new Date(c.bulusma);
    const ne = `${formatDay(d)} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    bDurum.replaceChildren(h('strong', {}, bulusmaMetni(c.bulusma)), h('span', {}, ` · ${ne}`));
  } else {
    bDurum.textContent = 'Henüz plan yok. Bir tarih seçin, geri sayım ana sayfada başlasın.';
  }
}

function bizYenile() {
  const c = profil.cift();
  const benAd = profil.ben().ad || me.name || 'Sen';
  const pAd = profil.partner()?.ad || 'Sevgilin';
  ciftAdInput.placeholder = `${benAd} & ${pAd}`;
  degerKoy(ciftAdInput, c.ad || '');
  degerKoy(baslangicInput, c.baslangic || '');
  baslangicYardim.textContent = baslangicMetni(c.baslangic);
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
    bildirimKutu.replaceChildren(anahtarSatiri('Anlık bildirimler',
      'Sevgilin yazınca, dokununca ya da anı ekleyince bu cihaza haber veririz.', sw));
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

// ---------- Mesafe ----------
const mesafeKutu = kart();
let rizaAcik = false;
let konumMesgul = false;

const saatMetni = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDay(d)} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
};

// Konum alınamayınca kartta yol gösteren kutu (izin, servis kapalı, zaman aşımı, http adres).
const guvenliMi = () => globalThis.isSecureContext !== false;
const rehber = (tur) => konumRehberi(tur, {
  platform: konumPlatformu({ native: isNative(), ua: navigator.userAgent, dokunmatik: navigator.maxTouchPoints || 0 }),
  guvenli: guvenliMi(),
});
let konumSorun = guvenliMi() ? null : rehber('izin'); // http:// adreste not hep görünür

let izinDurumu; // PermissionStatus | null (undefined: henüz sorulmadı)
async function konumIzni() {
  if (izinDurumu === undefined) {
    try {
      izinDurumu = (await navigator.permissions?.query({ name: 'geolocation' })) || null;
    } catch {
      izinDurumu = null;
    }
    // Kullanıcı ayarlardan izni açıp dönünce yol gösteren kutu kendiliğinden kalkar.
    izinDurumu?.addEventListener?.('change', izinDegisti);
  }
  return izinDurumu?.state || null;
}
function izinDegisti() {
  const st = izinDurumu?.state;
  if (st && st !== 'denied' && konumSorun?.tur === 'izin') {
    konumSorun = null;
    mesafeCiz();
  }
}

function sorunGoster(r) {
  konumSorun = { ...r, denendi: true }; // denendi: düğme "Tekrar dene" olur
  mesafeCiz();
  duyur(`${r.baslik}. ${r.metin}`);
  document.getElementById('ayar-konum-sorun-h')?.focus();
}
function sorunuTemizle() {
  if (konumSorun && konumSorun.tur !== 'guvensiz') konumSorun = null;
}

async function konumAl() {
  if (!guvenliMi()) {
    sorunGoster(rehber('izin'));
    return;
  }
  if (!navigator.geolocation) {
    toast('Bu cihaz konum vermiyor.');
    return;
  }
  konumMesgul = true;
  mesafeCiz();
  let sorun = null;
  try {
    if ((await konumIzni()) === 'denied') {
      sorun = rehber('izin');
    } else {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, KONUM_SECENEK));
      const v = konumVerisi(pos.coords, new Date());
      if (!v) throw new Error('Konum okunamadı.');
      await konum.put(v, myId);
      rizaAcik = false;
      konumSorun = null;
      toast('Konumun güncellendi');
    }
  } catch (e) {
    const tur = konumHataTuru(e);
    if (tur === 'diger') toast(e?.message || 'Konum alınamadı. Biraz sonra tekrar dener misin?');
    else sorun = rehber(tur);
  } finally {
    konumMesgul = false;
    mesafeCiz();
  }
  if (sorun) sorunGoster(sorun);
}

function sorunKutusu() {
  const r = konumSorun;
  if (!r) return null;
  return h('div', { class: 'ayar-konum-sorun', dataset: { tur: r.tur } },
    svg(r.tur === 'guvensiz' ? 'kilit' : 'konum', 'ayar-konum-sorun-ikon'),
    h('div', { class: 'ayar-konum-sorun-metin' },
      h('h3', { class: 'ayar-konum-sorun-baslik', id: 'ayar-konum-sorun-h', tabindex: '-1' }, r.baslik),
      h('p', {}, r.metin),
      r.adimlar.length ? h('ol', { class: 'ayar-adimlar' }, r.adimlar.map((a) => h('li', {}, a))) : null,
      r.not ? h('p', { class: 'ayar-yardim' }, r.not) : null));
}

function mesafeCiz() {
  const benim = konum.get(myId)?.data || null;
  const pId = profil.partner()?.clientId;
  const onunDoc = (pId && konum.get(pId)) || konum.all().find((d) => d.id !== myId) || null;
  const onun = onunDoc?.data || null;
  const pAd = profil.partner()?.ad || 'Sevgilin';
  mesafeKutu.dataset.durum = benim ? 'acik' : rizaAcik ? 'riza' : 'kapali';

  const almaEtiketi = (bos) => (konumMesgul ? 'Konum alınıyor…' : konumSorun?.denendi && konumSorun.tur !== 'guvensiz' ? 'Tekrar dene' : bos);

  if (benim) {
    const km = onun ? mesafeKm(benim, onun) : null;
    mesafeKutu.replaceChildren(...[
      h('div', { class: 'ayar-mesafe' },
        svg('konum', 'ayar-mesafe-ikon'),
        h('div', { class: 'ayar-satir-metin' },
          h('p', { class: 'ayar-mesafe-buyuk' }, km != null ? mesafeMetni(km) : `${pAd} henüz konum paylaşmadı`),
          h('p', { class: 'ayar-satir-aciklama' },
            `Senin konumun: ${saatMetni(benim.at)}`, onun ? ` · ${pAd}: ${saatMetni(onun.at)}` : ''))),
      h('p', { class: 'ayar-yardim' }, 'Yalnız yaklaşık konum (≈1 km) paylaşılır. Sürekli takip yok; konum yalnız “Güncelle”ye dokununca alınır.'),
      sorunKutusu(),
      h('div', { class: 'ayar-eylemler' },
        h('button', { type: 'button', class: 'btn small', disabled: konumMesgul, 'aria-busy': konumMesgul ? 'true' : null, onclick: konumAl },
          almaEtiketi('Güncelle')),
        h('button', {
          type: 'button', class: 'btn small danger',
          onclick: async () => {
            if (await yaz(konum.remove(myId))) toast('Konumun silindi. Mesafe kapalı.');
            sorunuTemizle();
            mesafeCiz();
          },
        }, 'Kapat ve sil')),
    ].filter(Boolean));
    return;
  }

  if (rizaAcik) {
    mesafeKutu.replaceChildren(...[
      h('h3', { class: 'ayar-riza-baslik', id: 'ayar-riza-h', tabindex: '-1' }, 'Konumunu paylaşmadan önce'),
      h('ul', { class: 'ayar-riza' },
        h('li', {}, 'Konumun yaklaşık olarak (≈1 km) yalnız sevgilinle paylaşılır.'),
        h('li', {}, 'Sürekli takip yok: konum yalnız sen “Güncelle”ye dokununca alınır.'),
        h('li', {}, 'İstediğin an “Kapat ve sil” ile tamamen silinir.')),
      sorunKutusu(),
      h('div', { class: 'ayar-eylemler' },
        h('button', { type: 'button', class: 'btn small primary', disabled: konumMesgul, 'aria-busy': konumMesgul ? 'true' : null, onclick: konumAl },
          almaEtiketi('Kabul ediyorum, paylaş')),
        h('button', {
          type: 'button', class: 'btn small ghost',
          onclick: () => { rizaAcik = false; sorunuTemizle(); mesafeCiz(); document.getElementById('ayar-mesafe-sw')?.focus(); },
        }, 'Vazgeç')),
    ].filter(Boolean));
    return;
  }

  const sw = anahtar('ayar-mesafe-sw', false, async () => {
    // İzin önceden reddedildiyse yol gösteren kutu rıza ekranıyla birlikte gelir.
    if (guvenliMi() && (await konumIzni()) === 'denied') konumSorun = rehber('izin');
    rizaAcik = true;
    mesafeCiz();
    document.getElementById('ayar-riza-h')?.focus();
    if (konumSorun) duyur(`${konumSorun.baslik}. ${konumSorun.metin}`);
  });
  mesafeKutu.replaceChildren(...[
    anahtarSatiri('Aramızdaki mesafe',
      onun ? `${pAd} konumunu paylaşıyor. Sen de açarsan aranızdaki mesafeyi görürsünüz.`
        : 'Kapalı. Açarsan yaklaşık konumun yalnız sevgilinle paylaşılır.', sw),
    sorunKutusu(),
  ].filter(Boolean));
}

// ---------- Verilerimiz ----------
const yedekBtn = h('button', { type: 'button', class: 'btn small', onclick: yedekIndir }, svg('indir'), h('span', {}, 'Yedeği indir'));
async function yedekIndir() {
  const etiket = yedekBtn.querySelector('span:last-child');
  yedekBtn.disabled = true;
  yedekBtn.setAttribute('aria-busy', 'true');
  etiket.textContent = 'Hazırlanıyor…';
  try {
    const sonuclar = {};
    const hatalar = {};
    const sonuc = await Promise.allSettled(YEDEK_TURLERI.map((t) => listDocs(roomId, t)));
    sonuc.forEach((r, i) => {
      if (r.status === 'fulfilled') sonuclar[YEDEK_TURLERI[i]] = r.value;
      else hatalar[YEDEK_TURLERI[i]] = r.reason?.message || 'hata';
    });
    if (!Object.keys(sonuclar).length) {
      toast('Yedek alınamadı. Bağlantını kontrol edip tekrar dener misin?');
      return;
    }
    const simdi = new Date();
    const yedek = yedekVerisi({ sonuclar, hatalar, simdi });
    const url = URL.createObjectURL(new Blob([JSON.stringify(yedek, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: yedekDosyaAdi(simdi), hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    const n = yedekSayisi(yedek).toLocaleString('tr-TR');
    toast(yedek.eksik ? `Yedek indirildi (${n} kayıt). Bazı bölümler alınamadı.` : `Yedek indirildi: ${n} kayıt.`);
  } finally {
    yedekBtn.disabled = false;
    yedekBtn.removeAttribute('aria-busy');
    etiket.textContent = 'Yedeği indir';
  }
}

// Yedekten geri yükleme: dosya → doğrula → özet + onay → 200'lük parçalarla doc_ice_aktar → ilerleme → toast.
const PARCA = 200;
const sayi = (n) => n.toLocaleString('tr-TR');
const geriSecici = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
const geriBtn = h('button', { type: 'button', class: 'btn small', onclick: () => geriSecici.click() }, svg('yukle'), h('span', {}, 'Yedekten geri yükle'));
const geriIlerleme = h('progress', { class: 'ayar-ilerleme', max: '1', value: '0', 'aria-labelledby': 'ayar-geri-durum' });
const geriDurum = h('p', { class: 'ayar-yardim', id: 'ayar-geri-durum', role: 'status' });
const geriKutu = h('div', { class: 'ayar-geri', hidden: true }, geriDurum, geriIlerleme);
geriSecici.addEventListener('change', () => {
  const f = geriSecici.files?.[0];
  geriSecici.value = '';
  if (f) geriYukle(f);
});

async function geriYukle(dosya) {
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

  const toplam = belgeler.length;
  let giden = 0;
  let yazilan = 0;
  for (const b of [geriBtn, yedekBtn]) { b.disabled = true; }
  geriBtn.setAttribute('aria-busy', 'true');
  geriIlerleme.max = toplam;
  geriKutu.hidden = false;
  const ilerle = () => {
    geriIlerleme.value = giden;
    geriDurum.textContent = `Geri yükleniyor… ${sayi(giden)} / ${sayi(toplam)}`;
  };
  try {
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
    sfx('pop');
    toast(yazilan
      ? `Geri yükleme bitti: ${sayi(yazilan)} kayıt eklendi ya da güncellendi.`
      : 'Geri yükleme bitti. Yedekteki her şey zaten burada.');
  } catch (e) {
    const kalan = giden ? ` ${sayi(giden)} kayıt yüklendi; kalanı için yeniden deneyebilirsin.` : '';
    toast(`${e?.message || 'Geri yüklenemedi.'}${kalan}`, { ms: 8000 });
  } finally {
    for (const b of [geriBtn, yedekBtn]) { b.disabled = false; }
    geriBtn.removeAttribute('aria-busy');
    geriKutu.hidden = true;
  }
}

// ---------- Cihazlar (TALIMAT §5.4) ----------
// Mod: 'sunucu' | 'yerel-siki' → tam yönetim; 'eski-sunucu' → bilgi + kodsuz link; 'yerel-gevsek' → bilgi + bu cihaz.
const uyeModu = () => ['sunucu', 'yerel-siki'].includes(uyelikModu(roomId));
const cihazKutu = kart();
let cihazListe = null; // son başarılı liste
let cihazHata = false;
let cihazSira = 0;
let davetUrl = null; // bu sayfada oluşturulan davet linki
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

async function davetOlusturVeGoster() {
  const kod = await davetHazirla(roomId, { yeni: true });
  if (!kod) toast('Davet kodu alınamadı. Kodsuz linkle gelen cihaz onay bekler.');
  davetUrl = inviteUrl(roomId, kod);
  cihazCiz();
  document.getElementById('ayar-davet')?.focus();
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
  cihazKutu.replaceChildren(...[
    mod === 'yerel-gevsek'
      ? bilgi('Yerel test modu: her cihaz onaylı sayılır.')
      : h('p', { class: 'ayar-satir-aciklama' }, bekleyen
        ? 'Yeni bir cihaz odanıza katılmak istiyor. Tanıyorsan onayla.'
        : 'Odanıza yalnız onayladığınız cihazlar girer.'),
    liste,
    ayrac(),
    davetAlani(),
    mod === 'yerel-gevsek' ? null : ayrac(),
    mod === 'yerel-gevsek' ? null : kurtarmaAlani(),
  ].filter(Boolean));
}

// ---------- Oda ----------
const odaKart = kart(
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
    }, svg('cikis'), 'Bu cihazda odadan çık')));

// ---------- Sayfa ----------
app.replaceChildren(h('div', { class: 'ayar' },
  canli,
  bolum('profil', 'Profilim', kart(profilBaslik, adAlan, dogumAlan, renkAlan)),
  bolum('biz', 'Biz', kart(ciftAdAlan, baslangicAlan, kapakAlan), kart(bulusmaAlan)),
  bolum('bildirim', 'Bildirimler', bildirimKutu),
  bolum('kilit', 'Uygulama kilidi', kilitKutu),
  bolum('gorunum', 'Görünüm', kart(temaRenkAlan, modAlan), kart(sesSatiri)),
  bolum('mesafe', 'Mesafe', mesafeKutu),
  bolum('veri', 'Verilerimiz', kart(
    h('p', { class: 'ayar-satir-aciklama' }, 'Profiller, mesajlar, anılar, mektuplar, listeler ve özel günler tek bir dosyada. Fotoğrafların kendisi değil, adresleri girer. Geri yüklerken var olan kayıtlar silinmez.'),
    h('div', { class: 'ayar-eylemler' }, yedekBtn, geriBtn, geriSecici),
    geriKutu)),
  bolum('cihaz', 'Cihazlar', cihazKutu),
  bolum('oda', 'Oda', odaKart),
  bolum('hakkinda', 'Hakkında', kart(
    h('p', { class: 'ayar-hakkinda-ad' }, 'Biz İkimiz', h('span', { class: 'chip' }, `Sürüm ${SURUM}`)),
    h('p', { class: 'ayar-satir-aciklama' }, uyelikModu(roomId) === 'eski-sunucu'
      ? 'İkiniz için ücretsiz, hesapsız bir köşe. Verileriniz oda kodunuzla korunur: davet linkini bilen herkes odanıza girebilir, o yüzden linki yalnız sevgilinle paylaş.'
      : 'İkiniz için ücretsiz, hesapsız bir köşe. Odanıza yalnız onayladığınız cihazlar girer; onları Cihazlar bölümünden yönetirsin.')))));

const hepsiniYenile = () => { profilYenile(); bizYenile(); mesafeCiz(); };
profil.on('change', hepsiniYenile);
konum.on('change', mesafeCiz);
hepsiniYenile();
temaYenile();
kilitCiz();
bildirimCiz();
cihazCiz();
cihazYukle();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  bildirimCiz();
  izinDegisti(); // izin değişim olayı gelmeyen tarayıcılar için
  cihazYukle();
});
window.addEventListener('bizim:uyelik', (e) => { if (e.detail?.roomId === roomId) cihazYukle(); });
setInterval(() => { if (document.visibilityState === 'visible' && uyeModu()) cihazYukle(); }, 20_000);
setInterval(() => { if (document.visibilityState === 'visible') bulusmaYenile(); }, 60_000);

// #ayar-kilit gibi bir bağlantıyla gelindiyse o bölüme kaydır.
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
