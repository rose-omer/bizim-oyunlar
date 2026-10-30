// Randevu Fikirleri: 200 hazır fikir, filtre, zar, plan ve yapılanlar. Saf mantık randevu.js'te (tests/randevu-*).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { pageUrl } from '../../js/core/identity.js';
import { h, toast, formatDay, confirmDialog } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { toDay, parseDay } from '../../js/core/gunler.js';
import { randomSeed } from '../../games/_soru/rng.js';
import * as R from './randevu.js';
import { FIKIRLER } from './fikirler.js';
import { aniParametreleri } from '../listeler/liste.js';
import { ikon } from '../listeler/ikonlar.js';

const { room } = await bootPage({ ns: 'randevu', title: 'Randevu Fikirleri', tab: 'daha' });
const col = await openCollection(room, 'randevu');

const SAYFA = 24;
const durum = {
  gorunum: 'fikirler',  // 'fikirler' | 'plan' | 'yapilan'
  kategori: null,
  butce: null,
  goster: SAYFA,
  planla: null,         // tarih formu açık olan: 'c:<fikirId>' çekiliş, 'f:<fikirId>' liste, 'k:<belgeId>' kayıt
  cekilen: null,
  donuyor: false,
};

// ---------- Yardımcılar ----------
const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const bugun = () => toDay(new Date());
const yerelGun = (gun) => {
  const p = parseDay(gun);
  return p ? new Date(p.y, p.m - 1, p.d) : null;
};
// Biçimleyiciler bir kez kurulur (her kayıt satırında yeniden kurmak telefonda pahalı).
const uzunTarihBicim = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const kisaAyBicim = new Intl.DateTimeFormat('tr-TR', { month: 'short' });
const tarihUzun = (gun) => {
  const d = yerelGun(gun);
  return d ? uzunTarihBicim.format(d) : '';
};
const aniUrl = (metin, iso) => pageUrl('sayfalar/anilar/', aniParametreleri(metin, toDay(new Date(iso))));
const yaz = (data, id) => col.put(data, id).catch((e) => toast(e.message));
/** Yalnız verilen alanları yazar (alan düzeyinde birleşir); null alanı siler. */
const yamala = (id, kismi) => col.patch(id, kismi).catch((e) => toast(e.message));
const katAdlari = (f) => f.kategoriler.map((k) => R.kategoriById(k)?.ad).filter(Boolean).join(', ');

// ---------- İskelet ----------
const app = document.getElementById('app');

const GORUNUMLER = [
  { id: 'fikirler', ad: 'Fikirler', emoji: '💡' },
  { id: 'plan', ad: 'Planladıklarımız', emoji: '🗓️' },
  { id: 'yapilan', ad: 'Yaptıklarımız', emoji: '💞' },
];
const sekmeBtn = new Map();
const sekmeler = h('div', { class: 'rv-sekmeler', role: 'tablist', 'aria-label': 'Randevu bölümleri' },
  GORUNUMLER.map((g) => {
    const b = h('button', {
      type: 'button', class: 'rv-sekme', role: 'tab', id: `rv-sekme-${g.id}`, 'aria-controls': `rv-${g.id}`,
      onclick: () => gorunumSec(g.id),
    },
    h('span', { class: 'rv-sekme-emoji', 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'rv-sekme-ad' }, g.ad),
    h('span', { class: 'rv-sekme-sayi' }));
    sekmeBtn.set(g.id, b);
    return b;
  }));
sekmeler.addEventListener('keydown', (e) => {
  const ids = GORUNUMLER.map((g) => g.id);
  let i = ids.indexOf(durum.gorunum);
  if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
  else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
  else return;
  e.preventDefault();
  gorunumSec(ids[i]);
  sekmeBtn.get(ids[i]).focus();
});

