// Açılış kapısı (TALIMAT §5.4): odaya girmeden önce cihaz onayı. Onaylı değilse tam ekran "Onay bekleniyor";
// sayfa verisi yüklenmez. Çalışırken yetki giderse (bizim:uyelik 'yok' / 42501) aynı ekran açılır.
// Kullanım: bootPage, ana sayfa (hub.js) ve oyun sayfaları (ui.js mountShell) kapidanGec(roomId) çağırır.
// Üst kısım saf (Node'da test edilir); DOM yalnız tarayıcıda kurulur.
import { me, clearRoom, lobbyUrl, readStore, writeStore, setClientId, setName, setRoom } from './identity.js';
import { odaGiris, sonDurum, durumTazele, girisAcikMi, cihazAdi, anahtarYaz } from './uyelik.js';
import { kurtarmaTemizle } from './uyelik-mantik.js';
import { h, ICONS } from './ui.js';

const YOKLA_MS = 5000;
const YUKLENIYOR_MS = 400; // hızlı yanıtta "Bir saniye…" yanıp sönmesin

// ---------- Saf ----------

const ICERIK = {
  yukleniyor: { baslik: 'Bir saniye…', metin: 'Odanıza bağlanıyoruz.', eylemler: [], yokla: 0 },
  bekliyor: {
    baslik: 'Onay bekleniyor',
    metin: "Bu cihaz odaya katılmak için onay bekliyor. Sevgilin kendi telefonunda Ayarlar › Cihazlar'dan onaylasın.",
    not: 'Onay gelince bu sayfa kendiliğinden açılır.',
    eylemler: ['kurtarma', 'cik'],
    yokla: YOKLA_MS,
  },
  reddedildi: {
    baslik: 'İstek reddedildi',
    metin: 'Bu cihazın katılma isteği reddedildi.',
    eylemler: ['cik'],
    yokla: YOKLA_MS, // sevgilin sonradan onaylayabilir
  },
  cakisma: {
    baslik: 'Bu cihaz tanınmadı',
    metin: "Bu cihaz başka bir anahtarla kayıtlı. Kurtarma kodun varsa gir; yoksa sevgilin Ayarlar › Cihazlar'dan bu cihazın eski kaydını çıkarsın.",
    eylemler: ['kurtarma', 'cik'], // kurtarma kodu çakışmayı çözer (davet çözmez)
    yokla: YOKLA_MS, // eski kayıt çıkarılınca 'yok' olur
  },
  yok: {
    baslik: 'Odadan çıkarıldı',
    metin: 'Bu cihaz odadan çıkarıldı.',
    eylemler: ['yeniden', 'cik'],
    yokla: 0,
  },
  cevrimdisi: {
    baslik: 'Bağlanamadık',
    metin: 'Odanıza şu an ulaşamıyoruz. İnternet bağlantını kontrol et; bağlanınca kendiliğinden açılır.',
    eylemler: ['tekrar', 'cik'],
    yokla: YOKLA_MS,
  },
};

/** Durum → { baslik, metin, not?, eylemler: ('kurtarma'|'cik'|'yeniden'|'tekrar')[], yokla: ms } */
export function kapiIcerigi(durum) {
  return ICERIK[durum] || ICERIK.cevrimdisi;
}

// Davet linkiyle gelen kod (hub.js saklar), onaydan sonra silinir. Sekmeye özel.
const davetKey = (roomId) => `bizim.davet.${roomId}`;
export function bekleyenDavet(roomId) {
  return roomId ? readStore('session', davetKey(roomId)) : null;
}
export function davetSakla(roomId, kod) {
  if (roomId) writeStore('session', davetKey(roomId), kod || null);
}

