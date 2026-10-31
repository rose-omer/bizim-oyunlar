// Ortak harcamalar: kim ödedi, nasıl bölündü, kim kime borçlu. Para hesabı kuruşla (mantik.js, testli).
// Sayfa içi sekmeler: Harcamalar | Kumbara (kumbara.js; adres ?sekme=kumbara).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { toDay } from '../../js/core/gunler.js';
import { h, toast, confirmDialog, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ikon } from './ikonlar.js';
import { kumbaraKur } from './kumbara.js';
import {
  KATEGORILER, BASLIK_MAX, kategoriById, paraMetni, kayitOku, yeniHarcama, bakiye, bakiyeDurumu, bakiyeMetni,
  hesaplasmaKaydi, aylar, ayFiltresi, kategoriOzeti, payTuru, payAciklama, ozelPay, tutarCoz, yonelme, hesaplasmaId,
} from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'harcama', title: 'Harcamalar', tab: 'daha' });
const myId = me.clientId;
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'hc' }, h('p', { class: 'hc-yukleniyor muted', role: 'status' }, 'Hesaplar açılıyor…')));

const [col, profil] = await Promise.all([
  openCollection(room, 'harcama'),
  openProfil(room).catch((e) => { console.warn('[harcama] profil açılamadı', e); return null; }),
]);