// Çekiliş kartı
const slotMetin = h('p', { class: 'rv-slot-metin' });
const slotEtiket = h('div', { class: 'rv-etiketler rv-slot-etiket' });
const slot = h('div', { class: 'rv-slot', 'aria-live': 'polite' }, slotMetin, slotEtiket);
const zarBtn = h('button', { type: 'button', class: 'btn primary wide rv-zar', onclick: cek }, 'Bana bir fikir ver 🎲');
const cekilenEylem = h('div', { class: 'rv-cekilen-eylem', hidden: true });
const cekilis = h('section', { class: 'rv-cekilis', 'aria-labelledby': 'rv-cekilis-baslik' },
  h('h2', { class: 'rv-cekilis-baslik', id: 'rv-cekilis-baslik' }, 'Ne yapsak?'),
  slot, zarBtn, cekilenEylem);

// Filtreler
const katBtn = new Map();
const kategoriler = h('div', { class: 'rv-kategoriler', role: 'group', 'aria-label': 'Kategori' },
  [{ id: null, ad: 'Hepsi', emoji: '✨' }, ...R.KATEGORILER].map((k) => {
    const b = h('button', {
      type: 'button', class: 'rv-kat',
      onclick: () => { durum.kategori = k.id; durum.goster = SAYFA; durum.planla = null; ciz(); },
    }, h('span', { class: 'rv-kat-emoji', 'aria-hidden': 'true' }, k.emoji), k.ad);
    katBtn.set(k.id, b);
    return b;
  }));
const BUTCE_SECENEK = [[null, 'Her bütçe', 'Her bütçe'], ['₺', '₺', '₺ az bütçe'], ['₺₺', '₺₺', '₺₺ orta bütçe'], ['₺₺₺', '₺₺₺', '₺₺₺ bol bütçe']];
const butceBtn = new Map();
const butceler = h('div', { class: 'seg rv-butce', role: 'group', 'aria-label': 'Bütçe' },
  BUTCE_SECENEK.map(([id, yazi, ad]) => {
    const b = h('button', {
      type: 'button', 'aria-label': ad,
      onclick: () => { durum.butce = id; durum.goster = SAYFA; durum.planla = null; ciz(); },
    }, yazi);
    butceBtn.set(id, b);
    return b;
  }));
const sayi = h('p', { class: 'rv-sayi', 'aria-live': 'polite' });
const fikirListe = h('ul', { class: 'rv-liste' });
const dahaBtn = h('button', { type: 'button', class: 'btn wide rv-daha', onclick: () => { durum.goster += SAYFA; ciz(); } });

// Kendi fikrin
const kendiMetin = h('input', { class: 'input', id: 'rv-kendi-metin', type: 'text', maxlength: R.MAX_METIN, autocomplete: 'off', placeholder: 'ör. Gece balık tutmaya gidelim' });
const kendiTarih = h('input', { class: 'input rv-tarih', id: 'rv-kendi-tarih', type: 'date' });
const kendiForm = h('form', { class: 'rv-kendi', onsubmit: kendiEkle },
  h('h2', { class: 'rv-kendi-baslik' }, 'Kendi fikrin'),
  h('p', { class: 'rv-kendi-not' }, 'Aklınızda başka bir şey mi var? Ekleyin, planlarınıza düşsün.'),
  h('label', { class: 'rv-etiket-ad', for: 'rv-kendi-metin' }, 'Ne yapalım?'), kendiMetin,
  h('label', { class: 'rv-etiket-ad', for: 'rv-kendi-tarih' }, 'Tarih (isteğe bağlı)'), kendiTarih,
  h('button', { type: 'submit', class: 'btn primary' }, ikon('plus'), 'Planlarımıza ekle'));

const fikirlerBolum = h('section', { class: 'rv-bolum', id: 'rv-fikirler', role: 'tabpanel', 'aria-labelledby': 'rv-sekme-fikirler' },
  cekilis,
  h('div', { class: 'rv-filtre' }, kategoriler, butceler),
  sayi, fikirListe, dahaBtn, kendiForm);
const planBolum = h('section', { class: 'rv-bolum', id: 'rv-plan', role: 'tabpanel', 'aria-labelledby': 'rv-sekme-plan', hidden: true });
const yapilanBolum = h('section', { class: 'rv-bolum', id: 'rv-yapilan', role: 'tabpanel', 'aria-labelledby': 'rv-sekme-yapilan', hidden: true });

