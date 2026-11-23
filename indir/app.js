// İndirme sayfası: Android APK ve iPhone ana ekran kurulumu yan yana. Cihaza uygun kart öne gelir.
import { iosMu, standaloneMu } from '../js/core/pwa.js';
import { IOS_ADIMLARI } from '../sayfalar/daha/mantik.js';

const PAYLAS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 14.5V4M8 7.5 12 3.5l4 4"/><path d="M5.5 11.5v7A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-7"/></svg>';

const ua = navigator.userAgent;
const ios = iosMu(ua, navigator.maxTouchPoints || 0);
const android = /Android/i.test(ua);
const safariDisi = ios && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);

// iPhone adımları: Daha sayfasıyla aynı metin; ilk adımın yanında Paylaş simgesi.
const liste = document.getElementById('ios-adimlar');
IOS_ADIMLARI.forEach((metin, i) => {
  const li = document.createElement('li');
  li.textContent = metin;
  if (i === 0) {
    const ik = document.createElement('span');
    ik.className = 'indir-adim-ikon';
    ik.innerHTML = PAYLAS_SVG;
    li.append(' ', ik);
  }
  liste.append(li);
});

// Cihaza uygun kart önce ve vurgulu.
const kartlar = document.querySelector('.indir-kartlar');
const android_ = document.getElementById('android');
const iphone = document.getElementById('iphone');
if (ios) {
  kartlar.prepend(iphone);
  iphone.classList.add('onerilen');
  android_.classList.add('ikincil');
} else if (android) {
  android_.classList.add('onerilen');
  iphone.classList.add('ikincil');
}
if (safariDisi) document.getElementById('ios-safari').hidden = false;
if (standaloneMu()) document.getElementById('kurulu').hidden = false;

// Son APK'nın sürümü (pages.yml yazar). Yoksa sessizce varsayılan metin kalır.
fetch('./surum.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null))
  .then((s) => {
    if (!s?.surum) return;
    const tarih = s.tarih ? new Date(s.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    document.getElementById('apk-surum').textContent = `Sürüm ${s.surum}${tarih ? ` · ${tarih}` : ''}`;
  })
  .catch(() => {});
