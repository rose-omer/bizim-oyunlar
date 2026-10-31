// Aşk Kuponları: birbirinize küçük sözler. Sekmeler: Bana verilenler · Benim verdiklerim.
// Akış: veren kupon verir → alan "Kullan" der (verene bildirim) → veren "Yerine getirdim" der.
// Saf mantık mantik.js'te (tests/kupon-mantik). Kupon metinleri yalnız textContent ile basılır (h()).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { toDay, addDays } from '../../js/core/gunler.js';
import { h, icon, toast, confirmDialog, formatDay, knownPartner, locative, geriyleKapat } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ikon } from '../listeler/ikonlar.js';
import { ek } from '../mektup/mantik.js';
import * as K from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'kupon', title: 'Aşk Kuponları', tab: 'daha' });
const myId = me.clientId;
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'kp' }, h('p', { class: 'kp-yukleniyor muted', role: 'status' }, 'Kuponlar açılıyor…')));

const [col, profil] = await Promise.all([
  openCollection(room, 'kupon'),
  openProfil(room).catch((e) => { console.warn('[kupon] profil açılamadı', e); return null; }),
]);

const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const bugun = () => toDay();
const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || '';
const partnerId = () => profil?.partner()?.clientId || room.partner?.()?.clientId || knownPartner(roomId)?.clientId || null;
const adOf = (id) => (id === myId ? benAdi() : profil?.kisiler?.get(id)?.data?.ad || partnerAdi());

const durum = {
  sekme: new URLSearchParams(location.search).get('sekme') === 'verdiklerim' ? 'verdiklerim' : 'bana',
  damga: null, // az önce damgalanan kupon (damga animasyonu bir kez)
  yeni: null,  // az önce verilen kupon (giriş animasyonu bir kez)
};

function haberVer(olay, data, url = 'sayfalar/kupon/') {
  if (partnerGoruyor(room.partner?.(), 'kupon')) return; // Kuponlar'da ve sekmesi önde: zaten görüyor
  bildir(roomId, { tur: 'mektup', ...K.bildirimMetni(olay, benAdi(), data), url })
    .catch((err) => console.warn('[kupon] bildirim gönderilemedi', err));
}

// ---------- İskelet ----------
const segDugme = (k) => h('button', { type: 'button', dataset: { k }, onclick: () => sekmeSec(k) });
const segBana = segDugme('bana');
const segVer = segDugme('verdiklerim');
const seg = h('div', { class: 'seg kp-seg', role: 'group', 'aria-label': 'Hangi kuponlar' }, segBana, segVer);
const verBtn = h('button', { type: 'button', class: 'btn primary wide kp-ver', onclick: () => verAc() }, ikon('plus'), 'Kupon ver');
const partnerYok = h('p', { class: 'kp-bilgi', hidden: true }, 'Sevgilin uygulamayı bir kez açınca ona kupon verebilirsin.');
const govde = h('div', { class: 'kp-govde' });
app.replaceChildren(h('div', { class: 'kp' }, seg, verBtn, partnerYok, govde));

function sekmeSec(k) {
  if (durum.sekme === k) return;
  durum.sekme = k;
  const u = new URL(location.href);
  if (k === 'bana') u.searchParams.delete('sekme'); else u.searchParams.set('sekme', k);
  history.replaceState(history.state, '', u.pathname + u.search);
  ciz();
}

function segDoldur(btn, ad, sayi, rozetEtiketi) {
  btn.setAttribute('aria-pressed', String(durum.sekme === btn.dataset.k));
  btn.replaceChildren(h('span', {}, ad));
  if (sayi) btn.append(h('span', { class: 'kp-rozet', 'aria-label': rozetEtiketi }, String(sayi)));
}

// ---------- Kupon kartı ----------
const DAMGA = { kullanildi: 'KULLANILDI', tamam: 'SÖZ\nTUTULDU', suresi: 'SÜRESİ\nDOLDU' }; // satır sonu: koçana sığsın