app.replaceChildren(h('div', { class: 'rv' }, sekmeler, fikirlerBolum, planBolum, yapilanBolum));

// ---------- Ortak parçalar ----------
function etiketler(f) {
  return [
    h('span', { class: 'rv-etiket' }, ikon('clock'), f.sure),
    h('span', { class: `rv-etiket${f.kategoriler.includes('ucretsiz') ? ' rv-ucretsiz' : ''}` }, R.butceMetni(f)),
    h('span', { class: 'rv-etiket rv-kat-iz', title: katAdlari(f) },
      h('span', { 'aria-hidden': 'true' }, f.kategoriler.map((k) => R.kategoriById(k)?.emoji).join(' ')),
      h('span', { class: 'sr-only' }, katAdlari(f))),
  ];
}

function planFormu(anahtar, mevcut, kaydet) {
  const inp = h('input', { class: 'input rv-tarih', type: 'date', min: bugun(), 'aria-label': 'Randevu günü', required: true });
  inp.value = mevcut || '';
  const vazgec = () => { durum.planla = null; ciz(); };
  const f = h('form', {
    class: 'rv-planla',
    onsubmit: (e) => {
      e.preventDefault();
      if (!parseDay(inp.value)) { toast('Bir gün seç.'); inp.focus(); return; }
      durum.planla = null;
      kaydet(inp.value);
    },
  }, inp,
  h('div', { class: 'rv-planla-eylem' },
    h('button', { type: 'button', class: 'btn ghost small', onclick: vazgec }, 'Vazgeç'),
    h('button', { type: 'submit', class: 'btn primary small', dataset: { odak: `kaydet:${anahtar}` } }, 'Takvime koy')));
  f.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); vazgec(); } });
  return f;
}

function durumEtiketi(kayit) {
  if (!kayit) return null;
  if (kayit.data.yapildi) return h('span', { class: 'rv-durum rv-durum-yapildi' }, ikon('check'), 'Yaptınız');
  if (kayit.data.plan) {
    return h('span', { class: 'rv-durum rv-durum-plan' }, ikon('calendar'),
      `${tarihUzun(kayit.data.plan)} · ${R.planMetni(kayit.data.plan, bugun())}`);
  }
  return h('span', { class: 'rv-durum' }, ikon('heart'), 'Kaydedildi');
}

// ---------- Çizim ----------
function ciz() {
  const docs = col.all();
  const kayit = R.kayitlar(docs);
  const pl = R.planlananlar(docs);
  const yp = R.yapilanlar(docs);
  const odak = document.activeElement?.dataset?.odak || null;

  for (const g of GORUNUMLER) {
    const b = sekmeBtn.get(g.id);
    const on = g.id === durum.gorunum;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    const n = g.id === 'plan' ? pl.takvim.length + pl.birGun.length : g.id === 'yapilan' ? yp.length : FIKIRLER.length;
    b.querySelector('.rv-sekme-sayi').textContent = String(n);
  }
  fikirlerBolum.hidden = durum.gorunum !== 'fikirler';
  planBolum.hidden = durum.gorunum !== 'plan';
  yapilanBolum.hidden = durum.gorunum !== 'yapilan';

  if (durum.gorunum === 'fikirler') cizFikirler(kayit);
  else if (durum.gorunum === 'plan') cizPlan(pl);
  else cizYapilan(yp);

  if (odak) app.querySelector(`[data-odak="${CSS.escape(odak)}"]`)?.focus({ preventScroll: true });
}

