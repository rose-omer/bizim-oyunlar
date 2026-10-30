// Özel Günler: kaçıncı gündeyiz, buluşmaya geri sayım, yaklaşanlar, takvim, kilometre taşları.
// Veri: 'gun' belgeleri (veri.js), 'cift' ve 'kisi' (profil.js). Saf hesaplar: ./mantik.js + js/core/gunler.js.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { readStore, writeStore } from '../../js/core/identity.js';
import { h, icon, toast, confirmDialog, celebrate } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { bildir } from '../../js/core/bildirim.js';
import { yerelHatirlaticilar } from '../../js/core/mobil.js';
import { toDay, parseDay, daysBetween, daysTogether, durationParts, countdown, monthGrid } from '../../js/core/gunler.js';
import * as M from './mantik.js';

// ---------- Simgeler (ui.js çizgisiyle aynı) ----------
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const SVG = {
  plus: `<path d="M12 5.5v13M5.5 12h13"/>`,
  left: `<path d="M14.5 5.5 8 12l6.5 6.5"/>`,
  right: `<path d="M9.5 5.5 16 12l-6.5 6.5"/>`,
  down: `<path d="m6 9.5 6 6 6-6"/>`,
  edit: `<path d="M4.5 19.5h3.8L19 8.8a2.7 2.7 0 0 0-3.8-3.8L4.5 15.7z"/><path d="m13.6 6.6 3.8 3.8"/>`,
  check: `<path d="m5.5 12.5 4 4 9-9"/>`,
  heart: `<path d="M12 19.5c-.2 0-.4-.1-.6-.2C7.5 16.2 4.5 13.6 4.5 10.2 4.5 7.9 6.3 6 8.5 6c1.4 0 2.7.7 3.5 1.8.8-1.1 2.1-1.8 3.5-1.8 2.2 0 4 1.9 4 4.2 0 3.4-3 6-6.9 9.1-.2.1-.4.2-.6.2z" fill="currentColor" stroke="none"/>`,
  clock: `<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>`,
};
function svg(name) {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">${SVG[name]}</svg>`;
  return t.content.firstElementChild;
}

// ---------- Açılış ----------
const { room, roomId, me } = await bootPage({ ns: 'gunler', title: 'Özel Günler', tab: 'gunler' });
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'gn-wrap' }, h('p', { class: 'gn-loading', role: 'status' }, 'Günlerimiz yükleniyor…')));

const [col, profil] = await Promise.all([openCollection(room, 'gun'), openProfil(room)]);

let bugun = toDay();
const buAy = () => { const p = parseDay(bugun); return { y: p.y, m: p.m }; };
let ay = buAy();
let secili = bugun;
let hepsi = false;
let eskiTaslar = false;
let baslangicDuzenle = false;
const LISTE_ILK = 8;
const KUTLAMA_KEY = `bizim.gunler.kutlama.${roomId}.${me.clientId}`;
const DOGUM_SONRA_KEY = `bizim.gunler.dogumsor.${roomId}.${me.clientId}`;

const veri = () => ({
  gunler: col.all(),
  kisiler: profil.kisiler.all(),
  baslangic: profil.cift().baslangic || null,
});
const pad = (n) => String(n).padStart(2, '0');
const benimAdim = () => profil.ben()?.ad || me.name || '';

function haberVer(baslik, metin) {
  try {
    Promise.resolve(bildir(roomId, { tur: 'gun', baslik, metin, url: 'sayfalar/gunler/' })).catch(() => {});
  } catch { /* bildirim isteğe bağlı */ }
}

/** Yeniden çizimde odağı korur: odaklı öğenin data-odak anahtarını bulup yeniden odaklar. */
function odakKoru(kap, ciz) {
  const a = document.activeElement;
  const anahtar = a && kap.contains(a) ? a.closest('[data-odak]')?.dataset.odak : null;
  ciz();
  if (anahtar) kap.querySelector(`[data-odak="${CSS.escape(anahtar)}"]`)?.focus({ preventScroll: true });
}

// ---------- İskelet ----------
const heroEl = h('section', { class: 'gn-hero', 'aria-labelledby': 'gn-sayac' });
const meetEl = h('section', { class: 'gn-meet card', 'aria-labelledby': 'gn-meet-h' });

const bosEl = h('div');
const listEl = h('ul', { class: 'gn-list' });
const dahaEl = h('div', { class: 'gn-more' });
const dogumEl = h('div');
const gecmisEl = h('div');
const upEl = h('section', { class: 'gn-sec', 'aria-labelledby': 'gn-up-h' },
  h('div', { class: 'gn-sec-head' },
    h('h2', { id: 'gn-up-h' }, 'Yaklaşanlar'),
    h('button', { type: 'button', class: 'btn primary gn-add', onclick: () => gunFormu() }, svg('plus'), 'Ekle')),
  bosEl, listEl, dahaEl, dogumEl, gecmisEl);

