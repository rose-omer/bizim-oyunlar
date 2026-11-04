// Ortak Kumbara: Harcamalar sayfasının "Kumbara" sekmesi. Birlikte biriktirilen hedefler.
// Saf mantık kumbara-mantik.js'te (tests/kumbara-mantik). Koleksiyonlar sekme ilk açılınca yüklenir.
// Metinler yalnız textContent ile basılır (h()).
import { openCollection } from '../../js/core/veri.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { toDay, daysBetween } from '../../js/core/gunler.js';
import { h, toast, confirmDialog, celebrate } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ikon } from './ikonlar.js';
import { tutarCoz, paraMetni } from './mantik.js';
import * as K from './kumbara-mantik.js';

const BILDIRIM_URL = 'sayfalar/harcama/?sekme=kumbara';
const KUTLAMA_GUN = 3;        // sevgili hedefi bu kadar gün içinde tamamladıysa burada da kutlanır
const SON_KATKI = 3;          // kartta görünen son hareket sayısı
const kisaTarih = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const uzunTarih = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const yerelTarih = (gun) => {
  const [y, m, d] = gun.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const tutarYaz = (kurus) => paraMetni(kurus).replace(/\s*₺$/, '');

export function kumbaraKur({ room, roomId, myId, benAdi, partnerAdi }) {
  let kCol = null;
  let katCol = null;
  let acilis = null;
  let gorunur = false;
  const durum = {
    formAcik: false, duzen: null, emoji: K.EMOJILER[0], sonVar: false,
    katki: null, cekim: false, menu: null, tumu: new Set(),
  };
  const onbellek = new Map(); // kumbara id → { imza, el }
  const cubuk = new Map();    // kumbara id → son çizilen dilimler { ben, o, toplam }

  const el = h('div', { class: 'kb' });

  // ---------- Kutlama hafızası (yalnız bu cihaz) ----------
  const kutlamaAnahtar = `bizim.kumbara.kutlandi.${roomId}`;
  const kutlananlar = () => {
    try { return JSON.parse(localStorage.getItem(kutlamaAnahtar) || '[]'); } catch { return []; }
  };
  const kutlandiYaz = (id) => {
    try { localStorage.setItem(kutlamaAnahtar, JSON.stringify([...kutlananlar().filter((x) => x !== id), id].slice(-50))); } catch { /* depo kapalı */ }
  };
  function kutla(k) {
    sfx('match');
    celebrate({
      title: 'Hedefe ulaştınız!',
      lines: [`${k.emoji} ${k.baslik}: ${K.kisaPara(k.hedef)} birikti.`, 'Birlikte başardınız. Kumbara sizinle gurur duyuyor 🐷'],
      buttons: [{ label: 'Yaşasın', primary: true }],
    });
  }

  function haberVer(icerik) {
    if (partnerGoruyor(room.partner?.(), 'harcama')) return;
    bildir(roomId, { tur: 'liste', ...icerik, url: BILDIRIM_URL, gizli: { baslik: 'Kumbara 🐷', metin: 'Kumbarada yenilik var' } })
      .catch((err) => console.warn('[kumbara] bildirim gönderilemedi', err));
  }

  // ---------- Kumbara formu (yeni / düzenle) ----------
  const baslikGirdi = h('input', { id: 'kb-baslik', class: 'input', type: 'text', maxlength: String(K.KUMBARA_BASLIK_MAX), autocomplete: 'off', placeholder: 'ör. Kapadokya tatili', enterkeyhint: 'next' });
  const hedefGirdi = h('input', { id: 'kb-hedef', class: 'input hc-tutar-girdi', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '20.000', enterkeyhint: 'done' });
  const emojiGrup = h('div', { class: 'kb-emojiler', role: 'radiogroup', 'aria-labelledby': 'kb-emoji-etiket' });
  const sonSeg = h('div', { class: 'seg hc-seg', role: 'group', 'aria-labelledby': 'kb-son-etiket' });
  const sonGirdi = h('input', { id: 'kb-son', class: 'input', type: 'date' });
  const sonAlan = h('div', { class: 'kb-son-alan', hidden: true }, h('label', { class: 'sr-only', for: 'kb-son' }, 'Son gün'), sonGirdi);
  const formHata = h('p', { class: 'hc-hata', role: 'alert', hidden: true });
  const formKaydet = h('button', { type: 'submit', class: 'btn primary' }, 'Kur');
  const formBaslik = h('h2', { class: 'hc-form-baslik', id: 'kb-form-baslik' }, 'Yeni kumbara');
  const formEl = h('form', { id: 'kb-form', class: 'hc-form', hidden: true, novalidate: true, 'aria-labelledby': 'kb-form-baslik', onsubmit: kumbaraKaydet },
    formBaslik,
    h('div', { class: 'hc-alan' }, h('label', { for: 'kb-baslik' }, 'Ne için biriktiriyorsunuz?'), baslikGirdi),
    h('div', { class: 'hc-alan' }, h('span', { class: 'hc-etiket', id: 'kb-emoji-etiket' }, 'Simge'), emojiGrup),
    h('div', { class: 'hc-alan' }, h('label', { for: 'kb-hedef' }, 'Hedef'),
      h('div', { class: 'hc-tutar' }, hedefGirdi, h('span', { class: 'hc-tl', 'aria-hidden': 'true' }, '₺'))),
    h('div', { class: 'hc-alan' }, h('span', { class: 'hc-etiket', id: 'kb-son-etiket' }, 'Son gün'), sonSeg, sonAlan),
    formHata,
    h('div', { class: 'hc-dugmeler' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => formKapat() }, 'Vazgeç'), formKaydet));
  const yeniBtn = h('button', { type: 'button', class: 'btn wide kb-yeni', 'aria-expanded': 'false', 'aria-controls': 'kb-form', onclick: () => formAc() },
    ikon('plus'), 'Yeni kumbara kur');

  function emojiCiz() {
    emojiGrup.replaceChildren(...K.EMOJILER.map((e) => h('button', {
      type: 'button', role: 'radio', class: 'kb-emoji-sec', 'aria-checked': String(e === durum.emoji), 'aria-label': e,
      tabindex: e === durum.emoji ? '0' : '-1',
      onclick: () => { durum.emoji = e; emojiCiz(); emojiGrup.querySelector('[aria-checked="true"]')?.focus(); },
    }, e)));
  }
  emojiGrup.addEventListener('keydown', (e) => {
    const l = K.EMOJILER;
    let i = l.indexOf(durum.emoji);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (i + 1) % l.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = (i - 1 + l.length) % l.length;
    else return;
    e.preventDefault();
    durum.emoji = l[i];
    emojiCiz();
    emojiGrup.querySelector('[aria-checked="true"]')?.focus();
  });
  function sonCiz() {
    const dugme = (etiket, var_) => h('button', {
      type: 'button', 'aria-pressed': String(durum.sonVar === var_),
      onclick: () => { durum.sonVar = var_; sonCiz(); if (var_) sonGirdi.focus(); },
    }, etiket);
    sonSeg.replaceChildren(dugme('Süresiz', false), dugme('Son günü olsun', true));
    sonAlan.hidden = !durum.sonVar;
  }

  function formHataGoster(metin, alan = null) {
    formHata.hidden = !metin;
    formHata.textContent = metin || '';
    for (const g of [baslikGirdi, hedefGirdi, sonGirdi]) g.removeAttribute('aria-invalid');
    if (alan) {
      alan.setAttribute('aria-invalid', 'true');
      alan.focus();
    }
  }

  function formAc(doc = null) {
    const k = doc ? K.kumbaraOku(doc) : null;
    durum.formAcik = true;
    durum.duzen = doc?.id || null;
    durum.menu = null;
    durum.emoji = k?.emoji && K.EMOJILER.includes(k.emoji) ? k.emoji : K.EMOJILER[0];
    durum.sonVar = !!k?.son;
    baslikGirdi.value = k?.baslik || '';
    hedefGirdi.value = k ? tutarYaz(k.hedef) : '';
    sonGirdi.min = toDay();
    sonGirdi.value = k?.son || '';
    formBaslik.textContent = k ? 'Kumbarayı düzenle' : 'Yeni kumbara';
    formKaydet.textContent = k ? 'Kaydet' : 'Kur';
    formHataGoster(null);
    emojiCiz();
    sonCiz();
    formEl.hidden = false;
    yeniBtn.hidden = true;
    yeniBtn.setAttribute('aria-expanded', 'true');
    ciz();
    baslikGirdi.focus({ preventScroll: true });
    formEl.scrollIntoView({ block: 'center', behavior: azHareket() ? 'auto' : 'smooth' });
  }

  function formKapat(odakla = true) {
    durum.formAcik = false;
    durum.duzen = null;
    formEl.hidden = true;
    yeniBtn.hidden = false;
    yeniBtn.setAttribute('aria-expanded', 'false');
    formHataGoster(null);
    ciz();
    if (odakla) (yeniBtn.hidden ? el.querySelector('.kb-ilk') : yeniBtn)?.focus({ preventScroll: true });
  }

  async function kumbaraKaydet(e) {
    e.preventDefault();
    const duzen = durum.duzen;
    const eski = duzen ? K.kumbaraOku(kCol.get(duzen)) : null;
    const son = durum.sonVar ? sonGirdi.value : '';
    if (durum.sonVar && !son) { formHataGoster('Son günü seç.', sonGirdi); return; }
    const r = K.yeniKumbara({
      baslik: baslikGirdi.value, emoji: durum.emoji, hedefMetni: hedefGirdi.value, son,
      bugun: eski && son && son === eski.son ? null : toDay(), // geçmiş son gün değişmediyse düzenleme engellenmez
    });
    if (r.hata) {
      const alan = /adını|Ad en/.test(r.hata) ? baslikGirdi : /Hedef/.test(r.hata) ? hedefGirdi : /Son gün/.test(r.hata) ? sonGirdi : null;
      formHataGoster(r.hata, alan);
      return;
    }
    let data = r.data;
    if (eski) {
      const toplam = K.kumbaraOzeti(duzen, r.data.hedef, katCol.all(), myId).toplam;
      const tamam = K.duzenTamam({ eskiTamam: eski.tamam, eskiHedef: eski.hedef, yeniHedef: r.data.hedef, toplam, simdi: new Date().toISOString() });
      if (tamam) data = { ...data, tamam };
    }
    formKaydet.disabled = true;
    try {
      await kCol.put(data, duzen || undefined);
    } catch (err) {
      formHataGoster(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
      return;
    } finally {
      formKaydet.disabled = false;
    }
    sfx('pop');
    formKapat();
    if (eski) { toast('Kumbara güncellendi'); return; }
    toast(`${data.emoji} Kumbaranız hazır. İlk parayı kim koyacak?`);
    haberVer({ baslik: `${data.emoji} Yeni kumbara`, metin: `${benAdi()} yeni bir kumbara kurdu: ${data.baslik}, hedef ${K.kisaPara(data.hedef)}` });
  }

  async function kumbaraSil(doc) {
    durum.menu = null;
    const k = K.kumbaraOku(doc);
    const ok = await confirmDialog(`“${k.baslik}” kumbarası ikiniz için de silinsin mi?`, { ok: 'Sil', cancel: 'Vazgeç' });
    if (!ok) { ciz(); return; }
    const yedek = { ...doc.data };
    try {
      await kCol.remove(doc.id);
    } catch (err) {
      toast(err?.message || 'Silinemedi.');
      return;
    }
    if (durum.katki === doc.id) durum.katki = null;
    sfx('tap');
    toast('Kumbara silindi', { action: { label: 'Geri al', onClick: () => kCol.put(yedek, doc.id).catch((er) => toast(er.message)) } });
  }

  // ---------- Para koy / al formu (açık kartın içinde) ----------
  const katkiTutar = h('input', { id: 'kb-katki-tutar', class: 'input hc-tutar-girdi', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', enterkeyhint: 'next' });
  const katkiNot = h('input', { id: 'kb-katki-not', class: 'input', type: 'text', maxlength: String(K.NOT_MAX), autocomplete: 'off', placeholder: 'ör. Maaştan', enterkeyhint: 'done' });
  const katkiSeg = h('div', { class: 'seg hc-seg', role: 'group', 'aria-label': 'Koy ya da al' });
  const katkiHata = h('p', { class: 'hc-hata', role: 'alert', hidden: true });
  const katkiKaydetBtn = h('button', { type: 'submit', class: 'btn primary' });
  const katkiForm = h('form', { class: 'kb-katki-form', novalidate: true, 'aria-label': 'Kumbaraya para', onsubmit: katkiKaydet },
    katkiSeg,
    h('div', { class: 'hc-alan' }, h('label', { for: 'kb-katki-tutar' }, 'Tutar'),
      h('div', { class: 'hc-tutar' }, katkiTutar, h('span', { class: 'hc-tl', 'aria-hidden': 'true' }, '₺'))),
    h('div', { class: 'hc-alan' }, h('label', { for: 'kb-katki-not' }, 'Not ', h('span', { class: 'kb-istege' }, '(isteğe bağlı)')), katkiNot),
    katkiHata,
    h('div', { class: 'hc-dugmeler' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => katkiKapat() }, 'Vazgeç'), katkiKaydetBtn));

  function katkiSegCiz() {
    const dugme = (etiket, cekim) => h('button', {
      type: 'button', 'aria-pressed': String(durum.cekim === cekim),
      onclick: () => { durum.cekim = cekim; katkiSegCiz(); katkiTutar.focus(); },
    }, etiket);
    katkiSeg.replaceChildren(dugme('Para koy', false), dugme('Para al', true));
    katkiKaydetBtn.textContent = durum.cekim ? 'Kumbaradan al' : 'Kumbaraya koy';
  }

  function katkiHataGoster(metin, alan = null) {
    katkiHata.hidden = !metin;
    katkiHata.textContent = metin || '';
    for (const g of [katkiTutar, katkiNot]) g.removeAttribute('aria-invalid');
    if (alan) {
      alan.setAttribute('aria-invalid', 'true');
      alan.focus();
    }
  }

  function katkiAc(id) {
    durum.katki = id;
    durum.cekim = false;
    durum.menu = null;
    katkiTutar.value = '';
    katkiNot.value = '';
    katkiHataGoster(null);
    katkiSegCiz();
    ciz();
    katkiTutar.focus({ preventScroll: true });
    katkiForm.scrollIntoView({ block: 'nearest', behavior: azHareket() ? 'auto' : 'smooth' });
  }

  function katkiKapat(odakla = true) {
    const id = durum.katki;
    durum.katki = null;
    katkiHataGoster(null);
    ciz();
    if (odakla && id) el.querySelector(`[data-odak="${CSS.escape(`koy:${id}`)}"]`)?.focus({ preventScroll: true });
  }

  async function katkiKaydet(e) {
    e.preventDefault();
    const id = durum.katki;
    const k = K.kumbaraOku(kCol.get(id));
    if (!k) { katkiKapat(false); return; }
    const once = K.kumbaraOzeti(id, k.hedef, katCol.all(), myId);
    const r = K.yeniKatki({
      kumbara: id, tutarMetni: katkiTutar.value, cekim: durum.cekim, kim: myId, not: katkiNot.value,
      tarih: toDay(), mevcut: once.toplam,
    });
    if (r.hata) {
      katkiHataGoster(r.hata, /^Not/.test(r.hata) ? katkiNot : katkiTutar);
      return;
    }
    katkiKaydetBtn.disabled = true;
    durum.katki = null; // kart kapalı hâliyle bir kez çizilsin; çubuk animasyonu yeniden çizimle kesilmesin
    let katkiId;
    try {
      katkiId = await katCol.put(r.data);
    } catch (err) {
      durum.katki = id;
      ciz();
      katkiHataGoster(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
      return;
    } finally {
      katkiKaydetBtn.disabled = false;
    }
    const tutar = r.data.tutar;
    katkiHataGoster(null);
    ciz();
    el.querySelector(`[data-odak="${CSS.escape(`koy:${id}`)}"]`)?.focus({ preventScroll: true });
    haberVer(K.bildirimMetni(benAdi(), tutar, kCol.get(id)?.data));
    if (!k.tamam && once.toplam + tutar >= k.hedef) {
      kutlandiYaz(id);
      kCol.patch(id, { tamam: new Date().toISOString() }).catch((err) => toast(err?.message || 'Kaydedilemedi.'));
      kutla(k);
      return;
    }
    sfx(tutar > 0 ? 'pop' : 'tap');
    toast(tutar > 0 ? `${K.kisaPara(tutar)} kumbarada 🐷` : `${K.kisaPara(-tutar)} kumbaradan alındı`, {
      action: { label: 'Geri al', onClick: () => katCol.remove(katkiId).catch((err) => toast(err.message)) },
    });
  }

  // ---------- Kart ----------
  function hareketEl(kt) {
    const al = kt.tutar < 0;
    const ad = kt.kim === myId ? benAdi() : partnerAdi();
    return h('li', { class: 'kb-katki', dataset: { yon: al ? 'al' : 'koy' } },
      h('div', { class: 'kb-katki-govde' },
        h('p', { class: 'kb-katki-ust' }, `${ad} ${al ? 'aldı' : 'koydu'}`),
        h('p', { class: 'kb-katki-alt' }, [kisaTarih.format(yerelTarih(kt.tarih)), kt.not].filter(Boolean).join(' · '))),
      h('p', { class: 'kb-katki-tutar' }, `${al ? '−' : '+'}${K.kisaPara(Math.abs(kt.tutar))}`));
  }

  function metaMetni(k, ulasti, bugun) {
    if (ulasti) return k.tamam ? `${uzunTarih.format(new Date(k.tamam))} hedefe ulaştınız` : 'Hedefe ulaştınız';
    if (!k.son) return 'Acele yok, kendi hızınızda';
    const kalan = K.sonGunMetni(k.son, bugun);
    return daysBetween(bugun, k.son) > 1 ? `${kalan} · ${uzunTarih.format(yerelTarih(k.son))}` : kalan;
  }

  function ipucuMetni(k, oz, ulasti, bugun) {
    if (ulasti) return 'Birlikte başardınız 🎉';
    if (!oz.katkilar.length) return 'İlk parayı kim koyacak? 🐷';
    const oneri = K.birikimOnerisi(oz.kalan, bugun, k.son);
    const yetis = oneri ? ` · ${oneri.birim === 'ay' ? 'Ayda' : 'Haftada'} ${K.kisaPara(oneri.tutar)} koyarsanız yetişir.` : '';
    return `${K.kisaPara(oz.kalan)} kaldı${yetis}`;
  }

  function kartEl(doc, k, oz, bugun, animasyonlar) {
    const id = doc.id;
    const ulasti = !!k.tamam || oz.ulasti;
    const menuAcik = durum.menu === id;
    const baslikId = `kb-b-${id}`;
    const pay = K.cubukPaylari(oz, k.hedef);
    const once = cubuk.get(id);
    const artti = !!once && oz.toplam > once.toplam;
    const benEl = h('span', { class: 'kb-dilim ben' });
    const oEl = h('span', { class: 'kb-dilim o' });
    const genislik = (p) => {
      benEl.style.width = `${p.ben}%`;
      oEl.style.width = `${p.o}%`;
      oEl.classList.toggle('ayrac', p.ben > 0 && p.o > 0);
    };
    if (once && (once.ben !== pay.ben || once.o !== pay.o) && !azHareket()) {
      genislik(once);
      animasyonlar.push(() => genislik(pay));
    } else {
      genislik(pay);
    }
    cubuk.set(id, { ...pay, toplam: oz.toplam });

    const katkilar = durum.tumu.has(id) ? oz.katkilar : oz.katkilar.slice(0, SON_KATKI);
    const art = h('article', { class: `kb-kart${artti && !azHareket() ? ' artti' : ''}`, dataset: { ulasti: String(ulasti) }, 'aria-labelledby': baslikId },
      h('header', { class: 'kb-ust' },
        h('span', { class: 'kb-emoji', 'aria-hidden': 'true' }, k.emoji),
        h('div', { class: 'kb-ust-yazi' },
          h('h3', { class: 'kb-baslik', id: baslikId }, k.baslik),
          h('p', { class: 'kb-meta' }, ulasti ? ikon('check') : null, metaMetni(k, ulasti, bugun))),
        h('button', {
          type: 'button', class: 'icon-btn kb-menu', 'aria-expanded': String(menuAcik), 'aria-label': `Seçenekler: ${k.baslik}`,
          dataset: { odak: `menu:${id}` }, onclick: () => { durum.menu = menuAcik ? null : id; ciz(); },
        }, ikon('more'))),
      menuAcik ? h('div', { class: 'kb-eylem' },
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => formAc(doc) }, ikon('edit'), 'Düzenle'),
        h('button', { type: 'button', class: 'btn small ghost danger', onclick: () => kumbaraSil(doc) }, ikon('trash'), 'Sil')) : null,
      h('div', { class: 'kb-rakam' },
        h('p', { class: 'kb-tutar' }, K.ilerlemeMetni(oz.toplam, k.hedef)),
        h('p', { class: 'kb-oran' }, `%${oz.oran}`)),
      h('div', {
        class: 'kb-cubuk', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(oz.oran),
        'aria-valuetext': `${K.kisaPara(Math.max(0, oz.toplam))} birikti, hedef ${K.kisaPara(k.hedef)}`, 'aria-labelledby': baslikId,
      }, benEl, oEl),
      h('ul', { class: 'kb-kisiler', 'aria-label': 'Kim ne kadar koydu' },
        h('li', { class: 'ben' }, h('span', { class: 'kb-nokta', 'aria-hidden': 'true' }), h('span', { class: 'kb-kisi-ad' }, benAdi()), h('strong', {}, K.kisaPara(oz.ben))),
        h('li', { class: 'o' }, h('span', { class: 'kb-nokta', 'aria-hidden': 'true' }), h('span', { class: 'kb-kisi-ad' }, partnerAdi()), h('strong', {}, K.kisaPara(oz.o)))),
      h('p', { class: 'kb-ipucu' }, ipucuMetni(k, oz, ulasti, bugun)),
      durum.katki === id ? katkiForm : h('button', {
        type: 'button', class: `btn ${ulasti ? '' : 'primary '}wide kb-koy`, dataset: { odak: `koy:${id}` }, onclick: () => katkiAc(id),
      }, ikon('plus'), ulasti ? 'Para koy ya da al' : 'Para koy'),
      oz.katkilar.length ? h('section', { class: 'kb-hareket', 'aria-labelledby': `kb-h-${id}` },
        h('h4', { class: 'kb-hareket-baslik', id: `kb-h-${id}` }, 'Son hareketler'),
        h('ul', { class: 'kb-katkilar' }, katkilar.map(hareketEl)),
        oz.katkilar.length > SON_KATKI ? h('button', {
          type: 'button', class: 'btn small ghost kb-tumu', 'aria-expanded': String(durum.tumu.has(id)), dataset: { odak: `tumu:${id}` },
          onclick: () => { if (durum.tumu.has(id)) durum.tumu.delete(id); else durum.tumu.add(id); ciz(); },
        }, durum.tumu.has(id) ? 'Daha az göster' : `Tümünü gör (${oz.katkilar.length})`) : null) : null);
    return art;
  }

  // ---------- Çizim ----------
  const listeEl = h('div', { class: 'kb-liste' });
  const bosEl = h('div', { class: 'hc-bos kb-bos', hidden: true },
    h('span', { class: 'kb-bos-emoji', 'aria-hidden': 'true' }, '🐷'),
    h('strong', {}, 'Henüz kumbaranız yok'),
    h('p', {}, 'Tatil, yüzük, yeni ev… Ortak hedefinizi koyun, birlikte biriktirin.'),
    h('button', { type: 'button', class: 'btn primary kb-ilk', onclick: () => formAc() }, ikon('plus'), 'İlk kumbaranızı kurun'));
  const yeniYuva = h('div', { class: 'hc-ekle-yuva' }, yeniBtn, formEl);

  function ciz() {
    if (!kCol || !katCol) return;
    const docs = K.kumbaraSirala(kCol.all());
    const bugun = toDay();
    const odakEl = document.activeElement;
    const odak = odakEl?.dataset?.odak || null;
    const formdaOdak = katkiForm.contains(odakEl) ? odakEl : null;
    const animasyonlar = [];
    const kartlar = docs.map((doc) => {
      const k = K.kumbaraOku(doc);
      const oz = K.kumbaraOzeti(doc.id, k.hedef, katCol.all(), myId);
      const imza = JSON.stringify([k, oz, benAdi(), partnerAdi(), bugun, durum.menu === doc.id, durum.katki === doc.id, durum.tumu.has(doc.id)]);
      const eski = onbellek.get(doc.id);
      if (eski?.imza === imza) return eski.el;
      const yeni = kartEl(doc, k, oz, bugun, animasyonlar);
      onbellek.set(doc.id, { imza, el: yeni });
      return yeni;
    });
    for (const id of onbellek.keys()) if (!docs.some((d) => d.id === id)) onbellek.delete(id);
    const ayni = kartlar.length === listeEl.children.length && kartlar.every((k, i) => listeEl.children[i] === k);
    if (!ayni) listeEl.replaceChildren(...kartlar);
    if (animasyonlar.length) {
      void listeEl.offsetWidth; // eski genişlik çizilsin, sonra yeni genişliğe kaysın
      for (const f of animasyonlar) f();
    }
    if (formdaOdak && formdaOdak.isConnected) formdaOdak.focus({ preventScroll: true });
    else if (odak && !listeEl.contains(document.activeElement)) listeEl.querySelector(`[data-odak="${CSS.escape(odak)}"]`)?.focus({ preventScroll: true });

    listeEl.hidden = !docs.length;
    bosEl.hidden = docs.length > 0 || durum.formAcik;
    yeniBtn.hidden = durum.formAcik || !docs.length;
    sevgiliKutlamasi(docs);
  }

  // Sevgili hedefi az önce tamamladıysa burada da bir kez kutlanır.
  function sevgiliKutlamasi(docs) {
    if (!gorunur || document.visibilityState !== 'visible') return;
    const kutlanan = new Set(kutlananlar());
    for (const doc of docs) {
      const k = K.kumbaraOku(doc);
      if (!k.tamam || kutlanan.has(doc.id)) continue;
      const gecen = (Date.now() - Date.parse(k.tamam)) / 86400000;
      if (!(gecen >= 0 && gecen <= KUTLAMA_GUN)) continue;
      kutlandiYaz(doc.id);
      kutla(k);
      return;
    }
  }

  // ---------- Canlı ----------
  for (const g of [baslikGirdi, hedefGirdi, sonGirdi]) g.addEventListener('input', () => { if (!formHata.hidden) formHataGoster(null); });
  for (const g of [katkiTutar, katkiNot]) g.addEventListener('input', () => { if (!katkiHata.hidden) katkiHataGoster(null); });
  for (const g of [hedefGirdi, katkiTutar]) {
    g.addEventListener('blur', () => {
      const n = tutarCoz(g.value);
      if (n != null) g.value = tutarYaz(n);
    });
  }
  formEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); formKapat(); } });
  katkiForm.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); katkiKapat(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciz(); });

  async function ac() {
    el.replaceChildren(h('p', { class: 'hc-yukleniyor muted', role: 'status' }, 'Kumbara açılıyor…'));
    try {
      [kCol, katCol] = await Promise.all([openCollection(room, 'kumbara'), openCollection(room, 'katki')]);
    } catch (err) {
      console.warn('[kumbara] açılamadı', err);
      acilis = null;
      el.replaceChildren(h('div', { class: 'hc-bos' },
        h('strong', {}, 'Kumbara açılamadı'),
        h('p', {}, 'Bağlantını kontrol edip yeniden dene.'),
        h('button', { type: 'button', class: 'btn', onclick: () => goster() }, 'Yeniden dene')));
      return;
    }
    let sonHata = 0;
    const hataGoster = (err) => {
      if (Date.now() - sonHata < 15000) return;
      sonHata = Date.now();
      toast(err?.message || 'Bağlantı sorunu. Kayıt bekletilip gönderilecek.');
    };
    for (const c of [kCol, katCol]) {
      c.on('error', hataGoster);
      c.on('change', ciz);
    }
    el.replaceChildren(listeEl, bosEl, yeniYuva);
  }

  async function goster() {
    gorunur = true;
    if (!acilis) acilis = ac();
    await acilis;
    ciz();
  }

  return {
    el,
    goster,
    gizle: () => { gorunur = false; },
    ciz,
  };
}