function cizCekilis(kayit) {
  const f = durum.cekilen;
  slot.classList.toggle('bos', !f);
  if (!f) {
    slotMetin.textContent = 'Zarı at, gerisini bize bırak.';
    slotEtiket.replaceChildren();
    cekilenEylem.hidden = true;
    return;
  }
  slotMetin.textContent = f.metin;
  slotEtiket.replaceChildren(...etiketler(f));
  const k = kayit.get(f.id);
  cekilenEylem.hidden = false;
  cekilenEylem.replaceChildren(
    h('div', { class: 'rv-cekilen-dugmeler' },
      h('button', {
        type: 'button', class: 'btn small', 'aria-pressed': String(!!k), dataset: { odak: `ckaydet:${f.id}` },
        onclick: () => kaydetDegistir(f),
      }, ikon('heart'), k ? 'Kaydedildi' : 'Kaydet'),
      h('button', {
        type: 'button', class: 'btn small', 'aria-expanded': String(durum.planla === `c:${f.id}`), dataset: { odak: `cplan:${f.id}` },
        onclick: () => planAcKapa(`c:${f.id}`),
      }, ikon('calendar'), 'Planla')),
    // Kaydet düğmesi zaten "Kaydedildi" der; durum yalnız plan ya da yapıldıysa.
    k?.data.plan || k?.data.yapildi ? durumEtiketi(k) : '',
    durum.planla === `c:${f.id}` ? planFormu(`c:${f.id}`, k?.data.plan, (gun) => planla(f, gun)) : '');
}

function cizFikirler(kayit) {
  if (!durum.donuyor) cizCekilis(kayit);
  for (const [id, b] of katBtn) b.setAttribute('aria-pressed', String(durum.kategori === id));
  for (const [id, b] of butceBtn) b.setAttribute('aria-pressed', String(durum.butce === id));
  const havuz = R.filtrele(FIKIRLER, durum);
  sayi.textContent = havuz.length ? `${havuz.length} fikir` : 'Bu seçimde fikir yok. Filtreyi biraz gevşetelim mi?';
  fikirListe.replaceChildren(...havuz.slice(0, durum.goster).map((f) => fikirEl(f, kayit.get(f.id))));
  const kalan = havuz.length - durum.goster;
  dahaBtn.hidden = kalan <= 0;
  dahaBtn.textContent = `Daha fazla göster (${kalan})`;
}

function fikirEl(f, k) {
  const acik = durum.planla === `f:${f.id}`;
  const ds = { id: f.id };
  if (k) ds.kayitli = '1';
  return h('li', { class: 'rv-fikir', dataset: ds },
    h('p', { class: 'rv-fikir-metin' }, f.metin),
    h('div', { class: 'rv-fikir-alt' },
      h('div', { class: 'rv-etiketler' }, etiketler(f)),
      h('div', { class: 'rv-fikir-eylem' },
        h('button', {
          type: 'button', class: 'icon-btn rv-kaydet', 'aria-pressed': String(!!k),
          'aria-label': `Kaydet: ${f.metin}`, dataset: { odak: `kaydet:${f.id}` }, onclick: () => kaydetDegistir(f),
        }, ikon('heart')),
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-expanded': String(acik),
          'aria-label': `Planla: ${f.metin}`, dataset: { odak: `plan:${f.id}` },
          onclick: () => planAcKapa(`f:${f.id}`),
        }, ikon('calendar')))),
    durumEtiketi(k),
    acik ? planFormu(`f:${f.id}`, k?.data.plan, (gun) => planla(f, gun)) : null);
}

function cizPlan(pl) {
  const parcalar = [];
  if (pl.takvim.length) {
    parcalar.push(h('h2', { class: 'rv-alt-baslik' }, 'Takvimde'),
      h('ul', { class: 'rv-kayitlar' }, pl.takvim.map((d) => kayitEl(d, 'takvim'))));
  }
  if (pl.birGun.length) {
    parcalar.push(h('h2', { class: 'rv-alt-baslik' }, 'Bir gün mutlaka'),
      h('ul', { class: 'rv-kayitlar' }, pl.birGun.map((d) => kayitEl(d, 'birgun'))));
  }
  if (!parcalar.length) {
    parcalar.push(bosDurum('🗓️', 'Henüz plan yok. Bir fikri kalpleyin ya da zarı atın.', 'Fikirlere bak', () => gorunumSec('fikirler')));
  }
  planBolum.replaceChildren(...parcalar);
}