/**
 * Bilet görünümü. data = kupon verisi. gor = 'hazir'|'suresi'|'kullanildi'|'tamam'.
 * Önizleme ve boş durum örneğinde de kullanılır (id yok, eylem yok).
 */
function biletEl(data, { id = '', gor = 'hazir', meta = '', not = '', eylem = null, damgaVur = false } = {}) {
  const sonYazi = gor === 'hazir' && data.son ? K.sonTarihYazi(data.son, bugun()) : '';
  const yakin = sonYazi && /bugün|yarın|gün kaldı/i.test(sonYazi);
  const damga = DAMGA[gor];
  return h('article', {
    class: 'kp-bilet',
    dataset: { renk: String(K.renkSirasi(id || data.baslik)), durum: gor },
  },
  h('div', { class: 'kp-kocan', 'aria-hidden': 'true' },
    h('span', { class: 'kp-emoji' }, data.emoji || '💝'),
    h('span', { class: 'kp-kocan-yazi' }, 'KUPON'),
    damga ? h('span', { class: `kp-damga${damgaVur && !azHareket() ? ' vur' : ''}` }, damga) : null),
  h('div', { class: 'kp-icerik' },
    h('h3', { class: 'kp-baslik' }, data.baslik || 'Kuponun adı'),
    data.aciklama ? h('p', { class: 'kp-aciklama' }, data.aciklama) : null,
    meta ? h('p', { class: 'kp-meta' }, meta) : null,
    sonYazi ? h('p', { class: `kp-son${yakin ? ' yakin' : ''}` }, ikon('calendar'), sonYazi) : null,
    not ? h('p', { class: 'kp-not' }, not) : null,
    eylem ? h('div', { class: 'kp-eylem' }, eylem) : null),
  damga ? h('span', { class: 'sr-only' }, ` (${damga.replace(/\s+/g, ' ').toLocaleLowerCase('tr')})`) : null);
}

function kuponEl(doc) {
  const d = doc.data;
  const gor = K.gorunum(d, bugun());
  const bana = K.yon(doc, myId) === 'bana';
  const kim = bana ? ek(adOf(d.veren), 'den') : ek(adOf(d.alan), 'e');
  let ne = formatDay(d.verildi || doc.created_at);
  if (gor === 'kullanildi' && d.kullanildi) ne = `${formatDay(d.kullanildi)} kullanıldı`;
  else if (gor === 'tamam' && d.tamam) ne = `${formatDay(d.tamam)} sözü tutuldu`;
  const meta = `${kim} · ${ne}`;

  let not = '';
  let eylem = null;
  if (bana && gor === 'hazir') {
    eylem = h('button', {
      type: 'button', class: 'btn primary small kp-kullan', dataset: { odak: `kullan:${doc.id}` },
      'aria-label': `${d.baslik} kuponunu kullan`, onclick: () => kullan(doc),
    }, 'Kullan');
  } else if (bana && gor === 'kullanildi') {
    not = `${adOf(d.veren)} sözünü tutunca burada görürsün.`;
  } else if (!bana && gor === 'kullanildi') {
    eylem = h('button', {
      type: 'button', class: 'btn primary small', dataset: { odak: `tamam:${doc.id}` },
      'aria-label': `${d.baslik}: yerine getirdim`, onclick: () => tamamla(doc),
    }, ikon('check'), 'Yerine getirdim');
  }
  if (!bana && gor !== 'kullanildi') {
    const sil = h('button', {
      type: 'button', class: 'icon-btn kp-sil', dataset: { odak: `sil:${doc.id}` },
      'aria-label': `${d.baslik} kuponunu sil`, onclick: () => silKupon(doc),
    }, ikon('trash'));
    eylem = eylem ? [eylem, sil] : sil;
  }
  const li = h('li', { class: 'kp-kupon', dataset: { id: doc.id } },
    biletEl(d, { id: doc.id, gor, meta, not, eylem, damgaVur: durum.damga === doc.id }));
  if (durum.yeni === doc.id && !azHareket()) li.classList.add('yeni');
  return li;
}

