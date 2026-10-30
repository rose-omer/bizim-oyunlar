// Listelerimiz: beş ortak liste, iki cihazda canlı. Saf mantık liste.js'te (tests/liste-*).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { pageUrl, readStore, writeStore } from '../../js/core/identity.js';
import { h, toast, formatDay } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { bildir } from '../../js/core/bildirim.js';
import { toDay } from '../../js/core/gunler.js';
import * as L from './liste.js';
import { ikon } from './ikonlar.js';

const { room, roomId, me } = await bootPage({ ns: 'listeler', title: 'Listelerimiz', tab: 'daha' });
const myId = me.clientId;
const [col, profil] = await Promise.all([openCollection(room, 'liste'), openProfil(room)]);

const K_SEKME = 'bizim.listeler.sekme';
const K_GIZLE = 'bizim.listeler.gizle';
const K_BILDIRIM = `bizim.listeler.bildirim.${roomId}.${myId}`;
const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const durum = {
  liste: L.listeById(new URLSearchParams(location.search).get('liste'))?.id
    || L.listeById(readStore('local', K_SEKME))?.id || 'yapilacak',
  grup: 'ben',          // hediye: 'ben' = benim istek listem, 'o' = onun istek listesi
  gizle: readStore('local', K_GIZLE) === '1',
  menu: null,           // eylemleri açık öğe
  duzen: null,          // düzenlenen öğe
  bekleyen: new Set(),  // işaret animasyonu süren öğeler
};
let duzenLi = null;
// Giriş animasyonu yalnız yeni gelen öğelere (canlı yeniden çizimde titreme olmasın).
let gorulen = new Set();
let ilkCizim = true;

// ---------- Yardımcılar ----------
const partnerAdi = () => profil.partner()?.ad || 'Sevgilin';
const adOf = (id) => profil.kisiler?.get(id)?.data?.ad || partnerAdi();
const kim = (id) => (id === myId ? { ben: true } : { ad: adOf(id) });
const aniUrl = (metin, iso) => pageUrl('sayfalar/anilar/', L.aniParametreleri(metin, toDay(new Date(iso))));
const yaz = (data, id) => col.put(data, id).catch((e) => toast(e.message));
/** Yalnız verilen alanları yazar (alan düzeyinde birleşir); data'da olmayan alan silinir. */
const yamala = (id, data, alanlar) => col.patch(id, L.yama(data, alanlar)).catch((e) => toast(e.message));

// ---------- İskelet ----------
const app = document.getElementById('app');

const sekmeBtn = new Map();
const sekmeler = h('div', { class: 'ls-sekmeler', role: 'tablist', 'aria-label': 'Listeler' },
  L.LISTELER.map((l) => {
    const b = h('button', {
      type: 'button', class: 'ls-sekme', role: 'tab', id: `sekme-${l.id}`, 'aria-controls': 'ls-panel',
      onclick: () => sec(l.id),
    },
    h('span', { class: 'ls-sekme-emoji', 'aria-hidden': 'true' }, l.emoji),
    h('span', { class: 'ls-sekme-ad' }, l.kisa),
    h('span', { class: 'ls-sekme-sayac', 'aria-hidden': 'true' }));
    sekmeBtn.set(l.id, b);
    return b;
  }));
sekmeler.addEventListener('keydown', (e) => {
  const ids = L.LISTELER.map((l) => l.id);
  let i = ids.indexOf(durum.liste);
  if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
  else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = ids.length - 1;
  else return;
  e.preventDefault();
  sec(ids[i]);
  sekmeBtn.get(ids[i]).focus();
});

const baslik = h('h2', { class: 'ls-baslik' });
const ozet = h('p', { class: 'ls-ozet' });
const grupBen = h('button', { type: 'button', onclick: () => grupSec('ben') }, 'Benim istek listem');
const grupO = h('button', { type: 'button', onclick: () => grupSec('o') }, 'Onun istek listesi');
const grupSeg = h('div', { class: 'seg ls-grup', role: 'group', 'aria-label': 'Kimin istek listesi' }, grupBen, grupO);
const bilgi = h('p', { class: 'ls-bilgi' });

const girdi = h('input', {
  class: 'input', type: 'text', name: 'metin', maxlength: L.MAX_METIN, autocomplete: 'off', enterkeyhint: 'done',
});
const notGirdi = h('textarea', {
  class: 'input ls-not-girdi', name: 'not', rows: 2, maxlength: L.MAX_NOT,
  placeholder: 'Not (isteğe bağlı)', 'aria-label': 'Not', hidden: true,
});
const notBtn = h('button', { type: 'button', class: 'btn ghost small ls-not-ac', 'aria-expanded': 'false', onclick: notAcKapa },
  ikon('plus'), 'Not ekle');
