// Yavrumuz mini oyunları: ortak çerçeve.
// Saf kısım (Node'da test edilir): OYUNLAR kaydı, skorJeton.
// DOM kısmı: oyunAc(kok, { oyun, onBitti, onCik }) giriş → 3-2-1 → oyun → sonuç akışını kurar.
// Çerçeve jeton YAZMAZ; bitişte onBitti({ oyun, skor, jeton }) çağırır (bağlayan jeton.js jetonKazan ile yazar).
// Ekran modülü sözleşmesi (<ad>-ekran.js):
//   kur({ sahne, tohum, azHareket, duyur, bebekSvg }) -> { adim(dtMs) -> durum, temizle() }
//   durum = { skor, bitti, ilerleme: 0..1, kalanMs? | tur?, turSayisi? }
import { h } from '../../../js/core/ui.js';
import { sfx } from '../../../js/core/sound.js';
import { newSeed } from '../../../games/hafiza/rng.js';

export const JETON_SINIRI = 30; // oyun başı en çok

/** Oyun kaydı. oran: skor → jeton çarpanı (iyi bir oyun ~25 jeton). */
export const OYUNLAR = Object.freeze({
  balon: Object.freeze({
    ad: 'Balon Patlat', ozet: 'Yükselen balonlara dokun.', oran: 0.5,
    ipucu: ['Balona dokun: +1', 'Altın balon: +5', 'Dikenli balona dokunma: −3'],
    ekran: () => import('./balon-ekran.js'),
  }),
  top: Object.freeze({
    ad: 'Top Yakala', ozet: 'Düşen oyuncakları sepetle topla.', oran: 0.5,
    ipucu: ['Sepeti parmağınla kaydır', 'Yıldız: +3', 'Art arda 5 yakala: +2'],
    ekran: () => import('./top-ekran.js'),
  }),
  cee: Object.freeze({
    ad: 'Ce-e', ozet: 'Yavru saklanıyor; battaniyeleri izle.', oran: 1,
    ipucu: ['Yavrunun battaniyesini aklında tut', 'Battaniyeler karışır, gözünü ayırma', 'Doğru bul: tur ilerledikçe daha çok puan'],
    ekran: () => import('./cee-ekran.js'),
  }),
  ninni: Object.freeze({
    ad: 'Ninni Ritmi', ozet: 'Yanan yıldızlara sırayla dokun.', oran: 0.5,
    ipucu: ['Ninniyi dinle, yıldızları izle', 'Aynı sırayla dokun; ninni uzar', 'Üç bulut ayı örterse oyun biter'],
    ekran: () => import('./ninni-ekran.js'),
  }),
});

/** Skor → jeton. Bilinmeyen oyun ya da skor ≤ 0: 0. Pozitif skor en az 1, en çok JETON_SINIRI. */
export function skorJeton(oyun, skor) {
  const o = Object.hasOwn(OYUNLAR, oyun) ? OYUNLAR[oyun] : null;
  if (!o || !Number.isFinite(skor) || skor <= 0) return 0;
  return Math.min(JETON_SINIRI, Math.max(1, Math.floor(skor * o.oran)));
}

/** Sonuç başlığı (saf). */
export function sonucBasligi(oyun, jeton) {
  if (jeton >= JETON_SINIRI * 0.8) return 'Muhteşem!';
  if (jeton >= JETON_SINIRI * 0.4) return 'Çok güzel!';
  if (jeton > 0) return 'Yavru bayıldı!';
  return 'Bir daha deneyelim mi?';
}

// ---------- DOM ----------

let stilEklendi = false;
function stilEkle() {
  if (stilEklendi || document.querySelector('link[data-oy-stil]')) return;
  stilEklendi = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./oyun.css', import.meta.url).href, 'data-oy-stil': '' }));
}

const azHareketMi = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * kok içine oyunu kurar. -> { kapat() }
 * onBitti({ oyun, skor, jeton }): her biten oyunda bir kez. Yarıda çıkışta çağrılmaz.
 * onCik(): oyuncu "Çık" ya da "Kapat" dedi (Escape de). Çerçeve kendini kaldırır.
 * bebekSvg: Ce-e'de saklanan bebeğin SVG metni (güvenilir, cizim.js yavruSvg); yoksa yerleşik çizim.
 */