function cizYapilan(yp) {
  yapilanBolum.replaceChildren(yp.length
    ? h('ul', { class: 'rv-kayitlar' }, yp.map((d) => kayitEl(d, 'yapilan')))
    : bosDurum('💞', 'Birlikte yaptığınız randevular burada birikecek.', 'Plana bak', () => gorunumSec('plan')));
}

function bosDurum(emoji, metin, dugme, onclick) {
  return h('div', { class: 'rv-bos' },
    h('p', { class: 'rv-bos-emoji', 'aria-hidden': 'true' }, emoji),
    h('p', {}, metin),
    h('button', { type: 'button', class: 'btn small', onclick }, dugme));
}

function rozet(d, tur) {
  if (tur === 'takvim') {
    const g = yerelGun(d.data.plan);
    return h('div', { class: 'rv-rozet rv-rozet-tarih', 'aria-hidden': 'true' },
      h('span', { class: 'rv-rozet-gun' }, String(g.getDate())),
      h('span', { class: 'rv-rozet-ay' }, kisaAyBicim.format(g)));
  }
  return h('div', { class: `rv-rozet${tur === 'yapilan' ? ' rv-rozet-yapildi' : ''}`, 'aria-hidden': 'true' },
    ikon(tur === 'yapilan' ? 'check' : 'heart'));
}

function kayitEl(d, tur) {
  const acik = durum.planla === `k:${d.id}`;
  let meta;
  if (tur === 'takvim') {
    const pm = R.planMetni(d.data.plan, bugun());
    meta = h('p', { class: `rv-kayit-meta${pm === 'Tarihi geçti' ? ' gecti' : ''}` }, `${tarihUzun(d.data.plan)} · ${pm}`);
  } else if (tur === 'birgun') {
    meta = h('p', { class: 'rv-kayit-meta' }, 'Tarih yok · uygun bir gün seçin');
  } else {
    meta = h('p', { class: 'rv-kayit-meta' }, `Yapıldı · ${formatDay(d.data.yapildi)}`);
  }
  const eylem = tur === 'yapilan'
    ? [
      h('a', { class: 'btn small primary', href: aniUrl(d.data.metin, d.data.yapildi) }, ikon('photo'), 'Anı olarak ekle'),
      h('button', { type: 'button', class: 'btn small ghost', dataset: { odak: `geri:${d.id}` }, onclick: () => geriAl(d) }, ikon('undo'), 'Geri al'),
    ]
    : [
      h('button', { type: 'button', class: 'btn small primary', dataset: { odak: `yaptik:${d.id}` }, onclick: () => yaptik(d) }, ikon('check'), 'Yaptık'),
      h('button', {
        type: 'button', class: 'btn small ghost', 'aria-expanded': String(acik), dataset: { odak: `ktarih:${d.id}` },
        onclick: () => planAcKapa(`k:${d.id}`),
      }, ikon('calendar'), d.data.plan ? 'Tarih' : 'Tarih seç'),
      h('button', { type: 'button', class: 'btn small ghost danger', onclick: () => kaldir(d) }, ikon('trash'), 'Kaldır'),
    ];
  return h('li', { class: 'rv-kayit', dataset: { id: d.id } },
    rozet(d, tur),
    h('div', { class: 'rv-kayit-govde' }, h('p', { class: 'rv-kayit-metin' }, d.data.metin), meta),
    h('div', { class: 'rv-kayit-eylem' }, eylem),
    acik ? planFormu(`k:${d.id}`, d.data.plan, (gun) => { yamala(d.id, { plan: gun }); toast(`Takvimde: ${tarihUzun(gun)}`); }) : null);
}

// ---------- Eylemler ----------
function planAcKapa(anahtar) {
  durum.planla = durum.planla === anahtar ? null : anahtar;
  ciz();
  if (durum.planla) app.querySelector('.rv-planla input')?.focus({ preventScroll: true });
}

function gorunumSec(id) {
  durum.gorunum = id;
  durum.planla = null;
  ciz();
}