/** Yapıştırılan davet/taşıma linki (identity.js parseYapistirilanLink) bu cihaza uygulanır; çağıran sayfayı yeniler. */
export function yapistirilanLinkiUygula(p) {
  if (p.kim) setClientId(p.kim);
  if (p.ad) setName(p.ad);
  if (p.anahtar) anahtarYaz(p.oda, p.anahtar);
  if (p.davet) davetSakla(p.oda, p.davet);
  setRoom(p.oda);
}

/** Yoklama aralığı. Çevrimdışında artan bekleme (5, 10, 20, 40 sn, en çok 60): sunucu hız sınırını zorlamasın. */
export function yoklaMs(durum, deneme = 0) {
  const ms = kapiIcerigi(durum).yokla;
  return durum === 'cevrimdisi' ? Math.min(60000, ms * 2 ** Math.max(0, deneme)) : ms;
}

// ---------- Akış ----------

const gecildi = new Set(); // bu sayfada kapıdan geçilen odalar
const izlenen = new Set();
let aktif = null; // { roomId, durum } — kapı açıkken
let kok = null;
let yoklaTimer = 0;
let deneme = 0; // art arda çevrimdışı yoklama sayısı

/**
 * Odaya giriş izni. Onaylıysa (ya da eski sunucu) sonucu döndürür; önbellekte onay varsa anında döner ve
 * arkada durumu tazeler. Onaylı değilse kapı ekranını açar ve hiç çözülmez (onay gelince sayfa yenilenir).
 */
export async function kapidanGec(roomId) {
  if (!roomId) return null;
  kapiIzle(roomId);
  if (gecildi.has(roomId)) return sonDurum(roomId);
  const once = sonDurum(roomId);
  if (girisAcikMi(once)) {
    gecildi.add(roomId);
    davetSakla(roomId, null);
    durumTazele(roomId).catch(() => {});
    return once;
  }
  const yuk = setTimeout(() => kapiGoster(roomId, { durum: 'yukleniyor' }), YUKLENIYOR_MS);
  const s = await odaGiris(roomId, { davet: bekleyenDavet(roomId) });
  clearTimeout(yuk);
  if (girisAcikMi(s)) {
    gecildi.add(roomId);
    davetSakla(roomId, null);
    kapiKapat();
    return s;
  }
  kapiGoster(roomId, s);
  return new Promise(() => {});
}

/** Çalışırken üyelik değişimini izler: erişim giderse kapı açılır; kapı açıkken onay gelirse sayfa yenilenir. */
export function kapiIzle(roomId) {
  const w = globalThis.window;
  if (!roomId || izlenen.has(roomId) || !w || typeof w.addEventListener !== 'function') return;
  izlenen.add(roomId);
  w.addEventListener('bizim:uyelik', (e) => {
    const d = e?.detail;
    if (!d || d.roomId !== roomId) return;
    if (!girisAcikMi(d)) kapiGoster(roomId, d);
    else if (aktif && aktif.roomId === roomId && aktif.durum !== 'yukleniyor') yenile(roomId);
  });
}

function yenile(roomId) {
  davetSakla(roomId, null);
  clearTimeout(yoklaTimer);
  location.reload();
}

function odadanCik() {
  clearRoom(); // anahtar kalır: geri dönünce aynı cihaz kaydı kullanılır (çakışma olmaz)
  location.replace(lobbyUrl());
}

/** Yeniden dener (oda_katil). Açıldıysa sayfayı yeniler, değilse ekranı günceller. */
async function yenidenDene(roomId, ek = {}) {
  const s = await odaGiris(roomId, { davet: bekleyenDavet(roomId), ...ek });
  if (girisAcikMi(s)) {
    yenile(roomId);
    return s;
  }
  kapiGoster(roomId, s); // durum aynıysa ekran (ve formdaki hata) olduğu gibi kalır
  return s;
}