const form = h('form', { class: 'ls-ekle', onsubmit: ekle },
  h('div', { class: 'ls-ekle-satir' }, girdi,
    h('button', { type: 'submit', class: 'btn primary ls-ekle-btn' }, ikon('plus'), h('span', {}, 'Ekle'))),
  notGirdi, notBtn);

const gizleGirdi = h('input', { type: 'checkbox', role: 'switch', class: 'anahtar-girdi' });
gizleGirdi.checked = durum.gizle;
gizleGirdi.addEventListener('change', () => {
  durum.gizle = gizleGirdi.checked;
  writeStore('local', K_GIZLE, durum.gizle ? '1' : null);
  ciz();
});
const gizliSayi = h('span', { class: 'ls-gizli-sayi', 'aria-live': 'polite' });
const arac = h('div', { class: 'ls-arac' },
  h('label', { class: 'anahtar' }, gizleGirdi, h('span', { class: 'anahtar-ray', 'aria-hidden': 'true' }), h('span', {}, 'Yapılanları gizle')),
  gizliSayi);

const liste = h('ul', { class: 'ls-ogeler' });
const bos = h('div', { class: 'ls-bos', hidden: true });
const panel = h('section', { class: 'ls-panel', id: 'ls-panel', role: 'tabpanel' },
  h('header', { class: 'ls-bas' }, baslik, ozet), grupSeg, bilgi, form, arac, liste, bos);

app.replaceChildren(h('div', { class: 'ls' }, sekmeler, panel));

// ---------- Çizim ----------
function ciz() {
  const docs = col.all();
  const l = L.listeById(durum.liste);
  const hediye = l.id === 'hediye';
  const onunki = hediye && durum.grup === 'o';
  const grup = hediye ? durum.grup : null;

  const say = L.tumSayaclar(docs);
  for (const x of L.LISTELER) {
    const b = sekmeBtn.get(x.id);
    const s = say[x.id];
    const on = x.id === l.id;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    b.querySelector('.ls-sekme-sayac').textContent = `${s.yapilan}/${s.toplam}`;
    b.setAttribute('aria-label', `${x.ad}: ${s.toplam} öğeden ${s.yapilan} tanesi tamam`);
  }
  panel.setAttribute('aria-labelledby', `sekme-${l.id}`);

  baslik.textContent = l.ad;
  const s = L.sayac(docs, l.id, { me: myId, grup });
  ozet.textContent = s.toplam ? `${s.yapilan} / ${s.toplam} tamam` : '';

  grupSeg.hidden = !hediye;
  grupBen.setAttribute('aria-pressed', String(durum.grup === 'ben'));
  grupO.setAttribute('aria-pressed', String(durum.grup === 'o'));
  bilgi.hidden = !hediye;
  bilgi.textContent = onunki
    ? `Sevgilinin dilekleri. “Ben alacağım 🤫” dersen ${partnerAdi()} bunu görmez.`
    : `${partnerAdi()} bu listeyi görür; kimin neyi alacağı sürpriz kalır.`;
  form.hidden = onunki;
  girdi.placeholder = l.ipucu;
  girdi.setAttribute('aria-label', `${l.ad} listesine ekle`);

  const hepsi = L.ogeler(docs, { liste: l.id, me: myId, grup: grup || 'ben' });
  const gorunen = durum.gizle ? hepsi.filter((d) => !d.data.yapildi) : hepsi;
  const gizlenen = hepsi.length - gorunen.length;
  gizliSayi.textContent = gizlenen && durum.gizle ? `${gizlenen} tamamlanan gizli` : '';
  arac.hidden = !hepsi.length;

  // Yeniden çizimde odağı koru (canlı güncelleme klavyeyi bölmesin).
  const odak = document.activeElement?.dataset?.odak || null;
  liste.replaceChildren(...gorunen.map(ogeEl));
  if (!ilkCizim) for (const li of liste.children) if (!gorulen.has(li.dataset.id)) li.classList.add('yeni');
  gorulen = new Set(hepsi.map((d) => d.id));
  ilkCizim = false;
  if (odak) liste.querySelector(`[data-odak="${CSS.escape(odak)}"]`)?.focus({ preventScroll: true });

  bos.hidden = gorunen.length > 0;
  if (!gorunen.length) bos.replaceChildren(...bosIcerik(l, onunki, hepsi.length));
}