async function cek() {
  if (durum.donuyor) return;
  const havuz = R.filtrele(FIKIRLER, durum);
  if (!havuz.length) {
    toast('Bu seçimde fikir yok. Filtreyi biraz gevşetelim mi?');
    return;
  }
  const yapilmis = col.all().filter((d) => d.data.yapildi && d.data.fikirId).map((d) => d.data.fikirId);
  const sonuc = R.cekilis(havuz, randomSeed(), { haric: [...yapilmis, durum.cekilen?.id].filter(Boolean) });
  durum.donuyor = true;
  durum.planla = null;
  zarBtn.setAttribute('aria-disabled', 'true');
  slot.setAttribute('aria-busy', 'true');
  slot.classList.remove('geldi', 'bos');
  slot.classList.add('donuyor');
  cekilenEylem.hidden = true;
  slotEtiket.replaceChildren();
  if (!azHareket()) {
    for (let i = 0; i < sonuc.seri.length - 1; i++) {
      slotMetin.textContent = sonuc.seri[i].metin;
      slotMetin.classList.remove('tik');
      void slotMetin.offsetWidth; // animasyonu yeniden başlat
      slotMetin.classList.add('tik');
      sfx('tick');
      await bekle(30 + 1.6 * i * i);
    }
  }
  durum.cekilen = sonuc.secilen;
  durum.donuyor = false;
  zarBtn.removeAttribute('aria-disabled');
  slot.removeAttribute('aria-busy');
  slot.classList.remove('donuyor');
  slotMetin.classList.remove('tik');
  ciz();
  slot.classList.add('geldi');
  sfx('pop');
}

async function kaydetDegistir(f) {
  const k = R.kayitlar(col.all()).get(f.id);
  if (!k) {
    yamala(R.fikirDocId(f), R.yeniRandevu({ fikir: f }).data); // sabit id + alan yaması: iki cihaz aynı anda kaydetse de tek kayıt
    sfx('pop');
    toast('Kaydedildi. Planladıklarımız’da sizi bekliyor.');
    return;
  }
  if ((k.data.plan || k.data.yapildi)
    && !(await confirmDialog('Bu fikir planlarınızda. Kaldıralım mı?', { ok: 'Kaldır' }))) return;
  kaldir(k);
}

function planla(f, gun) {
  const k = R.kayitlar(col.all()).get(f.id);
  if (k) yamala(k.id, { plan: gun });
  else yamala(R.fikirDocId(f), R.yeniRandevu({ fikir: f, plan: gun }).data);
  sfx('pop');
  toast(`Takvimde: ${tarihUzun(gun)}`);
}

function yaptik(d) {
  const guncel = col.get(d.id)?.data || d.data;
  const yapildi = new Date().toISOString();
  yamala(d.id, { yapildi });
  sfx('win');
  toast('Ne güzel! Anı olarak ekleyelim mi?', {
    ms: 8000,
    action: { label: 'Anı ekle', onClick: () => { location.href = aniUrl(guncel.metin, yapildi); } },
  });
}

function geriAl(d) {
  yamala(d.id, { yapildi: null });
  sfx('tap');
}

async function kaldir(d) {
  const yedek = { ...(col.get(d.id)?.data || d.data) };
  try {
    await col.remove(d.id);
  } catch (e) {
    toast(e.message);
    return;
  }
  sfx('tap');
  toast('Kaldırıldı.', { action: { label: 'Geri al', onClick: () => yaz(yedek, d.id) } });
}

async function kendiEkle(e) {
  e.preventDefault();
  const r = R.yeniRandevu({ metin: kendiMetin.value, plan: kendiTarih.value });
  if (r.hata) {
    kendiMetin.setAttribute('aria-invalid', 'true');
    toast(r.hata);
    kendiMetin.focus();
    return;
  }
  kendiMetin.removeAttribute('aria-invalid');
  try {
    await col.put(r.data);
  } catch (err) {
    toast(err.message);
    return;
  }
  kendiMetin.value = '';
  kendiTarih.value = '';
  sfx('pop');
  toast('Planlarımıza eklendi.', { action: { label: 'Gör', onClick: () => gorunumSec('plan') } });
}

// ---------- Canlı ----------
col.on('change', () => { if (!durum.donuyor) ciz(); });
col.on('error', (e) => toast(e.message));
ciz();
