// Anı Kitabı görünümü: kapak, aylara göre anılar, seçilmiş mesajlar, özel günler, kapanış. Yazdırılabilir (style.css @media print).
import { h, icon, toast } from '../../js/core/ui.js';
import { loadPhoto } from '../../js/core/storage.js';
import { isNative, disariAc } from '../../js/core/mobil.js';
import { pageUrl } from '../../js/core/identity.js';
import { toDay } from '../../js/core/gunler.js';
import { gunYazi } from '../anilar/mantik.js';
import { sayiYaz } from './mantik.js';
import { simgeSvg } from './simgeler.js';
import {
  kitapAnilari, kitapFotolari, seciliMesajlar, kitapOzelGunleri, kapakSatiri, kapanisSatiri, yazdirmaYolu,
} from './kitap-mantik.js';

const ES_ZAMANLI = 4; // aynı anda indirilen fotoğraf
const BOYLAR = ['A5', 'A4'];
const BOY_KEY = 'bizim.kitap.boy';

const okuBoy = () => { try { return BOYLAR.includes(localStorage.getItem(BOY_KEY)) ? localStorage.getItem(BOY_KEY) : 'A5'; } catch { return 'A5'; } };
const yazBoy = (b) => { try { localStorage.setItem(BOY_KEY, b); } catch { /* özel pencere */ } };

/**
 * veri = { yil, ozet, kisiler: [{ id, ad }], mesajlar, anilar, gunler, kisiDocs, baslangic }
 * kapat() kitaptan çıkar. -> { el, temizle() }
 */