function yoklamaKur(roomId, durum) {
  clearTimeout(yoklaTimer);
  const ms = yoklaMs(durum, durum === 'cevrimdisi' ? deneme : 0);
  if (!ms) return;
  yoklaTimer = setTimeout(async () => {
    if (!aktif || aktif.roomId !== roomId) return;
    if (document.visibilityState === 'visible') {
      if (aktif.durum === 'cevrimdisi') {
        deneme++;
        await yenidenDene(roomId);
      } else {
        await durumTazele(roomId); // değişirse 'bizim:uyelik' olayı ekranı günceller ya da sayfayı yeniler
      }
    }
    if (aktif && aktif.roomId === roomId) yoklamaKur(roomId, aktif.durum);
  }, ms);
}

// ---------- DOM ----------

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const SIMGE = {
  // iki cihaz ve aralarında kalp: onay bekleyen bağ
  bekliyor: `<svg viewBox="0 0 64 40" ${STROKE}><rect x="3" y="5" width="17" height="30" rx="4"/><path d="M9.5 30.5h4"/><rect x="44" y="5" width="17" height="30" rx="4"/><path d="M50.5 30.5h4"/><path class="kapi-kalp" d="M32 26.5c-.3 0-.5-.1-.7-.3-2.9-2.4-5.1-4.3-5.1-6.8 0-1.7 1.3-3.1 3-3.1 1.1 0 2.1.5 2.8 1.4.7-.9 1.7-1.4 2.8-1.4 1.7 0 3 1.4 3 3.1 0 2.5-2.2 4.4-5.1 6.8-.2.2-.4.3-.7.3z"/><path d="M23.5 20h1.5M39 20h1.5" stroke-dasharray="0.1 3.4"/></svg>`,
  reddedildi: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6m0-6-6 6"/></svg>`,
  cakisma: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="8" cy="15" r="3.6"/><path d="m10.6 12.4 7.4-7.4M15.5 7.5l2.2 2.2M13.4 9.6l1.6 1.6"/></svg>`,
  yok: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8 6 12l4 4M6 12h9.5"/></svg>`,
  cevrimdisi: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M7.5 18.5h9.2a3.8 3.8 0 0 0 .6-7.5 5.5 5.5 0 0 0-9.4-2.7"/><path d="M5.2 10.3A4.2 4.2 0 0 0 7.5 18.5M4 4l16 16"/></svg>`,
};

function kilitle(on) {
  for (const id of ['shell', 'app', 'tabbar']) {
    const el = document.getElementById(id);
    if (el) el.inert = on;
  }
  document.documentElement.classList.toggle('kapi-acik', on);
}

function kapiKapat() {
  clearTimeout(yoklaTimer);
  aktif = null;
  if (!kok) return;
  kok.remove();
  kok = null;
  kilitle(false);
}

function dugme(etiket, sinif, is) {
  const b = h('button', { type: 'button', class: sinif }, etiket);
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    b.disabled = true;
    b.setAttribute('aria-busy', 'true');
    try { await is(); } finally {
      if (b.isConnected) { b.disabled = false; b.removeAttribute('aria-busy'); }
    }
  });
  return b;
}

function kurtarmaFormu(roomId) {
  const id = 'kapi-kurtarma';
  const input = h('input', {
    class: 'input kapi-kod', id, name: 'kurtarma', type: 'text', maxlength: 24, autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'ABCD-EFGH-JKLM-NPQR',
    'aria-describedby': `${id}-h`,
  });
  const hata = h('p', { class: 'kapi-hata', id: `${id}-h`, role: 'alert' });
  const gonder = h('button', { type: 'submit', class: 'btn primary' }, 'Kodla gir');
  const form = h('form', {
    class: 'kapi-form', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      const kod = kurtarmaTemizle(input.value);
      if (kod.length !== 16) {
        hata.textContent = 'Kod 16 harf ve rakamdan oluşur: ABCD-EFGH-JKLM-NPQR.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      gonder.disabled = true;
      gonder.setAttribute('aria-busy', 'true');
      hata.textContent = '';
      try {
        const s = await yenidenDene(roomId, { kurtarma: kod });
        if (girisAcikMi(s)) return;
        hata.textContent = s.durum === 'cevrimdisi'
          ? 'Bağlanamadık. Biraz sonra yeniden dener misin?'
          : 'Bu kod tutmadı. Harfleri kontrol edip yeniden dener misin?';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
      } finally {
        gonder.disabled = false;
        gonder.removeAttribute('aria-busy');
      }
    },
  },
  h('label', { class: 'kapi-etiket', for: id }, 'Kurtarma kodu'),
  h('div', { class: 'kapi-form-satir' }, input, gonder),
  hata);
  input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); hata.textContent = ''; });
  return form;
}

