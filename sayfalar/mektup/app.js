// Mektuplar: gelen/giden zarflar, zaman kapsülü (kilit + geri sayım), açılma animasyonu, mektup yazma.
// Görünüm adresten gelir: (yok) zarflar · ?yaz=1 mektup yaz · ?id=<id> o mektubu aç.
// Mektup metni yalnız textContent ile basılır (h() çocukları metin düğümüdür); satır sonları CSS pre-wrap ile korunur.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { h, toast, confirmDialog, formatDay, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import * as M from './mantik.js';
import { ikon } from '../anilar/ikon.js';

const { room, roomId, me } = await bootPage({ ns: 'mektup', title: 'Mektuplar', tab: 'daha' });
const app = document.getElementById('app');
const col = await openCollection(room, 'mektup');
const profil = await openProfil(room).catch(() => null);

const TASLAK = `bizim.mektup.taslak.${roomId}.${me.clientId}`;
const ROTA_ANAHTARLARI = ['yaz', 'id'];
let kutu = 'gelen';
let aktif = null;
let acikDialog = null;

const azHareket = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function oku(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
function yaz(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* gizli sekme */ } }

// ---------- Yönlendirme ----------

function rota() {
  const p = new URLSearchParams(location.search);
  if (p.get('yaz') === '1') return { ad: 'yaz' };
  return { ad: 'liste', id: p.get('id') };
}
function rotaUrl(params = {}) {
  const u = new URL(location.href);
  ROTA_ANAHTARLARI.forEach((k) => u.searchParams.delete(k));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.pathname + u.search;
}
const derinlik = () => history.state?.mektupDerinlik || 0;
function git(params = {}, { degistir = false } = {}) {
  const d = derinlik();
  if (degistir) history.replaceState({ mektupDerinlik: d }, '', rotaUrl(params));
  else history.pushState({ mektupDerinlik: d + 1 }, '', rotaUrl(params));
  ciz();
}
function geriDon() {
  if (derinlik() > 0) history.back();
  else git({}, { degistir: true });
}

function ciz() {
  aktif?.kapat?.();
  const r = rota();
  aktif = r.ad === 'yaz' ? yazGorunumu() : listeGorunumu(r.id);
  scrollTo(0, 0);
}

let pencereGeri = false; // pencere kendi kapanınca attığı geri adım: görünüm yeniden çizilmez
addEventListener('popstate', () => {
  // Açık mektup penceresi varsa geri hareketi önce onu kapatır.
  if (acikDialog) {
    const d = acikDialog;
    acikDialog = null;
    d.close();
    return;
  }
  if (pencereGeri) {
    pencereGeri = false;
    return;
  }
  ciz();
});
col.on('change', () => aktif?.guncelle?.());
col.on('error', (e) => toast(e.message));
profil?.on('change', () => aktif?.guncelle?.());

// ---------- Adlar ----------

const partnerAdi = () => profil?.partner()?.ad || knownPartner(roomId)?.name || '';
function kisiAdi(id) {
  if (!id) return partnerAdi();
  if (id === me.clientId) return me.name || '';
  return profil?.kisiler?.get(id)?.data?.ad || partnerAdi();
}
const kimden = (doc) => { const ad = kisiAdi(M.yazan(doc)); return ad ? M.ek(ad, 'den') : 'Sevgilinden'; };
const kime = (doc) => { const ad = kisiAdi(doc.data.kime); return ad ? M.ek(ad, 'e') : 'Sevgiline'; };
const kimeYeni = () => { const ad = partnerAdi(); return ad ? M.ek(ad, 'e') : 'Sevgiline'; };

// ---------- Zarf ----------