const ayBaslikEl = h('h3', { class: 'gn-cal-title', id: 'gn-cal-ay', 'aria-live': 'polite' });
const gridEl = h('div', { class: 'gn-cal-grid' });
const buguneEl = h('button', { type: 'button', class: 'btn ghost small gn-today-btn', onclick: () => { ay = buAy(); secili = bugun; renderCal(true); } }, 'Bugüne dön');
const gunPanelEl = h('div', { class: 'gn-day', 'aria-live': 'polite' });
const ayGit = (n) => {
  ay = M.ayKaydir(ay.y, ay.m, n);
  const b = buAy();
  secili = ay.y === b.y && ay.m === b.m ? bugun : toDay({ y: ay.y, m: ay.m, d: 1 });
  sfx('tap');
  renderCal(true);
};
const calEl = h('section', { class: 'gn-sec', 'aria-labelledby': 'gn-cal-h' },
  h('div', { class: 'gn-sec-head' }, h('h2', { id: 'gn-cal-h' }, 'Takvim'), buguneEl),
  h('div', { class: 'card gn-cal' },
    h('div', { class: 'gn-cal-head' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Önceki ay', onclick: () => ayGit(-1) }, svg('left')),
      ayBaslikEl,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sonraki ay', onclick: () => ayGit(1) }, svg('right'))),
    h('div', { class: 'gn-cal-week', 'aria-hidden': 'true' }, M.haftaGunleri().map((g) => h('span', {}, g))),
    gridEl,
    h('div', { class: 'gn-cal-foot' },
      h('ul', { class: 'gn-legend', 'aria-label': 'Renkler' },
        [['ozel', 'Özel gün'], ['dogumgunu', 'Doğum günü'], ['plan', 'Plan'], ['tas', 'Kilometre taşı']]
          .map(([t, ad]) => h('li', {}, h('i', { class: 'gn-dot', dataset: { tur: t }, 'aria-hidden': 'true' }), ad)))),
    gunPanelEl));

const tasEl = h('section', { class: 'gn-sec', 'aria-labelledby': 'gn-tas-h' });

app.replaceChildren(h('div', { class: 'gn-wrap' }, heroEl, meetEl, upEl, calEl, tasEl));

// ---------- 1. Kaçıncı gün ----------
let heroKey = null;
function renderHero(force = false) {
  const bas = profil.cift().baslangic || '';
  const key = `${bas}|${bugun}|${baslangicDuzenle}`;
  if (!force && key === heroKey) return;
  heroKey = key;
  if (!parseDay(bas) || baslangicDuzenle) {
    heroEl.replaceChildren(baslangicFormu(bas));
    return;
  }
  const n = daysTogether(bas, bugun);
  if (n === 0) { // başlangıç ileride
    heroEl.replaceChildren(
      h('h2', { class: 'gn-count', id: 'gn-sayac' },
        h('span', { class: 'gn-count-lead' }, 'İlk günümüze'), ' ',
        h('span', { class: 'gn-count-big' },
          h('span', { class: 'gn-count-num' }, String(daysBetween(bugun, bas))), ' ',
          h('span', { class: 'gn-count-tail' }, 'gün var'))),
      baslangicDugmesi(bas));
    return;
  }
  const sure = M.sureYazi(durationParts(bas, bugun));
  heroEl.replaceChildren(
    h('h2', { class: 'gn-count', id: 'gn-sayac' },
      h('span', { class: 'gn-count-lead' }, 'Birlikteliğimizin'), ' ',
      h('span', { class: 'gn-count-big' },
        h('span', { class: 'gn-count-num' }, `${n}.`), ' ',
        h('span', { class: 'gn-count-tail' }, 'günü'))),
    h('p', { class: 'gn-hero-sub' }, n === 1 ? 'Her şey bugün başladı' : sure),
    baslangicDugmesi(bas));
}

function baslangicDugmesi(bas) {
  return h('button', {
    type: 'button', class: 'gn-link', 'aria-label': 'İlk günümüzü değiştir',
    onclick: () => { baslangicDuzenle = true; renderHero(); heroEl.querySelector('input')?.focus(); },
  }, svg('edit'), h('span', {}, `${M.tarihYazi(bas, bugun, { haftaGunu: false })} · ilk günümüz`));
}

function baslangicFormu(bas) {
  const inp = h('input', { type: 'date', class: 'input', id: 'gn-bas', max: bugun, min: '1950-01-01', value: bas || '', 'aria-describedby': 'gn-bas-err' });
  const err = h('p', { class: 'gn-err', id: 'gn-bas-err', hidden: true });
  inp.addEventListener('input', () => hataYaz(inp, err, ''));
  const form = h('form', { class: 'gn-bas card', novalidate: true },
    h('h2', { class: 'gn-bas-h', id: 'gn-sayac' }, bas ? 'İlk günümüzü değiştir' : 'Ne zamandır birliktesiniz?'),
    h('p', { class: 'gn-hint' }, 'İlk gününüzü seçin; her günü birlikte sayalım.'),
    h('div', { class: 'gn-field' }, h('label', { class: 'gn-label', for: 'gn-bas' }, 'İlk günümüz'), inp, err),
    h('div', { class: 'gn-actions' },
      bas ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { baslangicDuzenle = false; renderHero(); } }, 'Vazgeç') : null,
      h('button', { type: 'submit', class: 'btn primary' }, 'Kaydet')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = inp.value;
    if (!parseDay(v)) return hataYaz(inp, err, 'Bir tarih seç.', true);
    if (v > bugun) return hataYaz(inp, err, 'İlk gününüz bugünden sonra olamaz.', true);
    try {
      await profil.setCift({ baslangic: v });
    } catch (x) {
      toast(x.message || 'Kaydedilemedi.');
      return;
    }
    baslangicDuzenle = false;
    sfx('pop');
    toast('İlk günümüz kaydedildi 💗');
    renderAll();
    haberVer('İlk günümüz kaydedildi', `${benimAdim()}: ${M.tarihYazi(v, bugun, { haftaGunu: false })}`);
  });
  return form;
}