function bosIcerik(l, onunki, toplam) {
  const emoji = (e) => h('p', { class: 'ls-bos-emoji', 'aria-hidden': 'true' }, e);
  if (toplam) return [emoji('🎉'), h('p', {}, 'Hepsi tamam! Yapılanları görmek için anahtarı kapat.')];
  if (onunki) {
    return [emoji('🎁'), h('p', {}, `${partnerAdi()} henüz bir dilek eklemedi.`),
      h('p', { class: 'ls-bos-ince' }, 'Eklediğinde burada görünecek.')];
  }
  return [emoji(l.emoji), h('p', {}, l.bos),
    h('button', { type: 'button', class: 'btn small', onclick: () => girdi.focus() }, 'İlkini ekle')];
}

function ogeEl(d) {
  if (durum.duzen === d.id && duzenLi) return duzenLi;
  const data = L.sahibeGoster(d, myId); // sahibine giden veride gizli "alacak" işareti yok
  const yapildi = !!data.yapildi;
  const gizli = L.gizliIsaret(d, myId);
  const ds = { id: d.id };
  if (yapildi) ds.yapildi = '1';
  if (gizli?.ben) ds.alacak = '1';

  const kutu = L.isaretleyebilir(d, myId)
    ? h('button', {
      type: 'button', class: 'oge-kutu', role: 'checkbox', 'aria-checked': String(yapildi),
      'aria-label': data.metin, dataset: { odak: `kutu:${d.id}` },
      onclick: (e) => degistir(d, e.currentTarget),
    }, h('span', { class: 'oge-kutu-ic' }, ikon('check')))
    : h('span', { class: 'oge-kutu oge-kutu-pasif', 'aria-hidden': 'true' },
      yapildi ? h('span', { class: 'oge-kutu-ic' }, ikon('check')) : '🎁');

  const meta = yapildi
    ? L.yapildiMetni(data.liste, kim(data.yapan), formatDay(data.yapildi))
    : `${L.ekleyen(d) === myId ? 'Sen ekledin' : `${adOf(L.ekleyen(d))} ekledi`} · ${formatDay(d.created_at)}`;

  const li = h('li', { class: 'oge', dataset: ds }, kutu,
    h('div', { class: 'oge-govde' },
      h('p', { class: 'oge-metin' }, data.metin),
      data.not ? h('p', { class: 'oge-not' }, data.not) : null,
      h('p', { class: 'oge-meta' }, meta)));

  if (L.duzenleyebilir(d, myId)) {
    const acik = durum.menu === d.id;
    li.append(h('button', {
      type: 'button', class: 'icon-btn oge-menu', 'aria-label': `Seçenekler: ${data.metin}`,
      'aria-expanded': String(acik), dataset: { odak: `menu:${d.id}` },
      onclick: () => { durum.menu = acik ? null : d.id; ciz(); },
    }, ikon('more')));
    if (acik) li.append(eylemler(d, data));
  } else if (data.liste === 'hediye' && !yapildi) {
    // Partnerin istek listesi: yalnız gizli "Ben alacağım" işareti.
    li.append(h('div', { class: 'oge-eylem' },
      h('button', {
        type: 'button', class: 'btn small oge-alacak', 'aria-pressed': String(!!gizli?.ben),
        dataset: { odak: `alacak:${d.id}` }, onclick: () => alacak(d),
      }, gizli?.ben ? ikon('check') : null, 'Ben alacağım 🤫'),
      gizli?.ben ? h('span', { class: 'oge-sir' }, 'Bunu yalnız sen görüyorsun.') : null));
  }
  return li;
}

function eylemler(d, data) {
  return h('div', { class: 'oge-eylem' },
    h('button', { type: 'button', class: 'btn small ghost', onclick: () => duzenAc(d) }, ikon('edit'), 'Düzenle'),
    data.liste === 'yapilacak' && data.yapildi
      ? h('a', { class: 'btn small ghost', href: aniUrl(data.metin, data.yapildi) }, ikon('photo'), 'Anı olarak ekle')
      : null,
    h('button', { type: 'button', class: 'btn small ghost danger', onclick: () => sil(d) }, ikon('trash'), 'Sil'));
}

// ---------- Eylemler ----------
function sec(id) {
  if (durum.liste === id) return;
  durum.liste = id;
  durum.menu = null;
  durum.duzen = null;
  duzenLi = null;
  ilkCizim = true;
  writeStore('local', K_SEKME, id);
  ciz();
}

function grupSec(g) {
  durum.grup = g;
  ilkCizim = true;
  durum.menu = null;
  ciz();
}

function notAcKapa(ac) {
  const acik = typeof ac === 'boolean' ? ac : notGirdi.hidden;
  notGirdi.hidden = !acik;
  notBtn.hidden = acik;
  notBtn.setAttribute('aria-expanded', String(acik));
  if (acik) notGirdi.focus();
}