/** Zarf çizimi. buyuk: açılma sahnesindeki büyük zarf (yazısız). */
function zarfEl(doc, { buyuk = false, onclick } = {}) {
  const d = doc.data;
  const dr = M.durum(doc, me.clientId);
  const yn = M.yon(doc, me.clientId);
  const parcalar = [
    h('span', { class: 'zarf-kagit', 'aria-hidden': 'true' }),
    h('span', { class: 'zarf-cep', 'aria-hidden': 'true' }),
    h('span', { class: 'zarf-kapak', 'aria-hidden': 'true' }),
    h('span', { class: 'zarf-muhur', 'aria-hidden': 'true' }, dr === 'kilitli' ? ikon('kilit') : ikon('kalp', { dolu: true })),
  ];
  const ds = { zarf: M.zarfRengi(d.zarf), durum: dr, yon: yn };
  if (buyuk) return h('div', { class: 'zarf buyuk', dataset: ds }, parcalar);

  const kim = yn === 'gelen' ? kimden(doc) : kime(doc);
  let durumEl = null;
  let durumMetni = '';
  if (dr === 'kilitli') {
    durumMetni = `Kilitli, açılış ${M.acilisYazi(d.acilis)}`;
    durumEl = h('span', { class: 'zarf-durum kilit' }, ikon('kilit'),
      h('span', { class: 'mk-geri-sayim', dataset: { acilis: d.acilis } }, M.kalanYazi(d)));
  } else if (dr === 'yeni') {
    durumMetni = 'Yeni, açılmadı';
    durumEl = h('span', { class: 'zarf-durum yeni' }, 'Yeni');
  } else if (dr === 'okundu' && yn === 'giden') {
    durumMetni = 'Okundu';
    durumEl = h('span', { class: 'zarf-durum okundu' }, 'Okundu 💌');
  } else if (dr === 'gonderildi') {
    durumMetni = 'Henüz açılmadı';
    durumEl = h('span', { class: 'zarf-durum' }, 'Gönderildi');
  } else {
    durumMetni = 'Açıldı';
  }
  return h('button', {
    type: 'button', class: 'zarf', dataset: ds,
    'aria-label': `${kim}: ${d.baslik}. ${durumMetni}.`,
    onclick,
  }, parcalar,
  durumEl,
  h('span', { class: 'zarf-tarih', 'aria-hidden': 'true' }, formatDay(doc.created_at)),
  h('span', { class: 'zarf-yazi', 'aria-hidden': 'true' },
    h('span', { class: 'zarf-kim' }, kim),
    h('span', { class: 'zarf-baslik' }, d.baslik)));
}

// ---------- Liste ----------

function listeGorunumu(acId) {
  const seg = h('div', { class: 'seg mk-seg', role: 'group', 'aria-label': 'Kutu' });
  const yazBtn = h('button', { type: 'button', class: 'btn primary mk-yaz', onclick: () => git({ yaz: '1' }) }, ikon('kalem'), 'Mektup yaz');
  const liste = h('div', { class: 'mk-liste' });
  app.replaceChildren(h('div', { class: 'mk-sayfa' }, h('div', { class: 'mk-ust' }, seg, yazBtn), liste));
  let tikTak = 0;

  function boya() {
    const { gelen, giden } = M.ayir(col.all(), me.clientId);
    const yeniSayi = gelen.filter((x) => M.durum(x, me.clientId) === 'yeni').length;
    const segDugme = (id, ad, n) => h('button', {
      type: 'button', 'aria-pressed': String(kutu === id), dataset: { k: id },
      onclick: () => { kutu = id; boya(); seg.querySelector(`[data-k="${id}"]`)?.focus(); },
    }, ad, n ? h('span', { class: 'mk-rozet', 'aria-label': `${n} yeni` }, String(n)) : null);
    seg.replaceChildren(segDugme('gelen', 'Gelen', yeniSayi), segDugme('giden', 'Giden', 0));

    const docs = kutu === 'gelen' ? gelen : giden;
    yazBtn.hidden = !docs.length; // boş durumda çağrı düğmesi zaten var
    if (!docs.length) {
      liste.replaceChildren(bosDurum());
    } else {
      liste.replaceChildren(h('ul', { class: 'mk-zarflar', 'aria-label': kutu === 'gelen' ? 'Gelen mektuplar' : 'Giden mektuplar' },
        docs.map((doc) => h('li', {}, zarfEl(doc, { onclick: (e) => zarfaDokun(doc, e.currentTarget) })))));
    }
    ayarlaTikTak();
  }

  function bosDurum() {
    const gelenMi = kutu === 'gelen';
    const ornek = { id: 'ornek', author: gelenMi ? 'x' : me.clientId, created_at: new Date().toISOString(), data: { baslik: '', zarf: 'gul', acildi: null } };
    return h('div', { class: 'mk-bos' },
      h('div', { class: 'mk-bos-zarf', 'aria-hidden': 'true' }, zarfEl(ornek, { buyuk: true })),
      h('h2', { class: 'mk-bos-baslik' }, gelenMi ? 'Henüz mektup gelmedi.' : 'Henüz mektup yazmadın.'),
      h('p', { class: 'subtitle' }, gelenMi
        ? 'Belki ilkini sen yazarsın? Bir de zaman kapsülü dene: yıl dönümünüzde açılsın.'
        : 'Ona söylemek istediğin bir şey var mı? Kısa da olsa yeter.'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => git({ yaz: '1' }) }, ikon('kalem'), gelenMi ? 'Mektup yaz' : 'İlk mektubunu yaz'));
  }

  // Kilitli zarfların geri sayımı: saniyede bir yazı güncellenir; kilit açılınca liste yeniden çizilir.
  function ayarlaTikTak() {
    const var_ = !!liste.querySelector('.mk-geri-sayim');
    if (var_ && !tikTak) tikTak = setInterval(tik, 1000);
    if (!var_ && tikTak) { clearInterval(tikTak); tikTak = 0; }
  }
  function tik() {
    if (document.visibilityState === 'hidden') return;
    let acildi = false;
    for (const el of liste.querySelectorAll('.mk-geri-sayim')) {
      const metin = M.kalanYazi({ acilis: el.dataset.acilis });
      if (!metin) acildi = true;
      else if (el.textContent !== metin) el.textContent = metin;
    }
    if (acildi) boya();
  }

  boya();
  if (acId) {
    history.replaceState(history.state, '', rotaUrl({}));
    const doc = col.get(acId);
    if (doc) zarfaDokun(doc, null);
  }
  return { guncelle: boya, kapat: () => clearInterval(tikTak) };
}