// ---------- 1b. Buluşmaya geri sayım ----------
let meetKey = null;
let sayac = null; // { gun, saat, dk, sn } yazı öğeleri
function renderMeet(force = false) {
  const c = profil.cift();
  const cd = c.bulusma ? countdown(c.bulusma, new Date()) : null;
  const durum = !cd ? 'yok' : cd.past ? 'geldi' : 'var';
  const key = `${c.bulusma || ''}|${c.bulusmaNotu || ''}|${durum}|${bugun}`;
  if (!force && key === meetKey) { tick(); return; }
  meetKey = key;
  sayac = null;
  meetEl.dataset.durum = durum;
  if (durum === 'yok') {
    meetEl.replaceChildren(h('div', { class: 'gn-meet-empty' },
      h('div', { class: 'gn-meet-text' },
        h('h2', { class: 'gn-meet-h', id: 'gn-meet-h' }, 'Bir sonraki buluşma'),
        h('p', { class: 'gn-hint' }, 'Tarihini girin, birlikte geri sayalım.')),
      h('button', { type: 'button', class: 'btn primary', onclick: () => bulusmaFormu() }, svg('clock'), 'Planla')));
    return;
  }
  const z = M.isoParcala(c.bulusma);
  const ne = `${M.tarihYazi(z.tarih, bugun)} · ${z.saat}`;
  let govde;
  if (durum === 'var') {
    const kutu = (ad) => { const n = h('span', { class: 'gn-cd-n' }); return [n, h('div', { class: 'gn-cd' }, n, h('span', { class: 'gn-cd-l' }, ad))]; };
    const [gun, gunK] = kutu('gün');
    const [saat, saatK] = kutu('saat');
    const [dk, dkK] = kutu('dakika');
    const [sn, snK] = kutu('saniye');
    sayac = { gun, saat, dk, sn };
    govde = h('div', { class: 'gn-cds', role: 'timer', 'aria-label': `Buluşmaya kalan süre, ${ne}` }, gunK, saatK, dkK, snK);
  } else {
    govde = h('p', { class: 'gn-meet-now' }, 'Sarılma vakti! Buluştunuz mu?');
  }
  meetEl.replaceChildren(
    h('div', { class: 'gn-meet-head' },
      h('h2', { class: 'gn-meet-h', id: 'gn-meet-h' }, durum === 'var' ? 'Buluşmaya' : 'Buluşma vakti geldi'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Buluşmayı düzenle', onclick: () => bulusmaFormu() }, svg('edit'))),
    govde,
    h('p', { class: 'gn-meet-when' }, svg('clock'), h('span', {}, ne)),
    c.bulusmaNotu ? h('p', { class: 'gn-meet-note' }, c.bulusmaNotu) : null,
    h('button', { type: 'button', class: `btn${durum === 'geldi' ? ' primary' : ''} gn-met`, onclick: bulustuk }, 'Buluştuk!'));
  tick();
}

function tick() {
  if (!sayac) return;
  const c = countdown(profil.cift().bulusma, new Date());
  if (!c || c.past) { renderMeet(); return; }
  sayac.gun.textContent = String(c.days);
  sayac.saat.textContent = pad(c.hours);
  sayac.dk.textContent = pad(c.minutes);
  sayac.sn.textContent = pad(c.seconds);
}

async function ciftYaz(yeni) {
  await profil.ciftKoleksiyon.put(yeni, 'cift');
}

async function bulustuk() {
  const { bulusma, bulusmaNotu, ...kalan } = profil.cift();
  try {
    await ciftYaz(kalan);
  } catch (x) {
    toast(x.message || 'Kaydedilemedi.');
    return;
  }
  sfx('win');
  toast('Kavuşmanız kutlu olsun 💞');
}

function bulusmaFormu() {
  const c = profil.cift();
  const z = c.bulusma ? M.isoParcala(c.bulusma) : null;
  const tarih = h('input', { type: 'date', class: 'input', id: 'gn-b-tarih', min: bugun, max: '2100-12-31', value: z?.tarih || '', 'aria-describedby': 'gn-b-err' });
  const saat = h('input', { type: 'time', class: 'input', id: 'gn-b-saat', value: z?.saat || '20:00' });
  const not = h('input', { type: 'text', class: 'input', id: 'gn-b-not', maxlength: 80, autocomplete: 'off', placeholder: 'Örn. Kadıköy iskelesinde', value: c.bulusmaNotu || '' });
  const err = h('p', { class: 'gn-err', id: 'gn-b-err', hidden: true });
  tarih.addEventListener('input', () => hataYaz(tarih, err, ''));
  const kaydet = h('button', { type: 'submit', class: 'btn primary' }, 'Kaydet');
  const s = sayfaPenceresi({
    baslik: c.bulusma ? 'Buluşmayı düzenle' : 'Buluşma planla',
    govde: [
      h('div', { class: 'gn-two' },
        h('div', { class: 'gn-field' }, h('label', { class: 'gn-label', for: 'gn-b-tarih' }, 'Tarih'), tarih),
        h('div', { class: 'gn-field' }, h('label', { class: 'gn-label', for: 'gn-b-saat' }, 'Saat'), saat)),
      err,
      h('div', { class: 'gn-field' }, h('label', { class: 'gn-label', for: 'gn-b-not' }, 'Not ', h('span', { class: 'gn-opt' }, '(isteğe bağlı)')), not),
    ],
    altlik: [
      c.bulusma ? h('button', { type: 'button', class: 'btn ghost danger gn-del', onclick: async () => { s.kapat(); const { bulusma, bulusmaNotu, ...kalan } = profil.cift(); try { await ciftYaz(kalan); toast('Buluşma kaldırıldı'); } catch (x) { toast(x.message); } } }, 'Kaldır') : null,
      kaydet,
    ],
  });
  s.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { hata, iso } = M.bulusmaDogrula(tarih.value, saat.value);
    if (hata) { hataYaz(tarih, err, hata, true); sfx('wrong'); return; }
    const { bulusmaNotu, ...kalan } = profil.cift();
    const yeni = { ...kalan, bulusma: iso };
    const n = not.value.trim();
    if (n) yeni.bulusmaNotu = n;
    kaydet.disabled = true;
    try {
      await ciftYaz(yeni);
    } catch (x) {
      toast(x.message || 'Kaydedilemedi.');
      kaydet.disabled = false;
      return;
    }
    s.kapat();
    sfx('pop');
    toast('Geri sayım başladı ⏳');
    const p = M.isoParcala(iso);
    haberVer('Buluşma planlandı', `${M.tarihYazi(p.tarih, bugun)} · ${p.saat}${n ? ` · ${n}` : ''}`);
  });
}

