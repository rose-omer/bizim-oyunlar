// Sevgi Dili Testi: 30 ikili seçim, sonuç grafiği, öneriler ve ikinizin karşılaştırması.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { readStore, writeStore } from '../../js/core/identity.js';
import { bildir } from '../../js/core/bildirim.js';
import { h, initial, toast, confirmDialog, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import {
  DILLER, SORULAR, dilById, puanla, yuzdeler, birincil, siralama, karsilastir, ilerleme,
  ilgiEki, oneriBasligi, gecerliPuanlar, taslakCoz,
} from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'sevgidili', title: 'Sevgi Dili Testi', tab: 'daha' });
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'sd-wrap' }, h('p', { class: 'muted', role: 'status' }, 'Hazırlanıyor…')));

const [col, profil] = await Promise.all([
  openCollection(room, 'sevgidili'),
  openProfil(room).catch((e) => { console.warn('[sevgidili] profil açılamadı', e); return null; }),
]);

const N = SORULAR.length;
const TASLAK = `bizim.sevgidili.taslak.${roomId}.${me.clientId}`;
const ONAY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || '';
const yuzde = (n) => `%${n}`;

let cevaplar = taslakCoz(readStore('local', TASLAK));
let ekran = benimSonuc() ? 'sonuc' : 'giris';
let soruNo = 0;
let partnerVardi = !!partnerSonuc();

function taslakYaz() {
  writeStore('local', TASLAK, cevaplar.some(Boolean) ? JSON.stringify(cevaplar) : null);
}

function benimSonuc() {
  const d = col.get(me.clientId);
  return d && gecerliPuanlar(d.data?.puanlar) ? d.data : null;
}

/** Benden farklı, en son güncellenen geçerli sonuç. */
function partnerSonuc() {
  const digerleri = col.all()
    .filter((d) => d.id !== me.clientId && gecerliPuanlar(d.data?.puanlar))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return digerleri[0]?.data || null;
}