function zarfaDokun(doc, el) {
  const dr = M.durum(doc, me.clientId);
  const yn = M.yon(doc, me.clientId);
  if (dr === 'kilitli' && yn === 'gelen') {
    sfx('tick');
    toast(`Bu kapsülün açılışı: ${M.acilisYazi(doc.data.acilis)}. Biraz daha sabır.`);
    if (el && !azHareket()) {
      el.animate([{ rotate: '0deg' }, { rotate: '-2deg' }, { rotate: '2deg' }, { rotate: '-1deg' }, { rotate: '0deg' }], { duration: 420, easing: 'ease-in-out' });
    }
    return;
  }
  if (dr === 'yeni') acmaSahnesi(doc);
  else okumaPenceresi(doc);
}

// ---------- Pencere ----------

function pencere(icerik, etiket) {
  const dlg = h('dialog', { class: 'mk-dlg', 'aria-label': etiket },
    h('button', { type: 'button', class: 'mk-kapat', 'aria-label': 'Kapat', onclick: () => dlg.close() }, ikon('kapat')),
    icerik);
  const onceOdak = document.activeElement;
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (acikDialog === dlg) {
      acikDialog = null;
      if (history.state?.mektupPencere) {
        pencereGeri = true;
        history.back();
      }
    }
    if (onceOdak?.isConnected) onceOdak.focus({ preventScroll: true });
  });
  document.body.append(dlg);
  history.pushState({ ...(history.state || {}), mektupPencere: true }, '');
  acikDialog = dlg;
  dlg.showModal();
  return dlg;
}

function acmaSahnesi(doc) {
  const zarf = zarfEl(doc, { buyuk: true });
  const acBtn = h('button', { type: 'button', class: 'btn primary mk-ac' }, 'Aç');
  const sahne = h('div', { class: 'mk-sahne' },
    h('div', { class: 'mk-sahne-zarf' }, zarf),
    h('p', { class: 'mk-sahne-kim' }, `${kimden(doc)} sana bir mektup var`),
    h('h2', { class: 'mk-sahne-baslik' }, doc.data.baslik),
    acBtn);
  const dlg = pencere(sahne, 'Yeni mektup');
  acBtn.focus();
  acBtn.addEventListener('click', async () => {
    acBtn.disabled = true;
    // Okundu bilgisi hemen yazılır; gönderen "Okundu 💌" görür.
    col.patch(doc.id, { acildi: new Date().toISOString() }).catch((e) => toast(e.message));
    sfx('flip');
    if (!azHareket()) {
      const muhur = zarf.querySelector('.zarf-muhur');
      const kapak = zarf.querySelector('.zarf-kapak');
      const kagit = zarf.querySelector('.zarf-kagit');
      const yazilar = sahne.querySelectorAll('.mk-sahne-kim, .mk-sahne-baslik, .mk-ac');
      yazilar.forEach((y) => y.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }));
      await muhur.animate([{ scale: 1, opacity: 1 }, { scale: 1.18, opacity: 1, offset: 0.35 }, { scale: 0.3, opacity: 0 }],
        { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished;
      await kapak.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }],
        { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).finished;
      kapak.style.zIndex = '0';
      await kagit.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-62%)' }],
        { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' }).finished;
      await sahne.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px) scale(.98)' }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished;
    }
    if (!dlg.open) return;
    const oku = okumaIcerik(col.get(doc.id) || doc);
    sahne.replaceWith(oku);
    if (!azHareket()) oku.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)' });
    oku.querySelector('.mk-oku-baslik')?.focus({ preventScroll: true });
  });
}