// ---------- Çizim ----------
const BOLUM_NOTU = {
  'verdiklerim:kullanildi': () => `${partnerAdi()} kuponunu kullandı. Sözünü tutunca “Yerine getirdim”e dokun.`,
};

function bolumEl(b) {
  const hid = `kp-b-${b.id}`;
  const notu = BOLUM_NOTU[`${durum.sekme}:${b.id}`]?.();
  return h('section', { class: 'kp-bolum', dataset: { bolum: b.id }, 'aria-labelledby': hid },
    h('h2', { class: 'kp-bolum-baslik', id: hid }, b.baslik, h('span', { class: 'kp-sayi' }, String(b.docs.length))),
    notu ? h('p', { class: 'kp-bolum-not' }, notu) : null,
    h('ul', { class: 'kp-liste' }, b.docs.map(kuponEl)));
}

function bosDurum() {
  const bana = durum.sekme === 'bana';
  const ornek = bana
    ? { baslik: 'Yatağa kahvaltı', emoji: '🥐', aciklama: 'Gözünü açtığında tepsi hazır.' }
    : { baslik: 'Film seçme hakkı', emoji: '🎬', aciklama: 'Bu akşamın filmini sen seçiyorsun.' };
  return h('div', { class: 'kp-bos' },
    h('div', { class: 'kp-bos-bilet', 'aria-hidden': 'true' }, biletEl(ornek, { id: bana ? 'ornek-a' : 'ornek-b' })),
    h('h2', { class: 'kp-bos-baslik' }, bana ? 'Henüz kuponun yok' : 'Henüz kupon vermedin'),
    h('p', { class: 'kp-bos-metin' }, bana
      ? `${partnerAdi()} sana bir kupon verince burada duracak. İstersen ilk sözü sen ver.`
      : 'Küçük bir söz, büyük bir gülümseme. Hazır kuponlardan birini seç ya da kendin yaz.'),
    h('button', { type: 'button', class: 'btn primary', disabled: !partnerId(), onclick: () => verAc() }, ikon('plus'), 'Kupon ver'));
}

// Görünen her şeyin imzası: değişmediyse yeniden çizilmez (sunucu onayı ikinci kez 'change' getirir;
// damga animasyonu yarıda kesilmesin, odak kaybolmasın).
let sonImza = '';
function ciz() {
  const docs = col.all();
  const b = bugun();
  const imza = JSON.stringify([durum.sekme, b, partnerId(), partnerAdi(), benAdi(), docs.map((d) => [d.id, d.data])]);
  if (imza === sonImza) return;
  sonImza = imza;
  const r = K.rozetler(docs, myId, b);
  segDoldur(segBana, 'Bana verilenler', r.bana, `${r.bana} kullanılabilir kupon`);
  segDoldur(segVer, 'Benim verdiklerim', r.verdiklerim, `${r.verdiklerim} söz bekliyor`);
  const pId = partnerId();
  partnerYok.hidden = !!pId;
  verBtn.disabled = !pId;

  const bol = K.bolumler(docs, myId, durum.sekme, b);
  verBtn.hidden = !bol.length; // boş durumda kendi düğmesi var
  const odak = document.activeElement?.dataset?.odak || null;
  govde.replaceChildren(...(bol.length ? bol.map(bolumEl) : [bosDurum()]));
  if (odak) govde.querySelector(`[data-odak="${CSS.escape(odak)}"]`)?.focus({ preventScroll: true });
  durum.damga = null;
  durum.yeni = null;
}