async function ekle(e) {
  e.preventDefault();
  const r = L.yeniOge({ liste: durum.liste, metin: girdi.value, not: notGirdi.value, me: myId });
  if (r.hata) {
    girdi.setAttribute('aria-invalid', 'true');
    toast(r.hata);
    girdi.focus();
    return;
  }
  girdi.removeAttribute('aria-invalid');
  girdi.value = '';
  notGirdi.value = '';
  notAcKapa(false);
  girdi.focus();
  sfx('pop');
  try {
    await col.put(r.data);
  } catch (err) {
    toast(err.message);
    return;
  }
  bildirGonder(r.data);
}

/** Ekleme bildirimi: 5 dakikada en çok bir (L.bildirimZamaniMi). */
function bildirGonder(data) {
  const son = Number(readStore('local', K_BILDIRIM));
  if (!L.bildirimZamaniMi(son > 0 ? son : null, Date.now())) return;
  writeStore('local', K_BILDIRIM, String(Date.now()));
  const l = L.listeById(data.liste);
  Promise.resolve(bildir(roomId, {
    tur: 'liste', baslik: 'Listeye eklendi', metin: `${l.emoji} ${l.ad}: ${data.metin}`, url: 'sayfalar/listeler/',
  })).catch(() => {});
}

function degistir(d, btn) {
  if (durum.bekleyen.has(d.id)) return;
  const simdi = !d.data.yapildi;
  btn.setAttribute('aria-checked', String(simdi));
  btn.closest('.oge')?.toggleAttribute('data-yapildi', simdi);
  sfx(simdi ? 'match' : 'tap');
  durum.bekleyen.add(d.id);
  // Kısa bekleme: işaret animasyonu bitsin, öğe sonra yerine kaysın.
  setTimeout(() => {
    durum.bekleyen.delete(d.id);
    const guncel = col.get(d.id);
    if (!guncel) return;
    const veri = simdi ? L.isaretle(guncel.data, myId) : L.geriAl(guncel.data);
    yamala(d.id, veri, ['yapildi', 'yapan']);
    if (simdi && veri.liste === 'yapilacak') {
      toast('Bunu anı olarak ekleyelim mi?', {
        ms: 8000,
        action: { label: 'Anı ekle', onClick: () => { location.href = aniUrl(veri.metin, veri.yapildi); } },
      });
    }
  }, azHareket() ? 0 : 320);
}

async function sil(d) {
  durum.menu = null;
  const yedek = { ...(col.get(d.id)?.data || d.data) };
  try {
    await col.remove(d.id);
  } catch (e) {
    toast(e.message);
    return;
  }
  sfx('tap');
  girdi.focus({ preventScroll: true });
  toast('Silindi.', { action: { label: 'Geri al', onClick: () => yaz(yedek, d.id) } });
}

function duzenAc(d) {
  durum.menu = null;
  durum.duzen = d.id;
  const metin = h('input', { class: 'input', type: 'text', maxlength: L.MAX_METIN, 'aria-label': 'Metin' });
  metin.value = d.data.metin || '';
  const not = h('textarea', { class: 'input', rows: 2, maxlength: L.MAX_NOT, 'aria-label': 'Not', placeholder: 'Not (isteğe bağlı)' });
  not.value = d.data.not || '';
  const kapat = () => {
    durum.duzen = null;
    duzenLi = null;
    ciz();
    liste.querySelector(`[data-odak="menu:${CSS.escape(d.id)}"]`)?.focus();
  };
  const f = h('form', {
    class: 'oge-duzen',
    onsubmit: (e) => {
      e.preventDefault();
      const r = L.duzenle(col.get(d.id)?.data || d.data, { metin: metin.value, not: not.value });
      if (r.hata) {
        metin.setAttribute('aria-invalid', 'true');
        toast(r.hata);
        return;
      }
      yamala(d.id, r.data, ['metin', 'not']);
      kapat();
    },
  },
  metin, not,
  h('div', { class: 'oge-duzen-eylem' },
    h('button', { type: 'button', class: 'btn ghost small', onclick: kapat }, 'Vazgeç'),
    h('button', { type: 'submit', class: 'btn primary small' }, 'Kaydet')));
  f.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); }
  });
  duzenLi = h('li', { class: 'oge oge-duzenleniyor', dataset: { id: d.id } }, f);
  ciz();
  metin.focus();
  metin.select();
}

function alacak(d) {
  const r = L.alacakDegistir(col.get(d.id) || d, myId);
  if (r.hata) {
    toast(r.hata);
    return;
  }
  yamala(d.id, r.data, ['alacak']);
  sfx('pop');
  if (r.data.alacak) toast('Sır aramızda 🤫');
}

// ---------- Canlı ----------
col.on('change', ciz);
col.on('error', (e) => toast(e.message));
profil.on('change', ciz);
ciz();