const dilAdlari = (ids) => ids.map((id) => dilById(id)?.ad).filter(Boolean);
const veIle = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} ve ${list[list.length - 1]}` : list[0] || '');

function ekranKur(...cocuklar) {
  const ekranEl = h('section', { class: 'sd-ekran' }, ...cocuklar);
  app.replaceChildren(h('div', { class: 'sd-wrap' }, ekranEl));
  return ekranEl;
}

function odakla(el) {
  if (!el) return;
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

// ---------- Giriş ----------
function cizGiris() {
  const p = partnerSonuc();
  const pAd = partnerAdi();
  const nerede = ilerleme(cevaplar, N);
  const yarim = nerede > 0 && nerede < N;
  const baslik = h('h2', { class: 'sd-buyuk' }, 'Sevgiyi en çok ', h('em', {}, 'nasıl'), ' hissediyorsun?');
  ekranKur(
    h('div', { class: 'sd-giris-bas' },
      baslik,
      h('p', { class: 'subtitle' }, `${N} kısa soru, yaklaşık 4 dakika. Her soruda sana daha çok sevildiğini hissettireni seç. Doğru ya da yanlış yok.`)),
    h('ul', { class: 'sd-diller', 'aria-label': 'Beş sevgi dili' },
      DILLER.map((d) => h('li', { dataset: { dil: d.id } }, h('span', { 'aria-hidden': 'true' }, d.emoji), d.ad))),
    h('p', { class: 'sd-not', dataset: { ton: p ? 'hazir' : '' } },
      h('span', { class: 'avatar partner', 'aria-hidden': 'true' }, initial(pAd)),
      h('span', {}, p
        ? `${pAd} testi çözdü 💗 Sen de çöz, sonuçlarınızı yan yana görün.`
        : `${pAd} henüz çözmedi. İkiniz de çözünce karşılaştırmanız açılır.`)),
    h('div', { class: 'sd-eylemler' },
      h('button', { type: 'button', class: 'btn primary wide', onclick: () => testeBasla(yarim ? nerede : 0) },
        yarim ? `Kaldığın yerden devam et (${nerede}/${N})` : 'Teste başla'),
      yarim ? h('button', { type: 'button', class: 'btn ghost wide', onclick: () => { cevaplar = taslakCoz(null); taslakYaz(); testeBasla(0); } }, 'Baştan başla') : null,
      benimSonuc() ? h('button', { type: 'button', class: 'btn ghost wide', onclick: () => { ekran = 'sonuc'; ciz(); } }, 'Son sonucuma dön') : null));
}

// ---------- Test ----------
function testeBasla(i) {
  ekran = 'test';
  soruNo = Math.max(0, Math.min(N - 1, i));
  cizTest(true);
}

let kilit = false; // seçimden sonra kısa bekleme sırasında çift dokunmayı yut
function sec(harf) {
  if (kilit) return;
  kilit = true;
  cevaplar[soruNo] = harf;
  taslakYaz();
  sfx('tap');
  for (const b of app.querySelectorAll('.sd-secenek')) b.setAttribute('aria-pressed', String(b.dataset.harf === harf));
  setTimeout(() => {
    kilit = false;
    if (soruNo < N - 1) { soruNo++; cizTest(true); return; }
    const bos = ilerleme(cevaplar, N);
    if (bos >= N) bitir();
    else { soruNo = bos; cizTest(true); }
  }, 220);
}

function cizTest(odak) {
  const q = SORULAR[soruNo];
  const cevapli = cevaplar.filter(Boolean).length;
  const secenek = (harf) => h('button', {
    type: 'button', class: 'sd-secenek', dataset: { harf }, 'aria-pressed': String(cevaplar[soruNo] === harf),
    onclick: () => sec(harf),
  }, h('span', { class: 'sd-isaret', 'aria-hidden': 'true', html: ONAY_SVG }), h('span', {}, q[harf].metin));
  const soruBaslik = h('h2', { class: 'sd-soru', id: 'sd-soru' }, 'Hangisi sana daha çok sevildiğini hissettirir?');
  const hepsi = ilerleme(cevaplar, N) >= N;
  const ileri = hepsi
    ? h('button', { type: 'button', class: 'btn primary', onclick: bitir }, 'Sonucu gör')
    : cevaplar[soruNo] && soruNo < N - 1
      ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { soruNo++; cizTest(true); } }, 'İleri →')
      : null;
  ekranKur(
    h('div', { class: 'sd-ilerleme' },
      h('div', { class: 'sd-ilerleme-ust' },
        h('span', {}, 'Soru ', h('strong', {}, `${soruNo + 1} / ${N}`)),
        h('span', {}, `${cevapli} cevap`)),
      h('div', {
        class: 'sd-iz', role: 'progressbar', 'aria-label': 'İlerleme',
        'aria-valuemin': '0', 'aria-valuemax': String(N), 'aria-valuenow': String(cevapli),
      }, h('span', { class: 'sd-iz-dolu', style: { '--w': String(cevapli / N) } }))),
    h('div', { class: 'sd-secenekler sd-gecis', role: 'group', 'aria-labelledby': 'sd-soru' },
      soruBaslik,
      secenek('a'),
      h('span', { class: 'sd-yada', 'aria-hidden': 'true' }, 'ya da'),
      secenek('b')),
    h('div', { class: 'sd-test-alt' },
      h('button', {
        type: 'button', class: 'btn ghost', disabled: soruNo === 0,
        onclick: () => { soruNo = Math.max(0, soruNo - 1); cizTest(true); },
      }, '← Geri'),
      ileri),
    h('button', {
      type: 'button', class: 'btn ghost sd-sonra',
      onclick: () => { ekran = benimSonuc() ? 'sonuc' : 'giris'; ciz(); },
    }, 'Sonra devam ederim'));
  if (odak) odakla(soruBaslik);
}

let bitiyor = false;
async function bitir() {
  if (bitiyor) return;
  bitiyor = true;
  try { await sonucuKaydet(); } finally { bitiyor = false; }
}

async function sonucuKaydet() {
  const puanlar = puanla(SORULAR, cevaplar);
  const partnerDahaOnce = !!partnerSonuc();
  try {
    await col.put({ puanlar, at: new Date().toISOString() }, me.clientId);
  } catch (err) {
    toast(err?.message || 'Sonuç kaydedilemedi. Biraz sonra yeniden dene.');
    return;
  }
  cevaplar = taslakCoz(null);
  taslakYaz();
  ekran = 'sonuc';
  sfx('win');
  ciz();
  odakla(app.querySelector('.sd-ekran h2'));
  if (!partnerDahaOnce) {
    bildir(roomId, {
      tur: 'soru', baslik: 'Sevgi dili testi',
      metin: `${benAdi() || 'Sevgilin'} testi çözdü. Sıra sende 💗`, url: 'sayfalar/sevgi-dili/',
    }).catch((e) => console.warn('[sevgidili] bildirim gönderilemedi', e));
  }
}

// ---------- Sonuç ----------
function cubuklar(puanlar, kim) {
  const y = yuzdeler(puanlar);
  const ilk = birincil(puanlar);
  return h('ul', { class: 'sd-cubuklar', 'aria-label': kim === 'ben' ? 'Senin dağılımın' : `${ilgiEki(partnerAdi())} dağılımı` },
    siralama(puanlar).map((id, i) => {
      const d = dilById(id);
      return h('li', { class: 'sd-cubuk', dataset: { birincil: String(ilk.includes(id)), kim } },
        h('div', { class: 'sd-cubuk-ust' },
          h('span', {}, h('span', { 'aria-hidden': 'true' }, `${d.emoji} `), d.ad),
          h('span', { class: 'sd-yuzde' }, yuzde(y[id]))),
        h('div', { class: 'sd-bar-iz', 'aria-hidden': 'true' },
          h('span', { class: 'sd-bar-dolu', style: { '--w': String(y[id] / 100), '--i': String(i) } })));
    }));
}

function oneriKarti(ad, dilId, kim) {
  const d = dilById(dilId);
  return h('section', { class: 'sd-oneri', dataset: { kim } },
    h('h3', {}, kim === 'ben' ? `${partnerAdi()} için ipuçları` : oneriBasligi(ad, dilId)),
    h('p', { class: 'muted' }, kim === 'ben'
      ? `${partnerAdi()} bunları yaparsa kalbine dokunur:`
      : 'Bunları denersen kalbine dokunursun:'),
    h('ol', {}, d.oneriler.map((o) => h('li', {}, o))));
}

function karsilastirma(ben, p) {
  const pAd = partnerAdi();
  const k = karsilastir(ben.puanlar, p.puanlar);
  const ozet = [];
  if (k.ortak.length) {
    ozet.push(`İkinizin de birincil dili aynı: ${veIle(dilAdlari(k.ortak))} 💞`);
  } else {
    ozet.push(`Senin dilin ${veIle(dilAdlari(k.benBirincil))}, ${ilgiEki(pAd)} dili ${veIle(dilAdlari(k.partnerBirincil))}.`);
  }
  const fark = k.satirlar.find((s) => s.dil === k.enFarkli);
  if (fark && Math.abs(fark.ben - fark.partner) >= 10) {
    ozet.push(`En çok ayrıştığınız dil ${dilById(k.enFarkli).ad}: sende ${yuzde(fark.ben)}, ${pAd} için ${yuzde(fark.partner)}. Burada birbirinizi biraz daha dinleyin.`);
  }
  return h('section', { class: 'sd-bolum', 'aria-labelledby': 'sd-kars-baslik' },
    h('h2', { id: 'sd-kars-baslik' }, 'Karşılaştırma'),
    h('ul', { class: 'sd-ozetler' }, ozet.map((t) => h('li', {}, t))),
    h('div', { class: 'card' },
      h('p', { class: 'sd-anahtar', 'aria-hidden': 'true' },
        h('span', {}, h('i', { dataset: { kim: 'ben' } }), 'Sen'),
        h('span', {}, h('i', { dataset: { kim: 'partner' } }), pAd)),
      h('ul', { class: 'sd-cubuklar', 'aria-label': 'Dil dil karşılaştırma' },
        k.satirlar.map((s, i) => {
          const d = dilById(s.dil);
          const satir = (kim, ad, val) => h('div', { class: 'sd-satir', dataset: { kim } },
            h('span', { class: 'sd-satir-ad' }, ad),
            h('span', { class: 'sd-bar-iz', 'aria-hidden': 'true' },
              h('span', { class: 'sd-bar-dolu', style: { '--w': String(val / 100), '--i': String(i) } })),
            h('span', { class: 'sd-yuzde' }, yuzde(val)));
          return h('li', { class: 'sd-kars' },
            h('span', { class: 'sd-kars-ad' }, h('span', { 'aria-hidden': 'true' }, `${d.emoji} `), d.ad),
            satir('ben', 'Sen', s.ben),
            satir('partner', pAd, s.partner));
        }))),
    k.partnerBirincil.map((id) => oneriKarti(pAd, id, 'partner')));
}

function cizSonuc() {
  const ben = benimSonuc();
  if (!ben) { ekran = 'giris'; cizGiris(); return; }
  const p = partnerSonuc();
  const pAd = partnerAdi();
  const ilk = birincil(ben.puanlar);
  const anaDil = dilById(ilk[0]);
  const ortak = ilk.length > 1;

  const kahraman = h('div', { class: 'card sd-kahraman' },
    h('h2', { class: 'sd-buyuk' }, ortak ? 'Senin dillerin ' : 'Senin dilin ', h('em', {}, veIle(dilAdlari(ilk)))),
    h('p', { class: 'sd-ozet' }, ortak ? 'Bu dillerde puanın eşit; ikisi de sana çok iyi geliyor.' : anaDil.ozet));

  ekranKur(
    kahraman,
    h('section', { class: 'sd-bolum', 'aria-labelledby': 'sd-dagilim' },
      h('h2', { id: 'sd-dagilim' }, 'Dağılımın'),
      cubuklar(ben.puanlar, 'ben')),
    oneriKarti(pAd, ilk[0], 'ben'),
    p
      ? karsilastirma(ben, p)
      : h('p', { class: 'sd-not' },
        h('span', { class: 'avatar partner', 'aria-hidden': 'true' }, initial(pAd)),
        h('span', {}, `${pAd} henüz çözmedi. Çözünce karşılaştırmanız burada açılır.`)),
    h('details', { class: 'sd-tum' },
      h('summary', {}, 'Beş dilin önerileri'),
      h('ul', { class: 'sd-tum-liste' }, DILLER.map((d) => h('li', {},
        h('h4', {}, `${d.emoji} ${d.ad}`),
        h('ul', {}, d.oneriler.map((o) => h('li', {}, o))))))),
    h('div', { class: 'sd-eylemler' },
      h('button', { type: 'button', class: 'btn ghost wide', onclick: yenidenCoz }, 'Testi yeniden çöz')));
}

async function yenidenCoz() {
  const ok = await confirmDialog('Testi baştan çözmek ister misin? Yeni sonucun eskisinin yerine geçer.', { ok: 'Baştan çöz', cancel: 'Vazgeç' });
  if (!ok) return;
  cevaplar = taslakCoz(null);
  taslakYaz();
  testeBasla(0);
}

function ciz() {
  if (ekran === 'test') return; // test sırasında ekranı bozma
  if (ekran === 'sonuc') cizSonuc();
  else cizGiris();
}

// ---------- Canlı ----------
col.on('change', () => {
  const p = !!partnerSonuc();
  if (p && !partnerVardi) {
    sfx('pop');
    toast(`${partnerAdi()} testi bitirdi 💗`);
  }
  partnerVardi = p;
  ciz();
});
let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Sonucun kaydedilip gönderilecek.');
});
profil?.on('change', ciz);

ciz();