// ---------- 2. Yaklaşanlar ----------
function satir(o, { kalan = M.kalanYazi } = {}) {
  const meta = [M.tarihYazi(o.date, bugun), o.ek].filter(Boolean).join(' · ');
  const yazi = kalan(o.daysLeft);
  const cls = `gn-row${o.daysLeft === 0 ? ' is-today' : ''}`;
  const icerik = [
    h('span', { class: 'gn-emo', dataset: { tur: o.kaynak === 'tas' ? 'tas' : o.tur }, 'aria-hidden': 'true' }, o.emoji),
    h('span', { class: 'gn-row-body' },
      h('span', { class: 'gn-row-title' }, o.baslik),
      h('span', { class: 'gn-row-meta' }, meta),
      o.not ? h('span', { class: 'gn-row-note' }, o.not) : null),
    h('span', { class: 'gn-left', dataset: { gun: o.daysLeft === 0 ? 'bugun' : o.daysLeft === 1 ? 'yarin' : o.daysLeft < 0 ? 'gecti' : '' } }, yazi),
  ];
  if (o.kaynak === 'gun') {
    return h('li', {}, h('button', {
      type: 'button', class: cls, dataset: { odak: o.key },
      'aria-label': `${o.baslik}, ${meta}, ${yazi}. Düzenle`,
      onclick: () => { const d = col.get(o.id); if (d) gunFormu({ doc: d }); },
    }, icerik));
  }
  return h('li', {}, h('div', { class: cls }, icerik));
}