/** Kapı ekranını açar ya da günceller. s = üyelik sonucu (durum). */
export function kapiGoster(roomId, s) {
  if (typeof document === 'undefined') return;
  const durum = ICERIK[s?.durum] ? s.durum : 'cevrimdisi';
  if (aktif && aktif.roomId === roomId && aktif.durum === durum && kok) return;
  if (durum !== 'cevrimdisi') deneme = 0;
  aktif = { roomId, durum };
  const ic = kapiIcerigi(durum);

  if (!kok) {
    kok = h('div', { class: 'kapi', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'kapi-baslik' });
    document.body.append(kok);
    kilitle(true);
  }
  kok.dataset.durum = durum;

  const eylemler = h('div', { class: 'kapi-eylemler' });
  let form = null;
  for (const e of ic.eylemler) {
    if (e === 'kurtarma') {
      const ac = h('button', { type: 'button', class: 'btn', 'aria-expanded': 'false', 'aria-controls': 'kapi-kurtarma-alan' }, 'Kurtarma kodum var');
      form = h('div', { class: 'kapi-form-kap', id: 'kapi-kurtarma-alan', hidden: true }, kurtarmaFormu(roomId));
      ac.addEventListener('click', () => {
        const acik = form.hidden;
        form.hidden = !acik;
        ac.setAttribute('aria-expanded', String(acik));
        if (acik) form.querySelector('input')?.focus();
      });
      eylemler.append(ac, form); // form düğmenin hemen altında açılır
    } else if (e === 'yeniden') {
      eylemler.append(dugme('Yeniden katılma isteği gönder', 'btn primary', () => yenidenDene(roomId)));
    } else if (e === 'tekrar') {
      eylemler.append(dugme('Yeniden dene', 'btn primary', () => yenidenDene(roomId)));
    } else if (e === 'cik') {
      const tek = ic.eylemler.length === 1;
      eylemler.append(h('button', { type: 'button', class: tek ? 'btn primary' : 'btn ghost', onclick: odadanCik }, 'Odadan çık'));
    }
  }

  const benAd = cihazAdi(globalThis.navigator?.userAgent || '', me().name);
  kok.replaceChildren(h('div', { class: 'kapi-kart' },
    h('div', { class: 'kapi-marka', 'aria-hidden': 'true', html: ICONS.mark }),
    durum === 'yukleniyor' ? null : h('div', { class: 'kapi-simge', 'aria-hidden': 'true', html: SIMGE[durum] || '' }),
    h('h1', { class: 'kapi-baslik', id: 'kapi-baslik', tabindex: '-1' }, ic.baslik),
    h('p', { class: 'kapi-metin', role: durum === 'yukleniyor' ? 'status' : null }, ic.metin),
    durum === 'yukleniyor' ? null : h('p', { class: 'kapi-cihaz' }, 'Bu cihaz: ', h('strong', {}, benAd)),
    ic.not ? h('p', { class: 'kapi-not', role: 'status' }, durum === 'bekliyor' ? h('span', { class: 'kapi-nokta', 'aria-hidden': 'true' }) : null, ic.not) : null,
    ic.eylemler.length ? eylemler : null));
  kok.querySelector('.kapi-baslik')?.focus({ preventScroll: true });
  yoklamaKur(roomId, durum);
}