const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || 'Sen';
const partnerId = () => profil?.partner()?.clientId || room.partner?.()?.clientId || knownPartner(roomId)?.clientId || null;
const adOf = (id) => {
  if (id === myId) return benAdi();
  return profil?.kisiler?.get(id)?.data?.ad || partnerAdi();
};
const kisaTarih = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const ayAdi = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });
const yerelTarih = (gun) => {
  const [y, m, d] = gun.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
const buyukHarf = (s) => (s ? s[0].toLocaleUpperCase('tr') + s.slice(1) : s);
const ayMetni = (ay) => buyukHarf(ayAdi.format(yerelTarih(ay)));

// ---------- Durum ----------
const durum = {
  ay: toDay().slice(0, 7), // seçili ay; null = tüm zamanlar
  formAcik: false,
  duzen: null,            // düzenlenen kaydın id'si
  odeyen: myId,
  payTur: 'esit',
  yuzde: 50,
  kategori: 'market',
  menu: null,             // eylemleri açık kayıt
};

// ---------- İskelet: bakiye ----------
const bakiyeMetinEl = h('p', { class: 'hc-bakiye-metin', id: 'hc-bakiye-metin' });
const bakiyeAltEl = h('p', { class: 'hc-bakiye-alt' });
const hesaplasBtn = h('button', { type: 'button', class: 'btn hc-hesaplas', onclick: hesaplas }, 'Hesaplaştık');
const bakiyeEl = h('section', { class: 'hc-bakiye', 'aria-labelledby': 'hc-bakiye-metin', 'aria-live': 'polite' },
  bakiyeMetinEl, bakiyeAltEl, hesaplasBtn);

// ---------- İskelet: form ----------
const ekleBtn = h('button', { type: 'button', class: 'btn primary wide hc-ekle', 'aria-expanded': 'false', 'aria-controls': 'hc-form', onclick: () => formAc() },
  ikon('plus'), 'Harcama ekle');
const partnerYokEl = h('p', { class: 'hc-bilgi', hidden: true },
  'Sevgilin uygulamayı bir kez açınca birlikte harcama ekleyebilirsiniz.');

const baslikGirdi = h('input', { id: 'hc-baslik', class: 'input', type: 'text', maxlength: BASLIK_MAX, autocomplete: 'off', placeholder: 'ör. Haftalık market', enterkeyhint: 'next' });
const tutarGirdi = h('input', { id: 'hc-tutar', class: 'input hc-tutar-girdi', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00', enterkeyhint: 'done' });
const tarihGirdi = h('input', { id: 'hc-tarih', class: 'input', type: 'date' });
const odeyenSeg = h('div', { class: 'seg hc-seg', role: 'group', 'aria-labelledby': 'hc-odeyen-etiket' });
const paySeg = h('div', { class: 'seg hc-seg hc-pay-seg', role: 'group', 'aria-labelledby': 'hc-pay-etiket' });
const yuzdeGirdi = h('input', { id: 'hc-yuzde', type: 'range', min: '0', max: '100', step: '5', class: 'hc-aralik' });
const yuzdeCikti = h('output', { class: 'hc-yuzde-cikti', for: 'hc-yuzde' });
const ozelEl = h('div', { class: 'hc-ozel', hidden: true },
  h('label', { for: 'hc-yuzde', class: 'hc-ozel-etiket' }, 'Senin payın'), yuzdeGirdi, yuzdeCikti);
const kategoriEl = h('div', { class: 'hc-kategoriler', role: 'radiogroup', 'aria-labelledby': 'hc-kategori-etiket' });
const hataEl = h('p', { class: 'hc-hata', role: 'alert', hidden: true });
const kaydetBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Kaydet');
const formBaslik = h('h2', { class: 'hc-form-baslik', id: 'hc-form-baslik' }, 'Yeni harcama');
const formEl = h('form', { id: 'hc-form', class: 'hc-form', hidden: true, novalidate: true, 'aria-labelledby': 'hc-form-baslik', onsubmit: kaydet },
  formBaslik,
  h('div', { class: 'hc-alan' }, h('label', { for: 'hc-baslik' }, 'Ne için?'), baslikGirdi),
  h('div', { class: 'hc-iki' },
    h('div', { class: 'hc-alan' }, h('label', { for: 'hc-tutar' }, 'Tutar'),
      h('div', { class: 'hc-tutar' }, tutarGirdi, h('span', { class: 'hc-tl', 'aria-hidden': 'true' }, '₺'))),
    h('div', { class: 'hc-alan' }, h('label', { for: 'hc-tarih' }, 'Tarih'), tarihGirdi)),
  h('div', { class: 'hc-alan' }, h('span', { class: 'hc-etiket', id: 'hc-odeyen-etiket' }, 'Kim ödedi?'), odeyenSeg),
  h('div', { class: 'hc-alan' }, h('span', { class: 'hc-etiket', id: 'hc-pay-etiket' }, 'Nasıl bölünsün?'), paySeg, ozelEl),
  h('div', { class: 'hc-alan' }, h('span', { class: 'hc-etiket', id: 'hc-kategori-etiket' }, 'Kategori'), kategoriEl),
  hataEl,
  h('div', { class: 'hc-dugmeler' },
    h('button', { type: 'button', class: 'btn ghost', onclick: formKapat }, 'Vazgeç'), kaydetBtn));

// ---------- İskelet: ay ----------
const aySecim = h('select', { id: 'hc-ay', class: 'input hc-ay-secim' });
aySecim.addEventListener('change', () => {
  durum.ay = aySecim.value || null;
  durum.menu = null;
  ciz();
});
const ozetEl = h('div', { class: 'hc-ozet' });
const listeEl = h('ul', { class: 'hc-liste' });
const bosEl = h('div', { class: 'hc-bos', hidden: true });

const harcamaPanel = h('div', { class: 'hc-panel' },
  bakiyeEl,
  h('div', { class: 'hc-ekle-yuva' }, ekleBtn, partnerYokEl, formEl),
  h('section', { class: 'hc-ay', 'aria-labelledby': 'hc-ay-baslik' },
    h('div', { class: 'hc-ay-bas' },
      h('h2', { id: 'hc-ay-baslik' }, 'Hesap dökümü'),
      h('label', { class: 'sr-only', for: 'hc-ay' }, 'Ay seç'), aySecim),
    ozetEl, listeEl, bosEl));

// ---------- Sekmeler: Harcamalar | Kumbara ----------
const kumbara = kumbaraKur({ room, roomId, myId, benAdi, partnerAdi });
const kumbaraPanel = h('div', { class: 'hc-panel' }, kumbara.el);
let sekme = new URLSearchParams(location.search).get('sekme') === 'kumbara' ? 'kumbara' : 'harcama';
const sekmeDugme = (k, ad) => h('button', { type: 'button', dataset: { k }, onclick: () => sekmeSec(k) }, ad);
const sekmeler = h('div', { class: 'seg hc-sekmeler', role: 'group', 'aria-label': 'Bölüm' },
  sekmeDugme('harcama', 'Harcamalar'), sekmeDugme('kumbara', 'Kumbara'));

function sekmeGoster() {
  for (const b of sekmeler.children) b.setAttribute('aria-pressed', String(b.dataset.k === sekme));
  harcamaPanel.hidden = sekme !== 'harcama';
  kumbaraPanel.hidden = sekme !== 'kumbara';
  if (sekme === 'kumbara') kumbara.goster();
  else kumbara.gizle();
}

function sekmeSec(k) {
  if (sekme === k) return;
  sekme = k;
  const u = new URL(location.href);
  if (k === 'kumbara') u.searchParams.set('sekme', k); else u.searchParams.delete('sekme');
  history.replaceState(history.state, '', u.pathname + u.search);
  sekmeGoster();
}

app.replaceChildren(h('div', { class: 'hc' }, sekmeler, harcamaPanel, kumbaraPanel));

// ---------- Form ----------
function segDugme(grup, etiket, secili, sec) {
  return h('button', {
    type: 'button', 'aria-pressed': String(secili),
    onclick: () => { sec(); formCiz(); grup.querySelector('[aria-pressed="true"]')?.focus(); },
  }, etiket);
}

function formCiz() {
  const pId = partnerId();
  const pAd = partnerAdi();
  odeyenSeg.replaceChildren(
    segDugme(odeyenSeg, `Ben (${benAdi()})`, durum.odeyen === myId, () => { durum.odeyen = myId; }),
    segDugme(odeyenSeg, pAd, durum.odeyen === pId, () => { durum.odeyen = pId; }));
  paySeg.replaceChildren(
    segDugme(paySeg, 'Yarı yarıya', durum.payTur === 'esit', () => { durum.payTur = 'esit'; }),
    segDugme(paySeg, 'Hepsi benim', durum.payTur === 'benim', () => { durum.payTur = 'benim'; }),
    segDugme(paySeg, `Hepsi ${pAd}`, durum.payTur === 'onun', () => { durum.payTur = 'onun'; }),
    segDugme(paySeg, 'Özel', durum.payTur === 'ozel', () => { durum.payTur = 'ozel'; }));
  ozelEl.hidden = durum.payTur !== 'ozel';
  yuzdeGirdi.value = String(durum.yuzde);
  yuzdeCikti.textContent = `Sen %${durum.yuzde} · ${pAd} %${100 - durum.yuzde}`;
  kategoriEl.replaceChildren(...KATEGORILER.map((k) => h('button', {
    type: 'button', role: 'radio', class: 'hc-kategori', 'aria-checked': String(durum.kategori === k.id),
    tabindex: durum.kategori === k.id ? '0' : '-1', dataset: { k: k.id },
    onclick: () => { durum.kategori = k.id; formCiz(); kategoriEl.querySelector('[aria-checked="true"]')?.focus(); },
  }, ikon(k.id), k.ad)));
}

kategoriEl.addEventListener('keydown', (e) => {
  const ids = KATEGORILER.map((k) => k.id);
  let i = ids.indexOf(durum.kategori);
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (i + 1) % ids.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = (i - 1 + ids.length) % ids.length;
  else return;
  e.preventDefault();
  durum.kategori = ids[i];
  formCiz();
  kategoriEl.querySelector('[aria-checked="true"]')?.focus();
});
yuzdeGirdi.addEventListener('input', () => {
  durum.yuzde = Number(yuzdeGirdi.value);
  yuzdeCikti.textContent = `Sen %${durum.yuzde} · ${partnerAdi()} %${100 - durum.yuzde}`;
});

function payOlustur() {
  const pId = partnerId();
  if (durum.payTur === 'esit') return { [myId]: 1, [pId]: 1 };
  if (durum.payTur === 'benim') return { [myId]: 1 };
  if (durum.payTur === 'onun') return { [pId]: 1 };
  return ozelPay(durum.yuzde, myId, pId);
}

function hataGoster(metin, alan = null) {
  hataEl.hidden = !metin;
  hataEl.textContent = metin || '';
  for (const g of [baslikGirdi, tutarGirdi, tarihGirdi]) g.removeAttribute('aria-invalid');
  if (alan) {
    alan.setAttribute('aria-invalid', 'true');
    alan.focus();
  }
}

function formAc(kayit = null) {
  const pId = partnerId();
  if (!pId) return;
  durum.formAcik = true;
  durum.duzen = kayit?.id || null;
  durum.menu = null;
  const k = kayit ? kayitOku(kayit) : null;
  baslikGirdi.value = k?.baslik || '';
  tutarGirdi.value = k ? paraMetni(k.tutar).replace(/\s*₺$/, '') : '';
  tarihGirdi.value = k?.tarih || toDay();
  durum.odeyen = !k || k.odeyen === myId ? myId : pId; // benden farklı her kimlik partnerdir
  const pt = k ? payTuru(k.pay, myId, pId) : { tur: 'esit', yuzde: 50 };
  durum.payTur = pt.tur;
  durum.yuzde = pt.yuzde;
  durum.kategori = k?.kategori || 'market';
  formBaslik.textContent = k ? 'Harcamayı düzenle' : 'Yeni harcama';
  kaydetBtn.textContent = k ? 'Kaydet' : 'Ekle';
  hataGoster(null);
  formCiz();
  formEl.hidden = false;
  ekleBtn.hidden = true;
  ekleBtn.setAttribute('aria-expanded', 'true');
  ciz();
  baslikGirdi.focus();
  formEl.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function formKapat() {
  durum.formAcik = false;
  durum.duzen = null;
  formEl.hidden = true;
  ekleBtn.hidden = false;
  ekleBtn.setAttribute('aria-expanded', 'false');
  hataGoster(null);
  ekleBtn.focus({ preventScroll: true });
}

async function kaydet(e) {
  e.preventDefault();
  const r = yeniHarcama({
    baslik: baslikGirdi.value, tutarMetni: tutarGirdi.value, odeyen: durum.odeyen, pay: payOlustur(),
    tarih: tarihGirdi.value, kategori: durum.kategori,
  });
  if (r.hata) {
    const alan = /başlık|Ne için/i.test(r.hata) ? baslikGirdi : /Tutar/.test(r.hata) ? tutarGirdi : /Tarih/.test(r.hata) ? tarihGirdi : null;
    hataGoster(r.hata, alan);
    return;
  }
  const duzen = durum.duzen;
  kaydetBtn.disabled = true;
  try {
    await col.put(r.data, duzen || undefined);
  } catch (err) {
    hataGoster(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
    return;
  } finally {
    kaydetBtn.disabled = false;
  }
  sfx('pop');
  durum.ay = r.data.tarih.slice(0, 7); // eklenen kaydın ayına geç
  formKapat();
  ciz();
  if (duzen) { toast('Harcama güncellendi'); return; }
  haberVer({ baslik: 'Yeni ortak harcama', metin: `${benAdi()} ekledi: ${r.data.baslik}, ${paraMetni(r.data.tutar)}` });
}

function haberVer(icerik) {
  if (partnerGoruyor(room.partner?.(), 'harcama')) return;
  bildir(roomId, { tur: 'liste', ...icerik, url: 'sayfalar/harcama/' })
    .catch((err) => console.warn('[harcama] bildirim gönderilemedi', err));
}

// ---------- Hesaplaşma ----------
async function hesaplas() {
  const d = bakiyeDurumu(bakiye(col.all()), myId, partnerId());
  const kayit = hesaplasmaKaydi(d, { tarih: toDay() });
  if (!kayit) return;
  const ok = await confirmDialog(
    `${adOf(d.borclu)}, ${yonelme(adOf(d.alacakli))} ${paraMetni(d.tutar)} ödedi olarak kaydedilsin mi? Bakiye sıfırlanır.`,
    { ok: 'Hesaplaştık', cancel: 'Vazgeç' });
  if (!ok) return;
  const simdi = bakiyeDurumu(bakiye(col.all()), myId, partnerId());
  if (simdi.tutar !== d.tutar || simdi.borclu !== d.borclu) {
    toast(simdi.tutar ? 'Bakiye az önce değişti. Yeni tutara bakıp yeniden dene.' : 'Zaten hesaplaşmışsınız.');
    return;
  }
  try {
    await col.put(kayit, hesaplasmaId(col.all(), simdi));
  } catch (err) {
    toast(err?.message || 'Kaydedilemedi.');
    return;
  }
  sfx('match');
  toast('Hesaplaştınız. Bakiye sıfırlandı.');
  haberVer({ baslik: 'Hesaplaştınız', metin: `${benAdi()} hesaplaşmayı kaydetti: ${paraMetni(kayit.tutar)}. Bakiye sıfır.` });
}

// ---------- Liste ----------
async function sil(doc) {
  durum.menu = null;
  const yedek = { ...doc.data };
  try {
    await col.remove(doc.id);
  } catch (err) {
    toast(err?.message || 'Silinemedi.');
    return;
  }
  sfx('tap');
  toast('Silindi.', { action: { label: 'Geri al', onClick: () => col.put(yedek, doc.id).catch((e) => toast(e.message)) } });
}

function kayitEl(doc) {
  const k = kayitOku(doc);
  const pId = partnerId();
  const acik = durum.menu === doc.id;
  const tarih = kisaTarih.format(yerelTarih(k.tarih));
  const kat = kategoriById(k.kategori).ad;
  const meta = k.hesaplasma
    ? `${tarih} · ${adOf(k.odeyen)}, ${yonelme(adOf(Object.keys(k.pay)[0]))} ödedi`
    : `${kat} · ${tarih} · ${adOf(k.odeyen)} ödedi · ${payAciklama(k.pay, myId, pId, adOf)}`;
  const li = h('li', { class: 'hc-kayit', dataset: { hesaplasma: String(k.hesaplasma), k: k.kategori } },
    h('span', { class: 'hc-kayit-ikon', 'aria-hidden': 'true' }, ikon(k.hesaplasma ? 'heart' : k.kategori)),
    h('div', { class: 'hc-kayit-govde' },
      h('p', { class: 'hc-kayit-baslik' }, k.baslik),
      h('p', { class: 'hc-kayit-meta' }, meta)),
    h('p', { class: 'hc-kayit-tutar' }, paraMetni(k.tutar)),
    h('button', {
      type: 'button', class: 'icon-btn hc-kayit-menu', 'aria-expanded': String(acik),
      'aria-label': `Seçenekler: ${k.baslik}, ${paraMetni(k.tutar)}`, dataset: { odak: `menu:${doc.id}` },
      onclick: () => { durum.menu = acik ? null : doc.id; ciz(); },
    }, ikon('more')));
  if (acik) {
    li.append(h('div', { class: 'hc-kayit-eylem' },
      k.hesaplasma ? null : h('button', { type: 'button', class: 'btn small ghost', onclick: () => formAc(doc) }, ikon('edit'), 'Düzenle'),
      h('button', { type: 'button', class: 'btn small ghost danger', onclick: () => sil(doc) }, ikon('trash'), 'Sil')));
  }
  return li;
}

function cizOzet(oz) {
  if (!oz.toplam) {
    ozetEl.replaceChildren();
    ozetEl.hidden = true;
    return;
  }
  ozetEl.hidden = false;
  const pId = partnerId();
  const benim = oz.odeyenler[myId] || 0;
  const onun = Object.entries(oz.odeyenler).reduce((t, [kim, n]) => (kim === myId ? t : t + n), 0);
  const odeyenMetni = [[benAdi(), benim], [adOf(pId), onun]].filter(([, n]) => n).map(([ad, n]) => `${ad} ${paraMetni(n)} ödedi`).join(' · ');
  ozetEl.replaceChildren(
    h('div', { class: 'hc-toplam' },
      h('span', {}, durum.ay ? `${ayMetni(durum.ay)} toplamı` : 'Tüm zamanlar toplamı'),
      h('strong', {}, paraMetni(oz.toplam))),
    h('p', { class: 'hc-odeyenler' }, odeyenMetni),
    h('ul', { class: 'hc-kategori-ozet', 'aria-label': 'Kategorilere göre' }, oz.kategoriler.map((k) => h('li', {},
      h('div', { class: 'hc-ko-ust' },
        h('span', { class: 'hc-ko-ad' }, k.ad),
        h('span', { class: 'hc-ko-tutar' }, paraMetni(k.toplam), h('span', { class: 'hc-ko-oran' }, ` · %${k.oran}`))),
      h('span', { class: 'hc-ko-cubuk', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.max(2, k.oran)}%` } }))))));
}

function cizAySecim(docs) {
  const liste = aylar(docs);
  const buAy = toDay().slice(0, 7);
  if (!liste.includes(buAy)) liste.unshift(buAy);
  if (durum.ay && !liste.includes(durum.ay)) liste.push(durum.ay);
  liste.sort().reverse();
  aySecim.replaceChildren(
    ...liste.map((ay) => h('option', { value: ay }, ayMetni(ay))),
    h('option', { value: '' }, 'Tüm zamanlar'));
  aySecim.value = durum.ay || '';
}

function ciz() {
  const docs = col.all();
  const pId = partnerId();
  const d = bakiyeDurumu(bakiye(docs), myId, pId);
  bakiyeEl.dataset.durum = d.tutar ? (d.borclu === myId ? 'borclu' : 'alacakli') : 'denk';
  bakiyeMetinEl.textContent = bakiyeMetni(d, adOf);
  bakiyeAltEl.textContent = d.tutar
    ? (d.borclu === myId ? 'Ödeyince “Hesaplaştık”a dokun.' : `${adOf(d.borclu)} ödeyince “Hesaplaştık”a dokunun.`)
    : 'Tüm ortak harcamalarınıza göre.';
  hesaplasBtn.hidden = !hesaplasmaKaydi(d, { tarih: toDay() });

  partnerYokEl.hidden = !!pId;
  ekleBtn.disabled = !pId;
  if (!durum.formAcik) ekleBtn.hidden = false;

  cizAySecim(docs);
  const kayitlar = ayFiltresi(docs, durum.ay);
  cizOzet(kategoriOzeti(docs, durum.ay));
  const odak = document.activeElement?.dataset?.odak || null;
  listeEl.replaceChildren(...kayitlar.map(kayitEl));
  if (odak) listeEl.querySelector(`[data-odak="${CSS.escape(odak)}"]`)?.focus({ preventScroll: true });
  bosEl.hidden = kayitlar.length > 0;
  if (!kayitlar.length) {
    bosEl.replaceChildren(
      h('strong', {}, durum.ay ? `${ayMetni(durum.ay)} için harcama yok` : 'Henüz harcama yok'),
      h('p', {}, 'Market, kira, akşam yemeği… Ortak harcamayı ekleyin, kim kime ne borçlu biz hesaplayalım.'));
  }
}

// ---------- Canlı ----------
for (const g of [baslikGirdi, tutarGirdi, tarihGirdi]) g.addEventListener('input', () => { if (!hataEl.hidden) hataGoster(null); });
tutarGirdi.addEventListener('blur', () => {
  const k = tutarCoz(tutarGirdi.value);
  if (k != null) tutarGirdi.value = paraMetni(k).replace(/ ₺$/, '');
});
formEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); formKapat(); } });
let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Kayıt bekletilip gönderilecek.');
});
col.on('change', ciz);
profil?.on('change', () => { ciz(); kumbara.ciz(); if (durum.formAcik) formCiz(); });
room.on('presence', () => { ciz(); kumbara.ciz(); });

ciz();
sekmeGoster();