let listKey = null;
let dogumKey = null;
let gecmisKey = null;
function renderList(force = false) {
  const v = veri();
  const items = M.birlesikListe({ ...v, bugun });
  kutlamaKontrol(items);
  hatirlaticilariGuncelle(v);

  const goster = hepsi ? items : items.slice(0, LISTE_ILK);
  const key = JSON.stringify([bugun, hepsi, v.gunler.length, goster.map((o) => [o.key, o.baslik, o.emoji, o.daysLeft, o.ek, o.not])]);
  if (force || key !== listKey) {
    listKey = key;
    odakKoru(upEl, () => {
      bosEl.replaceChildren();
      if (!v.gunler.length) {
        bosEl.append(h('div', { class: 'gn-bos' },
          h('p', {}, h('strong', {}, 'Henüz özel gün yok.'), ' İlk buluşmanızı ya da ilk öpücüğü ekleyelim mi?'),
          h('button', { type: 'button', class: 'btn', dataset: { odak: 'bos-ekle' }, onclick: () => gunFormu() }, svg('plus'), 'İlk özel günü ekle')));
      }
      listEl.hidden = !goster.length;
      listEl.replaceChildren(...goster.map((o) => satir(o)));
      dahaEl.replaceChildren();
      if (items.length > LISTE_ILK) {
        dahaEl.append(h('button', {
          type: 'button', class: 'btn ghost small', dataset: { odak: 'daha' }, 'aria-expanded': String(hepsi),
          onclick: () => { hepsi = !hepsi; renderList(); },
        }, hepsi ? 'Daha az göster' : `Hepsini göster (${items.length})`));
      }
    });
  }

  const dogumSor = !parseDay(profil.ben()?.dogum) && readStore('local', DOGUM_SONRA_KEY) !== '1';
  if (force || String(dogumSor) !== dogumKey) {
    dogumKey = String(dogumSor);
    dogumEl.replaceChildren(dogumSor ? dogumKarti() : '');
  }

  const gecmis = M.gecmisPlanlar(v.gunler, bugun);
  const gKey = JSON.stringify([bugun, gecmis.map((o) => [o.key, o.baslik, o.emoji, o.not])]);
  if (force || gKey !== gecmisKey) {
    gecmisKey = gKey;
    const acik = gecmisEl.querySelector('details')?.open || false;
    odakKoru(gecmisEl, () => {
      gecmisEl.replaceChildren(gecmis.length
        ? h('details', { class: 'gn-gecmis', open: acik },
          h('summary', { dataset: { odak: 'gecmis' } }, svg('down'), `Geçmişte kalan planlar (${gecmis.length})`),
          h('ul', { class: 'gn-list' }, gecmis.map((o) => satir(o))))
        : '');
    });
  }
}

function dogumKarti() {
  const inp = h('input', { type: 'date', class: 'input', id: 'gn-dogum', max: bugun, min: '1920-01-01', 'aria-describedby': 'gn-dogum-err' });
  const err = h('p', { class: 'gn-err', id: 'gn-dogum-err', hidden: true });
  inp.addEventListener('input', () => hataYaz(inp, err, ''));
  const form = h('form', { class: 'gn-dogum', novalidate: true },
    h('label', { class: 'gn-label', for: 'gn-dogum' }, 'Doğum gününü ekle; sevgilin hiç unutmasın 🎂'),
    h('div', { class: 'gn-inline' }, inp, h('button', { type: 'submit', class: 'btn primary' }, 'Ekle')),
    err,
    h('button', {
      type: 'button', class: 'btn ghost small gn-later',
      onclick: () => { writeStore('local', DOGUM_SONRA_KEY, '1'); renderList(); },
    }, 'Şimdi değil'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!parseDay(inp.value) || inp.value > bugun) return hataYaz(inp, err, 'Doğum gününü seç.', true);
    try {
      await profil.setBen({ dogum: inp.value });
    } catch (x) {
      toast(x.message || 'Kaydedilemedi.');
      return;
    }
    sfx('pop');
    toast('Doğum günün eklendi 🎂');
  });
  return form;
}

// ---------- 3. Ekle / düzenle / sil ----------
function secimGrubu({ etiketId, secenekler, deger, coklu = false, sinif = '', degisti }) {
  let v = coklu ? new Set(deger) : deger;
  const btns = secenekler.map((s) => h('button', {
    type: 'button', 'aria-pressed': 'false', 'aria-label': s.aria || null,
    onclick: () => {
      if (coklu) { if (v.has(s.id)) v.delete(s.id); else v.add(s.id); } else v = s.id;
      boya();
      sfx('tap');
      degisti?.(coklu ? [...v] : v);
    },
  }, s.ad));
  const boya = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(coklu ? v.has(secenekler[i].id) : v === secenekler[i].id)));
  boya();
  return {
    el: h('div', { class: `seg gn-seg ${sinif}`, role: 'group', 'aria-labelledby': etiketId }, btns),
    deger: () => (coklu ? [...v] : v),
    ayarla: (x) => { v = coklu ? new Set(x) : x; boya(); },
  };
}

function hataYaz(inp, el, msg, odakla = false) {
  el.textContent = msg || '';
  el.hidden = !msg;
  inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (msg && odakla) inp.focus();
}

let pencereNo = 0;
/** Alttan açılan form penceresi (ui.js'teki dialog görünümü). -> { dlg, form, kapat } */
function sayfaPenceresi({ baslik, govde, altlik }) {
  const id = `gn-dlg-${++pencereNo}`;
  const dlg = h('dialog', { class: 'ui-dialog sheet gn-sheet', 'aria-labelledby': id });
  const kapat = () => { if (dlg.open) dlg.close(); };
  const form = h('form', { class: 'dialog-card gn-sheet-card', novalidate: true },
    h('div', { class: 'gn-sheet-head' },
      h('h2', { id }, baslik),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onclick: kapat }, icon('close'))),
    h('div', { class: 'gn-sheet-body' }, govde),
    h('div', { class: 'gn-sheet-foot' }, altlik));
  dlg.append(form);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) kapat(); });
  dlg.addEventListener('close', () => {
    dlg.remove();
    setTimeout(() => renderList(), 0); // pencere açıkken bekleyen kutlama varsa şimdi
  });
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, form, kapat };
}