function okumaPenceresi(doc) {
  const oku = okumaIcerik(doc);
  pencere(oku, doc.data.baslik || 'Mektup');
  oku.querySelector('.mk-oku-baslik')?.focus({ preventScroll: true });
}

function okumaIcerik(doc) {
  const d = doc.data;
  const yn = M.yon(doc, me.clientId);
  const dr = M.durum(doc, me.clientId);
  const yazanAd = kisiAdi(M.yazan(doc));
  let bilgi = '';
  if (yn === 'giden') {
    if (dr === 'kilitli') bilgi = `Kilitli. Açılış: ${M.acilisYazi(d.acilis)}`;
    else if (d.acildi) bilgi = `Okundu 💌 · ${formatDay(d.acildi)}`;
    else bilgi = 'Henüz açılmadı';
  } else if (d.acilis) {
    bilgi = `Zaman kapsülü · ${M.acilisYazi(d.acilis)}`;
  }
  const benim = M.yazan(doc) === me.clientId;
  const icerik = h('article', { class: 'mk-oku', dataset: { zarf: M.zarfRengi(d.zarf) } },
    h('div', { class: 'mk-kagit' },
      h('p', { class: 'mk-oku-kim' }, `${yn === 'gelen' ? kimden(doc) : kime(doc)} · ${formatDay(doc.created_at)}`),
      h('h2', { class: 'mk-oku-baslik', tabindex: '-1' }, d.baslik),
      h('div', { class: 'mk-oku-metin' }, d.metin || ''),
      yazanAd ? h('p', { class: 'mk-oku-imza' }, yazanAd) : null),
    bilgi ? h('p', { class: 'mk-oku-bilgi' }, dr === 'kilitli' ? ikon('kilit') : null, bilgi) : null,
    benim ? h('div', { class: 'mk-oku-eylem' },
      h('button', { type: 'button', class: 'btn ghost danger', onclick: () => sil(doc) }, ikon('cop'), 'Mektubu sil')) : null);
  return icerik;
}

async function sil(doc) {
  const ok = await confirmDialog('Bu mektup ikiniz için de silinsin mi?', { ok: 'Sil', cancel: 'Vazgeç' });
  if (!ok) return;
  try {
    await col.remove(doc.id);
    acikDialog?.close();
    toast('Mektup silindi');
  } catch (e) {
    toast(e.message);
  }
}

// ---------- Yaz ----------