// ---------- Eylemler ----------
async function kullan(doc) {
  const d = doc.data;
  const veren = adOf(d.veren);
  const ok = await confirmDialog(`“${d.baslik}” kuponunu şimdi kullanmak istiyor musun? ${ek(veren, 'e')} haber gidecek.`, { ok: 'Kullan', cancel: 'Şimdi değil' });
  if (!ok) return;
  const guncel = col.get(doc.id);
  if (!guncel || !K.kullanabilir(guncel, myId, bugun())) {
    toast('Bu kupon artık kullanılamıyor.');
    return;
  }
  durum.damga = doc.id;
  try {
    await col.patch(doc.id, K.kullanYamasi());
  } catch (err) {
    durum.damga = null;
    toast(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
    return;
  }
  sfx('pop');
  toast(`Kupon kullanıldı 🎟️ Şimdi sıra ${locative(veren)}.`);
  haberVer('kullanildi', d, 'sayfalar/kupon/?sekme=verdiklerim');
}

async function tamamla(doc) {
  const d = doc.data;
  durum.damga = doc.id;
  try {
    await col.patch(doc.id, K.tamamYamasi());
  } catch (err) {
    durum.damga = null;
    toast(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
    return;
  }
  sfx('match');
  toast('Sözünü tuttun 💛', {
    action: { label: 'Geri al', onClick: () => col.patch(doc.id, K.geriAlYamasi()).catch((e) => toast(e.message)) },
  });
  haberVer('tamam', d);
}

async function silKupon(doc) {
  const d = { ...doc.data };
  const ok = await confirmDialog(`“${d.baslik}” kuponu ikiniz için de silinsin mi?`, { ok: 'Sil', cancel: 'Vazgeç' });
  if (!ok) return;
  try {
    await col.remove(doc.id);
  } catch (err) {
    toast(err?.message || 'Silinemedi.');
    return;
  }
  sfx('tap');
  toast('Kupon silindi', { action: { label: 'Geri al', onClick: () => col.put(d, doc.id).catch((e) => toast(e.message)) } });
}

// ---------- Kupon ver (pencere) ----------
function verAc() {
  const pId = partnerId();
  if (!pId) return;
  const pAd = partnerAdi();
  const form = { baslik: '', emoji: K.EMOJILER[0], aciklama: '', sonVar: false, son: addDays(bugun(), 30) };
  let adim = 'sec';
  let gonderiliyor = false;

  const baslikEl = h('h2', { class: 'kp-dlg-baslik', id: 'kp-dlg-baslik', tabindex: '-1' });
  const geriBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Başka kupon seç', onclick: () => adimGit('sec') }, icon('back'));
  const kapatBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onclick: () => dlg.close() }, icon('close'));
  const icerik = h('div', { class: 'kp-dlg-icerik' });
  const dlg = h('dialog', { class: 'kp-dlg', 'aria-labelledby': 'kp-dlg-baslik' },
    h('header', { class: 'kp-dlg-ust' }, geriBtn, baslikEl, kapatBtn), icerik);
  const onceOdak = document.activeElement;
  const birak = geriyleKapat(() => dlg.close());
  dlg.addEventListener('close', () => {
    birak();
    dlg.remove();
    if (onceOdak?.isConnected) onceOdak.focus({ preventScroll: true });
    else verBtn.focus({ preventScroll: true });
  });

  function adimGit(a) {
    adim = a;
    geriBtn.hidden = a === 'sec';
    baslikEl.textContent = a === 'sec' ? 'Kupon ver' : 'Kuponunu hazırla';
    icerik.replaceChildren(a === 'sec' ? secimEl() : yazEl());
    icerik.scrollTop = 0;
    dlg.scrollTop = 0;
    if (a === 'sec') baslikEl.focus({ preventScroll: true });
  }

  function secimEl() {
    const sablonDugme = (s) => h('li', {}, h('button', {
      type: 'button', class: 'kp-sablon', onclick: () => {
        Object.assign(form, { baslik: s.baslik, emoji: s.emoji, aciklama: s.aciklama });
        adimGit('yaz');
      },
    }, h('span', { class: 'kp-sablon-emoji', 'aria-hidden': 'true' }, s.emoji), h('span', { class: 'kp-sablon-ad' }, s.baslik)));
    return h('div', { class: 'kp-secim' },
      h('p', { class: 'kp-dlg-alt' }, `${ek(pAd, 'e')} küçük bir söz ver. Zamanı gelince kullanır.`),
      h('button', {
        type: 'button', class: 'kp-ozel', onclick: () => {
          Object.assign(form, { baslik: '', emoji: K.EMOJILER[0], aciklama: '' });
          adimGit('yaz');
        },
      }, h('span', { class: 'kp-ozel-ikon', 'aria-hidden': 'true' }, ikon('edit')),
      h('span', { class: 'kp-ozel-yazi' }, h('strong', {}, 'Kendin yaz'), h('span', {}, 'Aklındaki sözü kupona dök.'))),
      h('h3', { class: 'kp-secim-baslik', id: 'kp-hazir' }, 'Hazır kuponlar'),
      h('ul', { class: 'kp-sablonlar', 'aria-labelledby': 'kp-hazir' }, K.SABLONLAR.map(sablonDugme)));
  }

  function yazEl() {
    const onizleme = h('div', { class: 'kp-onizleme', 'aria-hidden': 'true' });
    const baslikGirdi = h('input', {
      id: 'kp-baslik', class: 'input', type: 'text', maxlength: String(K.BASLIK_MAX), autocomplete: 'off',
      enterkeyhint: 'next', placeholder: 'ör. Bir günlük prenseslik', 'aria-describedby': 'kp-hata',
    });
    baslikGirdi.value = form.baslik;
    const aciklamaGirdi = h('textarea', {
      id: 'kp-aciklama', class: 'input kp-aciklama-girdi', rows: '3', maxlength: String(K.ACIKLAMA_MAX),
      placeholder: 'Ne zaman, nasıl, ne kadar? İstersen kuralını yaz.',
    });
    aciklamaGirdi.value = form.aciklama;

    const emojiGrup = h('div', { class: 'kp-emojiler', role: 'radiogroup', 'aria-labelledby': 'kp-emoji-etiket' });
    function emojiCiz() {
      const secenek = K.emojiSecenekleri(form.emoji);
      emojiGrup.replaceChildren(...secenek.map((e) => h('button', {
        type: 'button', role: 'radio', class: 'kp-emoji-sec', 'aria-checked': String(e === form.emoji),
        'aria-label': e, tabindex: e === form.emoji ? '0' : '-1',
        onclick: () => { form.emoji = e; emojiCiz(); onizle(); emojiGrup.querySelector('[aria-checked="true"]')?.focus(); },
      }, e)));
    }
    emojiGrup.addEventListener('keydown', (e) => {
      const l = K.emojiSecenekleri(form.emoji);
      let i = l.indexOf(form.emoji);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (i + 1) % l.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = (i - 1 + l.length) % l.length;
      else return;
      e.preventDefault();
      form.emoji = l[i];
      emojiCiz();
      onizle();
      emojiGrup.querySelector('[aria-checked="true"]')?.focus();
    });

    const sonGirdi = h('input', { id: 'kp-son', class: 'input kp-son-girdi', type: 'date', min: bugun(), 'aria-describedby': 'kp-son-ipucu' });
    sonGirdi.value = form.son;
    const sonAlan = h('div', { class: 'kp-son-alan' },
      h('label', { class: 'sr-only', for: 'kp-son' }, 'Son gün'), sonGirdi,
      h('p', { class: 'kp-ipucu', id: 'kp-son-ipucu' }, 'Bu günden sonra kullanılamaz.'));
    const sonSeg = h('div', { class: 'seg kp-son-seg', role: 'group', 'aria-labelledby': 'kp-son-etiket' });
    function sonCiz() {
      sonSeg.replaceChildren(
        h('button', { type: 'button', 'aria-pressed': String(!form.sonVar), onclick: () => { form.sonVar = false; sonCiz(); onizle(); } }, 'Süresiz'),
        h('button', { type: 'button', 'aria-pressed': String(form.sonVar), onclick: () => { form.sonVar = true; sonCiz(); onizle(); } }, 'Son günü olsun'));
      sonAlan.hidden = !form.sonVar;
    }

    const hata = h('p', { class: 'kp-hata', id: 'kp-hata', role: 'alert', hidden: true });
    const gonderBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Kuponu ver');
    const formEl = h('form', { class: 'kp-form', novalidate: true },
      onizleme,
      h('div', { class: 'kp-alan' }, h('label', { for: 'kp-baslik' }, 'Kuponun adı'), baslikGirdi),
      h('div', { class: 'kp-alan' }, h('span', { class: 'kp-etiket', id: 'kp-emoji-etiket' }, 'Emoji'), emojiGrup),
      h('div', { class: 'kp-alan' }, h('label', { for: 'kp-aciklama' }, 'Açıklama ', h('span', { class: 'kp-istege' }, '(isteğe bağlı)')), aciklamaGirdi),
      h('div', { class: 'kp-alan' }, h('span', { class: 'kp-etiket', id: 'kp-son-etiket' }, 'Son gün'), sonSeg, sonAlan),
      hata,
      h('div', { class: 'kp-dlg-alt-cubuk' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Vazgeç'), gonderBtn));

    function oku() {
      form.baslik = baslikGirdi.value;
      form.aciklama = aciklamaGirdi.value;
      form.son = sonGirdi.value;
    }
    function onizle() {
      oku();
      const data = { baslik: form.baslik.trim(), emoji: form.emoji, aciklama: form.aciklama.trim(), son: form.sonVar ? form.son : '' };
      onizleme.replaceChildren(biletEl(data, { id: 'onizleme', meta: `${ek(pAd, 'e')} · bugün` }));
    }
    formEl.addEventListener('input', () => {
      if (!hata.hidden) {
        hata.hidden = true;
        for (const g of [baslikGirdi, aciklamaGirdi, sonGirdi]) g.removeAttribute('aria-invalid');
      }
      onizle();
    });
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (gonderiliyor) return;
      oku();
      const girdi = { baslik: form.baslik, emoji: form.emoji, aciklama: form.aciklama, son: form.sonVar ? form.son : '' };
      const h1 = K.kuponDogrula(girdi, bugun());
      if (h1) {
        hata.textContent = h1;
        hata.hidden = false;
        const alan = /^Son gün/.test(h1) ? sonGirdi : /^Açıklama/.test(h1) ? aciklamaGirdi : /emoji/i.test(h1) ? null : baslikGirdi;
        if (alan) { alan.setAttribute('aria-invalid', 'true'); alan.focus(); }
        return;
      }
      const data = K.kuponVerisi(girdi, { veren: myId, alan: pId });
      gonderiliyor = true;
      gonderBtn.disabled = true;
      let id;
      try {
        id = await col.put(data);
      } catch (err) {
        hata.textContent = err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.';
        hata.hidden = false;
        gonderiliyor = false;
        gonderBtn.disabled = false;
        return;
      }
      sfx('pop');
      durum.sekme = 'verdiklerim';
      durum.yeni = id;
      dlg.close();
      ciz();
      toast(`Kupon ${ek(pAd, 'e')} gitti 🎟️`);
      haberVer('verildi', data);
    });

    emojiCiz();
    sonCiz();
    onizle();
    requestAnimationFrame(() => {
      if (!form.baslik) baslikGirdi.focus({ preventScroll: true });
      else baslikEl.focus({ preventScroll: true });
    });
    return formEl;
  }

  document.body.append(dlg);
  dlg.showModal();
  adimGit(adim);
}

// ---------- Canlı ----------
let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Kayıt bekletilip gönderilecek.');
});
col.on('change', ciz);
profil?.on('change', ciz);
room.on('presence', () => ciz());
// Gece yarısı geçince süreler değişir: sekme öne gelince yeniden çiz.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciz(); });

ciz();