function gunFormu({ doc = null, tarih = '' } = {}) {
  const yeni = !doc;
  const d = doc?.data || {};
  let emojiSecildi = !!d.emoji;
  const baslik = h('input', {
    type: 'text', class: 'input', id: 'gn-f-baslik', maxlength: M.BASLIK_MAX, autocomplete: 'off',
    enterkeyhint: 'next', placeholder: 'Örn. İlk buluşmamız', value: d.baslik || '', 'aria-describedby': 'gn-f-baslik-err',
  });
  const tarihInp = h('input', {
    type: 'date', class: 'input', id: 'gn-f-tarih', min: '1900-01-01', max: '2100-12-31',
    value: d.tarih || tarih || '', 'aria-describedby': 'gn-f-tarih-err',
  });
  const not = h('textarea', { class: 'input', id: 'gn-f-not', maxlength: M.NOT_MAX, rows: 2, placeholder: 'Küçük bir not', 'aria-describedby': 'gn-f-not-err' });
  not.value = d.not || '';
  const hb = h('p', { class: 'gn-err', id: 'gn-f-baslik-err', hidden: true });
  const ht = h('p', { class: 'gn-err', id: 'gn-f-tarih-err', hidden: true });
  const hn = h('p', { class: 'gn-err', id: 'gn-f-not-err', hidden: true });
  baslik.addEventListener('input', () => hataYaz(baslik, hb, ''));
  tarihInp.addEventListener('input', () => hataYaz(tarihInp, ht, ''));
  not.addEventListener('input', () => hataYaz(not, hn, ''));

  const emojiler = M.EMOJILER.includes(d.emoji) || !d.emoji ? M.EMOJILER : [d.emoji, ...M.EMOJILER];
  const emojiG = secimGrubu({
    etiketId: 'gn-f-emoji-l', sinif: 'gn-emojis',
    secenekler: emojiler.map((e) => ({ id: e, ad: e })),
    deger: d.emoji || M.turEmoji(d.tur || 'ozel'),
    degisti: () => { emojiSecildi = true; },
  });
  const tekrarG = secimGrubu({ etiketId: 'gn-f-tekrar-l', sinif: 'gn-seg-3', secenekler: M.TEKRARLAR, deger: d.tekrar || 'yil', degisti: () => hataYaz(tarihInp, ht, '') });
  const turG = secimGrubu({
    etiketId: 'gn-f-tur-l', sinif: 'gn-seg-4', secenekler: M.TURLER, deger: d.tur || 'ozel',
    degisti: (t) => { if (!emojiSecildi) emojiG.ayarla(M.turEmoji(t)); },
  });
  const hatG = secimGrubu({
    etiketId: 'gn-f-hat-l', sinif: 'gn-seg-3', coklu: true, secenekler: M.HATIRLATMALAR,
    deger: Array.isArray(d.hatirlat) ? d.hatirlat : yeni ? [0, 1] : [0],
  });

  const oneriler = yeni ? h('div', { class: 'gn-field' },
    h('span', { class: 'gn-label', id: 'gn-f-oneri-l' }, 'Hazır öneriler'),
    h('div', { class: 'gn-oneriler', role: 'group', 'aria-labelledby': 'gn-f-oneri-l' },
      M.oneriler(bugun).map((o) => h('button', {
        type: 'button', class: 'gn-oneri',
        onclick: () => {
          baslik.value = o.baslik;
          tekrarG.ayarla(o.tekrar);
          turG.ayarla(o.tur);
          emojiG.ayarla(o.emoji);
          emojiSecildi = true;
          if (o.tarih) tarihInp.value = o.tarih;
          hataYaz(baslik, hb, '');
          hataYaz(tarihInp, ht, '');
          sfx('tap');
          (o.tarih ? baslik : tarihInp).focus();
        },
      }, h('span', { 'aria-hidden': 'true' }, o.emoji), o.etiket)))) : null;

  const kaydet = h('button', { type: 'submit', class: 'btn primary' }, yeni ? 'Kaydet' : 'Güncelle');
  const s = sayfaPenceresi({
    baslik: yeni ? 'Yeni özel gün' : 'Özel günü düzenle',
    govde: [
      oneriler,
      h('div', { class: 'gn-field' }, h('label', { class: 'gn-label', for: 'gn-f-baslik' }, 'Başlık'), baslik, hb),
      h('div', { class: 'gn-field' }, h('label', { class: 'gn-label', for: 'gn-f-tarih' }, 'Tarih'), tarihInp, ht),
      h('div', { class: 'gn-field' }, h('span', { class: 'gn-label', id: 'gn-f-tekrar-l' }, 'Tekrar'), tekrarG.el),
      h('div', { class: 'gn-field' }, h('span', { class: 'gn-label', id: 'gn-f-tur-l' }, 'Tür'), turG.el),
      h('div', { class: 'gn-field' }, h('span', { class: 'gn-label', id: 'gn-f-emoji-l' }, 'Simge'), emojiG.el),
      h('div', { class: 'gn-field' }, h('label', { class: 'gn-label', for: 'gn-f-not' }, 'Not ', h('span', { class: 'gn-opt' }, '(isteğe bağlı)')), not, hn),
      h('div', { class: 'gn-field' },
        h('span', { class: 'gn-label', id: 'gn-f-hat-l' }, 'Hatırlatma'),
        hatG.el,
        h('p', { class: 'gn-hint' }, 'Telefon uygulamasında sabah 09.00\'da hatırlatırız.')),
    ],
    altlik: [
      yeni ? null : h('button', { type: 'button', class: 'btn ghost danger gn-del', onclick: () => sil() }, 'Sil'),
      kaydet,
    ],
  });

  async function sil() {
    const ok = await confirmDialog(`“${d.baslik || 'Bu gün'}” silinsin mi?`, { ok: 'Sil', cancel: 'Vazgeç' });
    if (!ok) return;
    try {
      await col.remove(doc.id);
    } catch (x) {
      toast(x.message || 'Silinemedi.');
      return;
    }
    s.kapat();
    toast('Silindi');
  }

  s.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { hatalar, data } = M.gunDogrula({
      baslik: baslik.value, tarih: tarihInp.value, tekrar: tekrarG.deger(), tur: turG.deger(),
      emoji: emojiG.deger(), not: not.value, hatirlat: hatG.deger(),
    }, { bugun, yeni });
    hataYaz(baslik, hb, hatalar.baslik);
    hataYaz(tarihInp, ht, hatalar.tarih);
    hataYaz(not, hn, hatalar.not);
    const ilk = [hatalar.baslik && baslik, hatalar.tarih && tarihInp, hatalar.not && not].find(Boolean);
    if (ilk) { ilk.focus(); sfx('wrong'); return; }
    kaydet.disabled = true;
    try {
      await col.put(data, doc?.id);
    } catch (x) {
      toast(x.message || 'Kaydedilemedi.');
      kaydet.disabled = false;
      return;
    }
    s.kapat();
    sfx('pop');
    toast(yeni ? 'Kaydedildi 💗' : 'Güncellendi');
    const ad = benimAdim();
    haberVer(yeni ? 'Yeni özel gün' : 'Özel gün güncellendi',
      `${ad ? `${ad}: ` : ''}${data.emoji} ${data.baslik} · ${M.tarihYazi(data.tarih, bugun, { haftaGunu: false })}`);
  });
}