export function oyunAc(kok, { oyun, tohum, onBitti, onCik, azHareket, bebekSvg } = {}) {
  const tanim = Object.hasOwn(OYUNLAR, oyun) ? OYUNLAR[oyun] : null;
  if (!tanim) throw new Error(`Bilinmeyen oyun: ${oyun}`);
  stilEkle();
  const az = azHareket ?? azHareketMi();
  const modul = tanim.ekran();

  const skorEl = h('b', { class: 'oy-skor-n' }, '0');
  const sayacEl = h('span', { class: 'oy-sayac' });
  const canli = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const alan = h('div', { class: 'oy-alan', tabindex: '-1', 'aria-label': `${tanim.ad} oyun alanı` });
  const kaplama = h('div', { class: 'oy-kaplama' });
  const cikBtn = h('button', { type: 'button', class: 'btn ghost small oy-cik', 'aria-label': 'Oyundan çık', onClick: () => cik() },
    h('span', { 'aria-hidden': 'true', class: 'oy-ok' }, '←'), 'Çık');
  const kutu = h('section', { class: 'oy', 'data-oyun': oyun, 'data-az': az ? '1' : null, 'aria-label': tanim.ad },
    h('div', { class: 'oy-ust' },
      cikBtn,
      h('span', { class: 'oy-baslik' }, tanim.ad),
      h('span', { class: 'oy-skor' }, skorEl, h('span', { class: 'oy-skor-e' }, ' puan')),
      sayacEl),
    h('div', { class: 'oy-cubuk', 'aria-hidden': 'true' }, h('i')),
    h('div', { class: 'oy-govde' }, h('div', { class: 'oy-sahne' }, alan, kaplama)),
    canli);
  kok.append(kutu);

  let faz = 'giris';
  let ekran = null;
  let raf = 0;
  let son = 0;
  let zamanlayici = 0;
  let sonSkor = 0;
  let sonDuyuru = 0;
  let sonSaniye = -1;
  let kapandi = false;
  let taze = false; // hazırlanmış, henüz oynanmamış ekran var
  let hazir = null;

  const duyur = (metin) => { canli.textContent = metin; sonDuyuru = performance.now(); };

  function guncelle(d) {
    skorEl.textContent = String(d.skor);
    if (d.kalanMs != null) {
      const sn = Math.ceil(d.kalanMs / 1000);
      sayacEl.textContent = `${sn} sn`;
      if (faz === 'oyun' && sn !== sonSaniye && sn <= 3 && sn > 0) sfx('tick');
      sonSaniye = sn;
    } else if (d.tur != null) sayacEl.textContent = `Tur ${d.tur}/${d.turSayisi}`;
    kutu.style.setProperty('--oy-ilerleme', String(Math.min(1, Math.max(0, d.ilerleme ?? 0))));
    if (faz === 'oyun' && d.skor !== sonSkor && performance.now() - sonDuyuru > 3000) duyur(`Skor ${d.skor}`);
    sonSkor = d.skor;
  }

  async function hazirla() {
    const m = await modul;
    if (kapandi) return;
    ekran?.temizle();
    alan.replaceChildren();
    ekran = m.kur({ sahne: alan, tohum: tohum ?? newSeed(), azHareket: az, duyur, bebekSvg });
    tohum = undefined; // "Tekrar" yeni dizi alır
    taze = true;
    sonSkor = 0;
    sonSaniye = -1;
    guncelle(ekran.adim(0));
  }

  function kaplamaGoster(...icerik) {
    kaplama.replaceChildren(...icerik);
    kaplama.hidden = false;
  }

  function giris() {
    faz = 'giris';
    const basla = h('button', { type: 'button', class: 'btn primary wide oy-basla', onClick: () => sayim() }, 'Başla');
    kaplamaGoster(h('div', { class: 'oy-kart', role: 'group', 'aria-label': tanim.ad },
      h('h2', { class: 'oy-kart-baslik' }, tanim.ad),
      h('p', { class: 'oy-kart-ozet' }, tanim.ozet),
      h('ul', { class: 'oy-ipucu' }, tanim.ipucu.map((t) => h('li', {}, t))),
      basla));
    basla.focus({ preventScroll: true });
  }

  async function sayim() {
    if (faz === 'sayim' || faz === 'oyun') return;
    faz = 'sayim';
    await hazir;
    if (!taze) { hazir = hazirla(); await hazir; }
    if (kapandi || !ekran) return;
    taze = false;
    let n = 3;
    const sayi = h('span', { class: 'oy-sayi', 'aria-hidden': 'true' }, '3');
    kaplamaGoster(h('div', { class: 'oy-sayim' }, sayi));
    duyur('Hazır ol: 3, 2, 1');
    sfx('tick');
    const birSonraki = () => {
      n--;
      if (kapandi) return;
      if (n <= 0) { basla(); return; }
      sayi.textContent = String(n);
      sayi.style.animation = 'none';
      void sayi.offsetWidth; // animasyonu yeniden başlat
      sayi.style.animation = '';
      sfx('tick');
      zamanlayici = setTimeout(birSonraki, 520);
    };
    zamanlayici = setTimeout(birSonraki, 520);
  }

  function basla() {
    faz = 'oyun';
    kaplama.hidden = true;
    kaplama.replaceChildren();
    alan.focus({ preventScroll: true });
    duyur('Başladı');
    son = performance.now();
    raf = requestAnimationFrame(dongu);
  }

  function dongu(simdi) {
    if (kapandi || faz !== 'oyun') return;
    const dt = Math.min(50, Math.max(0, simdi - son)); // sekme arkadayken zaman birikmez
    son = simdi;
    const d = ekran.adim(dt);
    guncelle(d);
    if (d.bitti) bitir(d.skor);
    else raf = requestAnimationFrame(dongu);
  }

  function bitir(skor) {
    faz = 'sonuc';
    const jeton = skorJeton(oyun, skor);
    sfx(jeton > 0 ? 'win' : 'wrong');
    try { onBitti?.({ oyun, skor, jeton }); } catch (e) { console.warn('[oyun] onBitti', e); }
    const tekrar = h('button', { type: 'button', class: 'btn primary wide', onClick: () => sayim() }, 'Tekrar oyna');
    kaplamaGoster(h('div', { class: 'oy-kart oy-sonuc', role: 'group', 'aria-label': 'Oyun bitti' },
      h('h2', { class: 'oy-kart-baslik' }, sonucBasligi(oyun, jeton)),
      h('p', { class: 'oy-sonuc-skor' }, h('b', {}, String(skor)), ' puan'),
      h('p', { class: 'oy-jeton', 'data-sifir': jeton === 0 ? '1' : null },
        h('span', { class: 'oy-jeton-ikon', 'aria-hidden': 'true' }),
        jeton > 0 ? `+${jeton} jeton` : 'Bu sefer jeton yok'),
      jeton >= JETON_SINIRI ? h('p', { class: 'oy-kart-ozet' }, `Bir oyunda en çok ${JETON_SINIRI} jeton kazanılır.`) : null,
      h('div', { class: 'oy-dugmeler' },
        tekrar,
        h('button', { type: 'button', class: 'btn wide', onClick: () => cik() }, 'Kapat'))));
    duyur(`Oyun bitti. ${skor} puan, ${jeton} jeton.`);
    tekrar.focus({ preventScroll: true });
  }

  function durdur() {
    kapandi = true;
    cancelAnimationFrame(raf);
    clearTimeout(zamanlayici);
    ekran?.temizle();
    ekran = null;
    kutu.removeEventListener('keydown', tus);
    kutu.remove();
  }

  function cik() {
    if (kapandi) return;
    durdur();
    try { onCik?.(); } catch (e) { console.warn('[oyun] onCik', e); }
  }

  function tus(e) {
    if (e.key === 'Escape') { e.preventDefault(); cik(); }
  }
  kutu.addEventListener('keydown', tus);

  hazir = hazirla().catch((e) => console.error('[oyun] ekran yüklenemedi', e));
  giris();
  return { kapat: () => { if (!kapandi) durdur(); } };
}