function yazGorunumu() {
  const taslak = oku(TASLAK) || {};
  let sira = 0;
  const alan = (etiket, girdi, ek = null) => {
    const gid = `mk-f-${++sira}`;
    girdi.id = gid;
    const hata = h('p', { class: 'mk-hata', id: `${gid}-hata`, hidden: true });
    girdi.setAttribute('aria-describedby', hata.id);
    return { el: h('div', { class: 'mk-alan' }, h('label', { for: gid }, etiket), girdi, ek, hata), girdi, hata };
  };

  const baslik = alan('Başlık', h('input', { class: 'input', type: 'text', maxlength: String(M.MAX_BASLIK), placeholder: 'Örn. Sana söyleyemediklerim', autocomplete: 'off', enterkeyhint: 'next' }));
  baslik.girdi.value = taslak.baslik || '';
  const sayac = h('span', { class: 'mk-sayac', 'aria-live': 'polite' });
  const metin = alan('Mektubun', h('textarea', { class: 'input mk-metin', rows: '12', maxlength: String(M.MAX_METIN), placeholder: 'Sevgilim,\n\n' }), sayac);
  metin.girdi.value = taslak.metin || '';
  const sayacBoya = () => {
    const n = [...metin.girdi.value].length;
    sayac.textContent = `${n} / ${M.MAX_METIN}`;
    sayac.dataset.dolu = n > M.MAX_METIN * 0.9 ? '1' : '';
  };
  sayacBoya();

  // Zarf rengi
  let zarf = M.zarfRengi(taslak.zarf);
  const renkler = h('div', { class: 'mk-renkler', role: 'radiogroup', 'aria-label': 'Zarf rengi' },
    M.ZARFLAR.map((z) => {
      const input = h('input', { type: 'radio', name: 'mk-zarf', value: z.id, class: 'sr-only', checked: z.id === zarf });
      input.addEventListener('change', () => { zarf = z.id; taslakKaydet(); });
      return h('label', { class: 'mk-renk', dataset: { zarf: z.id } }, input,
        h('span', { class: 'mk-renk-ornek', 'aria-hidden': 'true' }), h('span', { class: 'mk-renk-ad' }, z.ad));
    }));

  // Zaman kapsülü
  const kapsul = h('input', { type: 'checkbox', class: 'mk-anahtar-girdi', id: 'mk-kapsul' });
  kapsul.checked = !!taslak.kapsul;
  const tarihGirdi = h('input', { class: 'input', type: 'datetime-local', id: 'mk-acilis', 'aria-describedby': 'mk-acilis-hata mk-acilis-onizleme' });
  tarihGirdi.value = taslak.acilis && Date.parse(taslak.acilis) > Date.now() ? M.girdiDegeri(taslak.acilis) : '';
  const onizleme = h('p', { class: 'mk-onizleme', id: 'mk-acilis-onizleme' });
  const acilisHata = h('p', { class: 'mk-hata', id: 'mk-acilis-hata', hidden: true });
  const hazirlar = h('div', { class: 'mk-hazir', role: 'group', 'aria-label': 'Hazır seçenekler' });
  const kapsulAyrinti = h('div', { class: 'mk-kapsul-ayrinti' },
    hazirlar,
    h('div', { class: 'mk-alan' }, h('label', { for: 'mk-acilis' }, 'Açılış tarihi ve saati'), tarihGirdi, onizleme, acilisHata));

  function boyaKapsul() {
    kapsulAyrinti.hidden = !kapsul.checked;
    const secili = M.girdidenIso(tarihGirdi.value);
    hazirlar.replaceChildren(...M.hazirAcilislar(Date.now(), profil?.cift()?.baslangic).map((x) => h('button', {
      type: 'button', class: 'mk-hazir-cip', 'aria-pressed': String(secili === x.iso),
      onclick: () => { tarihGirdi.value = M.girdiDegeri(x.iso); boyaKapsul(); taslakKaydet(); },
    }, x.ad)));
    onizleme.textContent = secili ? `Kilitli kalacak. Açılış: ${M.acilisYazi(secili)}` : 'Bir tarih seç ya da hazır seçeneklerden birine dokun.';
  }
  kapsul.addEventListener('change', () => {
    if (kapsul.checked && !tarihGirdi.value) tarihGirdi.value = M.girdiDegeri(M.hazirAcilislar(Date.now())[0].iso);
    boyaKapsul();
    taslakKaydet();
  });
  tarihGirdi.addEventListener('input', boyaKapsul);
  tarihGirdi.min = M.girdiDegeri(new Date().toISOString());

  const genelHata = h('p', { class: 'mk-hata', role: 'alert', hidden: true });
  const gonderBtn = h('button', { type: 'submit', class: 'btn primary' }, ikon('gonder'), 'Gönder');
  const formBaslik = h('h2', { class: 'mk-form-baslik', tabindex: '-1' }, `${kimeYeni()} bir mektup`);
  const form = h('form', { class: 'mk-form', novalidate: true },
    formBaslik,
    baslik.el,
    metin.el,
    h('fieldset', { class: 'mk-kume' }, h('legend', {}, 'Zarf rengi'), renkler),
    h('div', { class: 'mk-kapsul' },
      h('label', { class: 'mk-anahtar', for: 'mk-kapsul' },
        kapsul,
        h('span', { class: 'mk-anahtar-yazi' },
          h('span', { class: 'mk-anahtar-baslik' }, ikon('saat'), 'Zaman kapsülü'),
          h('span', { class: 'mk-anahtar-alt' }, 'Seçtiğin zamana kadar kilitli kalır.')),
        h('span', { class: 'mk-anahtar-dugme', 'aria-hidden': 'true' })),
      kapsulAyrinti),
    genelHata,
    h('div', { class: 'mk-form-eylem' },
      h('button', { type: 'button', class: 'btn ghost', onclick: vazgec }, 'Vazgeç'),
      gonderBtn));

  let taslakZaman = 0;
  function taslakKaydet() {
    clearTimeout(taslakZaman);
    taslakZaman = setTimeout(() => {
      const t = { baslik: baslik.girdi.value, metin: metin.girdi.value, zarf, kapsul: kapsul.checked, acilis: M.girdidenIso(tarihGirdi.value) };
      yaz(TASLAK, t.baslik || t.metin ? t : null);
    }, 300);
  }
  form.addEventListener('input', (e) => { if (e.target === metin.girdi) sayacBoya(); taslakKaydet(); });
  form.addEventListener('submit', gonder);

  app.replaceChildren(h('div', { class: 'mk-sayfa dar' }, form));
  boyaKapsul();
  formBaslik.focus({ preventScroll: true });

  async function gonder(e) {
    e.preventDefault();
    for (const a of [baslik, metin]) { a.hata.hidden = true; a.girdi.removeAttribute('aria-invalid'); }
    acilisHata.hidden = true;
    genelHata.hidden = true;
    const acilis = kapsul.checked ? (M.girdidenIso(tarihGirdi.value) || 'bozuk') : null;
    const girdi = { baslik: baslik.girdi.value, metin: metin.girdi.value, acilis };
    const hata = M.mektupDogrula(girdi);
    if (hata) {
      const a = /başlık/i.test(hata) ? baslik : /mektup/i.test(hata) ? metin : null;
      if (a) {
        a.hata.textContent = hata;
        a.hata.hidden = false;
        a.girdi.setAttribute('aria-invalid', 'true');
        a.girdi.focus();
      } else if (/açılış/i.test(hata)) {
        acilisHata.textContent = hata;
        acilisHata.hidden = false;
        tarihGirdi.focus();
      } else {
        genelHata.textContent = hata;
        genelHata.hidden = false;
      }
      return;
    }
    const kimeId = profil?.partner()?.clientId || room.partner?.()?.clientId || knownPartner(roomId)?.clientId || null;
    const data = M.mektupVerisi({ ...girdi, zarf }, kimeId, me.clientId);
    gonderBtn.disabled = true;
    try {
      await col.put(data);
      if (!partnerGoruyor(room.partner(), 'mektup')) { // Mektuplar'da ve sekmesi önde: zaten görüyor
        bildir(roomId, { tur: 'mektup', baslik: 'Sana bir mektup var 💌', metin: M.bildirimMetni(data), url: 'sayfalar/mektup/', gizli: { metin: 'Yeni mektup' } }).catch(() => {});
      }
      clearTimeout(taslakZaman);
      yaz(TASLAK, null);
      sfx('pop');
      toast(data.acilis ? `Kapsül mühürlendi. Açılış: ${M.acilisYazi(data.acilis)}` : 'Mektubun yola çıktı 💌');
      kutu = 'giden';
      geriDon();
    } catch (err) {
      genelHata.textContent = err.message;
      genelHata.hidden = false;
      gonderBtn.disabled = false;
    }
  }

  function vazgec() {
    // Taslak saklı kalır; bir dahaki açılışta geri gelir.
    clearTimeout(taslakZaman);
    if (baslik.girdi.value.trim() || metin.girdi.value.trim()) {
      yaz(TASLAK, { baslik: baslik.girdi.value, metin: metin.girdi.value, zarf, kapsul: kapsul.checked, acilis: M.girdidenIso(tarihGirdi.value) });
      toast('Taslağın saklandı');
    }
    geriDon();
  }

  return {
    guncelle() { formBaslik.textContent = `${kimeYeni()} bir mektup`; },
    kapat() { clearTimeout(taslakZaman); },
  };
}

ciz();