// ---------- 4. Takvim ----------
let calKey = null;
function renderCal(force = false) {
  const grid = monthGrid(ay.y, ay.m);
  const v = veri();
  const olaylar = M.takvimOlaylari({ ...v, from: grid[0].day, to: grid[41].day, bugun });
  const key = JSON.stringify([ay, secili, bugun, Object.entries(olaylar).map(([k, l]) => [k, l.map((o) => [o.key, o.baslik, o.emoji, o.tur, o.not])])]);
  if (!force && key === calKey) return;
  calKey = key;
  ayBaslikEl.textContent = M.ayBasligi(ay.y, ay.m);
  const b = buAy();
  buguneEl.hidden = ay.y === b.y && ay.m === b.m && secili === bugun;

  odakKoru(gridEl, () => {
    gridEl.replaceChildren(...grid.map((c) => {
      const l = olaylar[c.day] || [];
      const n = parseDay(c.day).d;
      return h('button', {
        type: 'button',
        class: `gn-cell${c.inMonth ? '' : ' is-out'}${l.length ? ' has-ev' : ''}`,
        dataset: { odak: c.day, day: c.day },
        'aria-pressed': String(c.day === secili),
        'aria-current': c.day === bugun ? 'date' : null,
        'aria-label': `${M.tarihYazi(c.day, bugun)}${c.day === bugun ? ', bugün' : ''}${l.length ? `, ${l.length} özel gün` : ''}`,
        onclick: () => gunSec(c.day),
      },
      h('span', { class: 'gn-cell-n' }, String(n)),
      h('span', { class: 'gn-dots', 'aria-hidden': 'true' },
        l.slice(0, 3).map((o) => h('i', { class: 'gn-dot', dataset: { tur: o.kaynak === 'tas' ? 'tas' : o.tur } }))));
    }));
  });

  const l = olaylar[secili] || [];
  odakKoru(gunPanelEl, () => {
    gunPanelEl.replaceChildren(
      h('div', { class: 'gn-day-head' },
        h('h3', { class: 'gn-day-h' }, M.tarihYazi(secili, bugun), secili === bugun ? h('span', { class: 'gn-day-today' }, 'Bugün') : null),
        h('button', { type: 'button', class: 'btn ghost small', dataset: { odak: 'gune-ekle' }, onclick: () => gunFormu({ tarih: secili }) }, svg('plus'), 'Bu güne ekle')),
      l.length
        ? h('ul', { class: 'gn-list is-flat' }, l.map((o) => satir(o)))
        : h('p', { class: 'gn-hint' }, 'Bu gün boş. Bir şey planlayalım mı?'));
  });
}