export function kitapKur(veri, { kapat }) {
  const { yil, ozet, kisiler } = veri;
  const adlar = `${kisiler[0]?.ad || 'Sen'} & ${kisiler[1]?.ad || 'Sevgilin'}`;
  const aylar = kitapAnilari(veri.anilar, yil);
  const secili = seciliMesajlar(veri.mesajlar, yil, { kisiler });
  const gunler = kitapOzelGunleri({ gunler: veri.gunler, kisiler: veri.kisiDocs, baslangic: veri.baslangic, yil, bugun: toDay(new Date()) });
  const yol = yazdirmaYolu({ native: isNative(), printVar: typeof window.print === 'function' });

  // ---------- Araç çubuğu (yalnız ekranda) ----------
  let boy = okuBoy();
  const sayfaStili = h('style', { id: 'kt-sayfa-boyu' });
  const boyUygula = () => {
    sayfaStili.textContent = `@page { size: ${boy} portrait; margin: ${boy === 'A4' ? '16mm 16mm 18mm' : '12mm 12mm 14mm'}; }`;
    kitap.dataset.boy = boy;
    [...boySec.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.boy === boy)));
  };
  const boySec = h('div', { class: 'seg kt-boy', role: 'group', 'aria-label': 'Kâğıt boyu' },
    BOYLAR.map((b) => h('button', { type: 'button', dataset: { boy: b }, onclick: () => { boy = b; yazBoy(b); boyUygula(); } }, b)));
  const durum = h('p', { class: 'kt-durum', role: 'status' });
  const anaBtn = h('button', { type: 'button', class: 'btn primary wide' });
  if (yol === 'yazdir') {
    anaBtn.append(h('span', { class: 'kt-btn-ikon', html: simgeSvg('yazici', 2) }), 'Yazdır / PDF olarak kaydet');
    anaBtn.disabled = true;
    anaBtn.addEventListener('click', () => window.print());
  } else {
    anaBtn.append(h('span', { class: 'kt-btn-ikon', html: simgeSvg('paylas', 2) }), 'Tarayıcıda aç');
    anaBtn.addEventListener('click', () => {
      disariAc(pageUrl('sayfalar/yilimiz/', { kitap: 1, yil })).catch((e) => { console.error(e); toast('Tarayıcı açılamadı.'); });
    });
  }
  const arac = h('div', { class: 'kt-arac' },
    h('div', { class: 'kt-arac-ust' },
      h('button', { type: 'button', class: 'btn ghost kt-geri', onclick: () => kapat() }, icon('back'), 'Hikâyeye dön'),
      boySec),
    durum, anaBtn);

  // ---------- Sayfalar ----------
  const sayfa = (cls, ...cocuk) => h('article', { class: `kt-sayfa ${cls}` }, ...cocuk);
  const motif = (ad) => h('span', { class: 'kt-motif', html: simgeSvg(ad, 1.1) });

  const kapakGun = kapakSatiri(ozet);
  const kapak = sayfa('kt-kapak',
    motif('kalp'),
    h('div', { class: 'kt-kapak-govde' },
      h('h1', { class: 'kt-kapak-ad' }, kisiler[0]?.ad || 'Sen', h('span', { class: 'kt-amp' }, ' & '), kisiler[1]?.ad || 'Sevgilin'),
      h('p', { class: 'kt-kapak-yil' }, String(yil)),
      kapakGun ? h('p', { class: 'kt-kapak-gun' }, kapakGun) : null),
    h('p', { class: 'kt-kapak-alt' }, 'Anı Kitabı · Biz İkimiz'));

  const imgler = new Map(); // url -> [figure]
  const fotoEl = (url) => {
    const fig = h('figure', { class: 'kt-foto' }, h('img', { alt: '', decoding: 'async' }));
    if (!imgler.has(url)) imgler.set(url, []);
    imgler.get(url).push(fig);
    return fig;
  };
  const aniEl = (a) => h('section', { class: 'kt-ani' },
    h('h3', { class: 'kt-ani-baslik' }, a.baslik),
    h('p', { class: 'kt-ani-meta' }, [a.tarihYazi, a.yer].filter(Boolean).join(' · ')),
    a.fotolar.length ? h('div', { class: 'kt-fotolar', dataset: { n: String(a.fotolar.length) } }, a.fotolar.map(fotoEl)) : null,
    a.not ? h('p', { class: 'kt-ani-not' }, a.not) : null);
  const aySayfalari = aylar.map((m) => sayfa('kt-ay',
    h('header', { class: 'kt-ay-bas' },
      h('h2', { class: 'kt-ay-ad' }, m.ad),
      h('p', { class: 'kt-ay-say' }, `${sayiYaz(m.anilar.length)} anı`)),
    h('div', { class: 'kt-anilar' }, m.anilar.map(aniEl))));
  const anisiz = aylar.length ? null : h('div', { class: 'kt-bos card' },
    h('span', { class: 'kt-bos-ikon', html: simgeSvg('foto', 1.5) }),
    h('p', {}, `${yil} için henüz anı yok. Anılar'a eklediğiniz her an burada bir sayfa olur.`),
    h('a', { class: 'btn small', href: pageUrl('sayfalar/anilar/') }, 'Anı ekle'));

  const mesajSayfasi = secili.tur ? sayfa('kt-mesajlar',
    h('header', { class: 'kt-bolum-bas' },
      h('h2', {}, secili.tur === 'yildiz' ? 'Saklamaya değer bulduklarınız' : 'Birbirinize yazdıklarınız'),
      h('p', {}, secili.tur === 'yildiz' ? 'Yıldızladığınız mesajlar.' : `Yılın en uzun ${sayiYaz(secili.mesajlar.length)} mesajı.`)),
    h('ol', { class: 'kt-mesaj-liste', role: 'list' }, secili.mesajlar.map((m) => h('li', { class: 'kt-mesaj' },
      h('blockquote', {}, h('p', {}, m.metin)),
      h('p', { class: 'kt-mesaj-kim' }, [m.ad, m.tarihYazi].filter(Boolean).join(' · ')))))) : null;

  const gunSayfasi = gunler.length ? sayfa('kt-gunler',
    h('header', { class: 'kt-bolum-bas' }, h('h2', {}, 'Özel günleriniz'), h('p', {}, `${yil} takviminden.`)),
    h('ol', { class: 'kt-gun-liste', role: 'list' }, gunler.map((g) => h('li', {},
      h('span', { class: 'kt-gun-tarih' }, g.tarihYazi),
      h('span', { class: 'kt-gun-emoji', 'aria-hidden': 'true' }, g.emoji),
      h('span', { class: 'kt-gun-ad' }, g.baslik, g.ek ? h('span', { class: 'kt-gun-ek' }, ` · ${g.ek}`) : null))))) : null;

  const dokum = kapanisSatiri(ozet);
  const kapanis = sayfa('kt-kapanis',
    motif('kalp'),
    h('div', { class: 'kt-kapanis-govde' },
      h('h2', {}, 'Nice yıllara, birlikte.'),
      dokum ? h('p', { class: 'kt-kapanis-dokum' }, dokum) : null,
      h('p', { class: 'kt-kapanis-imza' }, adlar)),
    h('p', { class: 'kt-kapak-alt' }, `Biz İkimiz · Hazırlandığı gün: ${gunYazi(toDay(new Date()))}`));

  const kitap = h('section', { class: 'kt', 'aria-label': `${yil} Anı Kitabı` },
    arac, anisiz,
    h('div', { class: 'kt-sayfalar' }, kapak, ...aySayfalari, mesajSayfasi, gunSayfasi, kapanis));
  document.head.append(sayfaStili);
  boyUygula();

  // ---------- Fotoğraflar: hepsi yüklenmeden yazdırma başlamaz ----------
  const urls = kitapFotolari(aylar);
  const nesneler = [];
  let iptal = false;
  let bitti = 0;
  let hata = 0;
  const durumYaz = () => {
    if (yol === 'disari') {
      durum.textContent = 'Uygulamanın içinden yazdırılamıyor. Kitabı Chrome\'da açın; oradan yazdırın ya da PDF olarak kaydedin.';
      return;
    }
    if (bitti < urls.length) { durum.textContent = `Fotoğraflar hazırlanıyor… ${bitti} / ${urls.length}`; return; }
    durum.textContent = hata ? `Kitabınız hazır. ${hata} fotoğraf yüklenemedi; onlarsız basılacak.` : 'Kitabınız hazır.';
    anaBtn.disabled = false;
  };
  async function tekFoto(url) {
    try {
      const blob = await loadPhoto(url);
      if (iptal) return;
      const src = URL.createObjectURL(blob);
      nesneler.push(src);
      await Promise.all(imgler.get(url).map((fig) => {
        const img = fig.firstChild;
        img.src = src;
        return img.decode();
      }));
    } catch (e) {
      if (iptal) return;
      console.warn('[kitap] fotoğraf', url, e);
      hata++;
      for (const fig of imgler.get(url)) {
        fig.classList.add('hata');
        fig.replaceChildren(h('figcaption', {}, 'Fotoğraf yüklenemedi.'));
      }
    }
    bitti++;
    if (!iptal) durumYaz();
  }
  let sira = 0;
  const isci = async () => { while (!iptal && sira < urls.length) await tekFoto(urls[sira++]); };
  durumYaz();
  Promise.all(Array.from({ length: Math.min(ES_ZAMANLI, urls.length) }, isci)).catch((e) => console.error(e));

  // ---------- Yazdırırken açık tema (kâğıt beyaz; koyu tema yazıyı soldurur) ----------
  const kok = document.documentElement;
  let eskiMod = null;
  const once = () => { eskiMod = kok.getAttribute('data-mod'); kok.setAttribute('data-mod', 'acik'); };
  const sonra = () => { if (eskiMod === null) kok.removeAttribute('data-mod'); else kok.setAttribute('data-mod', eskiMod); };
  window.addEventListener('beforeprint', once);
  window.addEventListener('afterprint', sonra);

  return {
    el: kitap,
    temizle() {
      iptal = true;
      window.removeEventListener('beforeprint', once);
      window.removeEventListener('afterprint', sonra);
      sayfaStili.remove();
      for (const u of nesneler) URL.revokeObjectURL(u);
    },
  };
}