function gunSec(day) {
  secili = day;
  const p = parseDay(day);
  if (p.y !== ay.y || p.m !== ay.m) ay = { y: p.y, m: p.m };
  sfx('tap');
  renderCal();
}

// ---------- 5. Kilometre taşları ----------
let tasKey = null;
function renderTas(force = false) {
  const bas = profil.cift().baslangic || null;
  const z = M.tasZaman(bas, bugun, { gelecek: 3 });
  const key = JSON.stringify([bas, bugun, eskiTaslar]);
  if (!force && key === tasKey) return;
  tasKey = key;
  const head = h('div', { class: 'gn-sec-head' }, h('h2', { id: 'gn-tas-h' }, 'Kilometre taşlarımız'));
  if (!z.length) {
    tasEl.replaceChildren(head, h('p', { class: 'gn-hint' }, parseDay(bas)
      ? 'İlk gününüz gelince taşlar burada dizilecek.'
      : 'İlk gününüzü girince 100. gün, yıl dönümleri burada dizilir.'));
    return;
  }
  const gecmis = z.filter((x) => x.durum === 'gecti').length;
  const gizli = !eskiTaslar && gecmis > 4 ? gecmis - 3 : 0;
  const durumYazi = (x) => (x.durum === 'gecti' ? 'kutlandı ✓' : x.durum === 'bugun' ? 'Bugün!' : M.kalanYazi(x.daysLeft));
  const isaret = (x) => (x.durum === 'gecti' ? svg('check') : x.durum === 'bugun' ? svg('heart') : null);
  odakKoru(tasEl, () => {
    tasEl.replaceChildren(head, h('div', { class: 'card gn-tas' },
      gizli ? h('button', {
        type: 'button', class: 'btn ghost small gn-tas-more', dataset: { odak: 'eski' },
        onclick: () => { eskiTaslar = true; renderTas(); },
      }, `Önceki ${gizli} taşı göster`) : null,
      h('ol', { class: 'gn-stones' }, z.slice(gizli).map((x) => h('li', { class: 'gn-stone', dataset: { durum: x.durum, tur: x.tur } },
        h('span', { class: 'gn-mark', 'aria-hidden': 'true' }, isaret(x)),
        h('span', { class: 'gn-stone-body' },
          h('span', { class: 'gn-stone-title' }, x.baslik),
          h('span', { class: 'gn-stone-date' }, M.tarihYazi(x.date, bugun, { haftaGunu: false }))),
        h('span', { class: 'gn-stone-state' }, durumYazi(x)))))));
  });
}

// ---------- Kutlama ve hatırlatıcılar ----------
function kutlamaKontrol(items) {
  const bugunkuler = items.filter((o) => o.daysLeft === 0);
  if (!M.kutlamaGerekli(readStore('local', KUTLAMA_KEY), bugun, bugunkuler.length)) return;
  if (document.querySelector('dialog[open]')) return; // pencere kapanınca yeniden denenir
  writeStore('local', KUTLAMA_KEY, bugun);
  sfx('win');
  celebrate({
    title: bugunkuler.length > 1 ? 'Bugün çok özel!' : 'Bugün özel bir gün!',
    lines: bugunkuler.map((o) => `${o.emoji} ${o.baslik}${o.ek ? ` · ${o.ek}` : ''}`),
    buttons: [{ label: 'Ne güzel 💗', primary: true }],
  });
}

let hatKey = null;
function hatirlaticilariGuncelle(v) {
  const liste = M.hatirlatmalar({ ...v, simdi: new Date() });
  const key = JSON.stringify(liste);
  if (key === hatKey) return;
  hatKey = key;
  Promise.resolve().then(() => yerelHatirlaticilar(liste)).catch((e) => console.warn('[hatırlatıcı]', e));
}

// ---------- Akış ----------
function renderAll(force = false) {
  renderHero(force);
  renderMeet(force);
  renderList(force);
  renderCal(force);
  renderTas(force);
}

col.on('change', () => renderAll());
profil.on('change', () => renderAll());
let sonHata = 0;
col.on('error', (e) => {
  if (Date.now() - sonHata < 8000) return;
  sonHata = Date.now();
  toast(e?.message || 'Bağlantı sorunu. Kayıtlar bekliyor, sonra gönderilecek.');
});

renderAll(true);

setInterval(() => {
  const t = toDay();
  if (t !== bugun) {
    const eskiAy = buAy();
    const takip = ay.y === eskiAy.y && ay.m === eskiAy.m && secili === bugun;
    bugun = t;
    if (takip) { ay = buAy(); secili = bugun; }
    renderAll(true);
  } else {
    renderMeet();
  }
}, 1000);
