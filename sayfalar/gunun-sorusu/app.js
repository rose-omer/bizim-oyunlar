// Günün Sorusu: her gün bir soru; ikiniz de cevaplayınca iki cevap birlikte açılır.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { h, initial, toast, formatDay, knownPartner, ICONS } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { SORULAR } from './sorular.js';
import {
  KATEGORILER, CEVAP_MAX, gunNo, gunTarihi, soruSecici, docId, gunlereGore, gunDurumu,
  ortakGunler, seri, haftaSeridi, arsiv, cevapHatasi,
} from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'gunsorusu', title: 'Günün Sorusu', tab: 'daha' });
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'gs-wrap' }, h('p', { class: 'gs-yukleniyor muted', role: 'status' }, 'Soru hazırlanıyor…')));

const sec = soruSecici(SORULAR, roomId);
const [col, profil] = await Promise.all([
  openCollection(room, 'gs'),
  openProfil(room).catch((e) => { console.warn('[gs] profil açılamadı', e); return null; }),
]);

const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || '';

const tarihFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const kisaGun = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });
const uzunGun = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const arsivGun = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const arsivGunYil = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const yerelTarih = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// ---------- Durum ----------
let bugun = gunNo();
let duzenliyor = false;
let onceki = null; // { gun, partner, ikisi }: canlı geçişleri yakalamak için
let arama = '';
let limit = 20;

// ---------- İskelet (bir kez kurulur; yazılan cevap yeniden çizimde kaybolmaz) ----------
const soruEl = h('article', { class: 'gs-soru', 'aria-labelledby': 'gs-soru-metin' });
const durumEl = h('p', { class: 'gs-durum', role: 'status' });

const alan = h('textarea', {
  id: 'gs-cevap', class: 'input gs-kagit', rows: 6, maxlength: CEVAP_MAX,
  'aria-describedby': 'gs-ipucu gs-sayac', placeholder: 'Aklına ilk geleni yaz…',
});
const sayac = h('span', { id: 'gs-sayac', class: 'gs-sayac' });
const ipucu = h('p', { id: 'gs-ipucu', class: 'gs-ipucu' }, 'İkiniz de yazınca cevaplar birlikte açılır.');
const hataEl = h('p', { id: 'gs-hata', class: 'gs-hata', role: 'alert', hidden: true });
const tasindiEl = h('p', { class: 'gs-tasindi', role: 'status', hidden: true },
  'Gün değişti; cevabın yeni soruya taşındı, istersen düzenle.');
const gonderBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Gönder');
const vazgecBtn = h('button', { type: 'button', class: 'btn ghost', hidden: true, onclick: () => duzenlemeBitir(true) }, 'Vazgeç');
const formEl = h('form', { class: 'gs-form', novalidate: true, onsubmit: gonder },
  h('label', { class: 'gs-etiket', for: 'gs-cevap' }, 'Senin cevabın'),
  alan,
  h('div', { class: 'gs-form-alt' }, ipucu, sayac),
  tasindiEl,
  hataEl,
  h('div', { class: 'gs-dugmeler' }, vazgecBtn, gonderBtn));
const cevaplarEl = h('div', { class: 'gs-cevaplar', tabindex: '-1', 'aria-label': 'Bugünün cevapları' });

const seriEl = h('section', { class: 'gs-seri card', 'aria-labelledby': 'gs-seri-baslik' });

const araInput = h('input', {
  id: 'gs-ara', class: 'input', type: 'search', enterkeyhint: 'search', autocomplete: 'off',
  placeholder: 'Soru ya da cevap…',
});
const arsivSayi = h('span', { class: 'gs-sayi', 'aria-live': 'polite' });
const listeEl = h('ol', { class: 'gs-liste' });
const dahaBtn = h('button', { type: 'button', class: 'btn ghost gs-daha', hidden: true, onclick: () => { limit += 20; ciz(); } }, 'Daha eski sorular');
const araKutu = h('div', { class: 'gs-ara' },
  h('label', { for: 'gs-ara' }, 'Arşivde ara'),
  h('div', { class: 'gs-ara-kutu', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' }));
araKutu.lastElementChild.append(araInput);
const arsivEl = h('section', { class: 'gs-arsiv', 'aria-labelledby': 'gs-arsiv-baslik' },
  h('div', { class: 'gs-arsiv-bas' }, h('h2', { id: 'gs-arsiv-baslik' }, 'Geçmiş sorular'), arsivSayi),
  araKutu, listeEl, dahaBtn);

app.replaceChildren(h('div', { class: 'gs-wrap' },
  h('section', { class: 'gs-bugun', 'aria-label': 'Bugünün sorusu' }, soruEl, durumEl, formEl, cevaplarEl),
  seriEl,
  arsivEl));

// ---------- Çizim ----------
let soruGun = null;
function cizSoru() {
  if (soruGun === bugun) return;
  soruGun = bugun;
  const soru = sec(bugun);
  soruEl.replaceChildren(
    h('h2', { id: 'gs-soru-metin', class: 'gs-soru-metin' }, soru?.s || 'Bugün soru bulunamadı.'),
    h('div', { class: 'gs-soru-alt' },
      h('span', { class: 'gs-kat', dataset: { k: soru?.k || '' } }, KATEGORILER[soru?.k] || 'Soru'),
      h('time', { datetime: gunTarihi(bugun) }, tarihFmt.format(yerelTarih(gunTarihi(bugun))))));
}

function avatar(kim, ad) {
  return h('span', { class: `avatar${kim === 'partner' ? ' partner' : ''}`, 'aria-hidden': 'true' }, initial(ad || (kim === 'ben' ? 'Sen' : '?')));
}

function cevapKarti(kim, ad, metin, ek = null) {
  return h('div', { class: 'gs-cevap', dataset: { kim } },
    h('div', { class: 'gs-cevap-bas' }, avatar(kim, ad), h('span', { class: 'gs-cevap-ad' }, kim === 'ben' ? 'Sen' : ad), ek),
    h('p', { class: 'gs-cevap-metin' }, metin));
}

function cizBugun(d, pAd) {
  const formAcik = !d.ben || duzenliyor;
  formEl.hidden = !formAcik;
  vazgecBtn.hidden = !duzenliyor;
  gonderBtn.textContent = d.ben ? 'Kaydet' : 'Gönder';
  ipucu.textContent = duzenliyor
    ? 'Gün bitene kadar cevabını değiştirebilirsin.'
    : 'İkiniz de yazınca cevaplar birlikte açılır.';

  // Durum şeridi
  let ton = '';
  let metin;
  let sol;
  if (duzenliyor) {
    metin = 'Cevabını düzenliyorsun.';
  } else if (d.ikisi) {
    ton = 'acik';
    metin = 'İkiniz de cevapladınız. İşte cevaplarınız.';
    sol = h('span', { class: 'gs-durum-ikon', 'aria-hidden': 'true', html: ICONS.heart });
  } else if (d.partner) {
    ton = 'bekliyor';
    metin = `${pAd} cevapladı, senin cevabını bekliyor 🤫`;
    sol = avatar('partner', pAd);
  } else if (d.ben) {
    metin = `Cevabın gitti. ${pAd} yazınca ikisi birlikte açılır.`;
    sol = avatar('ben', benAdi());
  } else {
    metin = 'Bugün henüz kimse cevaplamadı. İlk sen yaz!';
  }
  durumEl.dataset.ton = ton;
  durumEl.replaceChildren(...[sol, h('span', {}, metin)].filter(Boolean));

  // Cevaplar
  if (!d.ben || duzenliyor) {
    cevaplarEl.hidden = true;
    cevaplarEl.replaceChildren();
    return;
  }
  cevaplarEl.hidden = false;
  const duzenle = h('button', {
    type: 'button', class: 'btn ghost small', 'aria-label': 'Cevabını düzenle',
    onclick: () => duzenlemeBasla(d.ben.cevap),
  }, 'Düzenle');
  const benimki = cevapKarti('ben', benAdi(), d.ben.cevap, duzenle);
  const onunki = d.partner
    ? cevapKarti('partner', pAd, d.partner.cevap)
    : h('div', { class: 'gs-cevap muhur', dataset: { kim: 'partner' } },
      h('div', { class: 'gs-cevap-bas' }, avatar('partner', pAd), h('span', { class: 'gs-cevap-ad' }, pAd)),
      h('p', { class: 'gs-cevap-metin' }, 'Henüz yazmadı. Yazınca burada açılacak.'));
  cevaplarEl.replaceChildren(benimki, onunki);
}

const DURUM_METNI = {
  ikisi: () => 'ikiniz de cevapladınız',
  ben: () => 'yalnız sen cevapladın',
  partner: (ad) => `yalnız ${ad} cevapladı`,
  yok: () => 'cevap yok',
};

function cizSeri(harita, pAd) {
  const s = seri(ortakGunler(harita), bugun);
  const hafta = haftaSeridi(harita, bugun, me.clientId);
  let not;
  if (s.bugunTamam) not = 'Bugün tamam. Yarın yeni bir soru gelecek.';
  else if (s.simdi > 0) not = `Bugün de cevaplayın, seri ${s.simdi + 1} güne çıksın.`;
  else not = 'İkiniz de bugün cevaplayın, seriniz başlasın.';

  seriEl.replaceChildren(
    h('div', { class: 'gs-seri-ust' },
      h('div', {},
        h('h2', { id: 'gs-seri-baslik' }, 'Serimiz'),
        h('p', { class: 'gs-seri-sayi' },
          h('span', { class: 'gs-alev', 'aria-hidden': 'true' }, '🔥'),
          h('strong', { class: 'gs-seri-n' }, String(s.simdi)),
          h('span', { class: 'gs-seri-birim' }, 'gün üst üste'))),
      h('p', { class: 'gs-rekor' }, 'En uzun: ', h('strong', {}, `${s.enUzun} gün`))),
    h('ol', { class: 'gs-hafta', 'aria-label': 'Son 7 gün' }, hafta.map((g) => {
      const tarih = yerelTarih(g.tarih);
      const bugunMu = g.gun === bugun;
      return h('li', { dataset: { durum: g.durum }, 'aria-current': bugunMu ? 'date' : null },
        h('span', { class: 'gs-hafta-gun', 'aria-hidden': 'true' }, bugunMu ? 'Bugün' : kisaGun.format(tarih)),
        h('span', { class: 'gs-nokta', 'aria-hidden': 'true', html: g.durum === 'ikisi' ? ICONS.heart : '' }),
        h('span', { class: 'sr-only' }, `${uzunGun.format(tarih)}: ${DURUM_METNI[g.durum](pAd)}`));
    })),
    h('p', { class: 'gs-lejant', 'aria-hidden': 'true' },
      h('span', { dataset: { durum: 'ikisi' } }, h('span', { class: 'gs-nokta' }), 'İkiniz de'),
      h('span', { dataset: { durum: 'ben' } }, h('span', { class: 'gs-nokta' }), 'Sen'),
      h('span', { dataset: { durum: 'partner' } }, h('span', { class: 'gs-nokta' }), pAd)),
    h('p', { class: 'gs-seri-not' }, not));
}

function mini(kim, ad, metin) {
  return h('div', { class: `gs-mini${metin ? '' : ' bos'}`, dataset: { kim } },
    h('span', { class: 'gs-mini-ad' }, ad),
    h('p', { class: 'gs-mini-metin' }, metin || 'Cevap yok'));
}

function cizArsiv(harita, pAd) {
  const hepsi = arsiv(harita, { bugun, benId: me.clientId, sorular: SORULAR, roomId, ara: arama });
  const gosterilen = hepsi.slice(0, limit);
  arsivSayi.textContent = arama ? `${hepsi.length} sonuç` : hepsi.length ? `${hepsi.length} gün` : '';
  dahaBtn.hidden = hepsi.length <= limit;

  if (!hepsi.length) {
    listeEl.replaceChildren(h('li', { class: 'gs-bos' }, arama
      ? [h('strong', {}, 'Bir şey bulamadım'), `"${arama}" geçen bir soru ya da cevap yok.`]
      : [h('strong', {}, 'Arşiv henüz boş'), 'Bugünün cevapları yarın burada, yan yana duracak.']));
    return;
  }
  listeEl.replaceChildren(...gosterilen.map((g) => {
    const tarih = yerelTarih(g.tarih);
    const ne = formatDay(tarih);
    const tam = (tarih.getFullYear() !== new Date().getFullYear() ? arsivGunYil : arsivGun).format(tarih);
    const goreli = ne === 'dün' || ne.endsWith('önce');
    return h('li', { class: 'gs-gecmis' },
      h('div', { class: 'gs-gecmis-ust' },
        h('time', { datetime: g.tarih }, goreli ? `${ne[0].toLocaleUpperCase('tr')}${ne.slice(1)} · ${tam}` : tam),
        g.soru ? h('span', { class: 'gs-kat', dataset: { k: g.soru.k } }, KATEGORILER[g.soru.k]) : null),
      h('h3', { class: 'gs-gecmis-soru' }, g.soru?.s || ''),
      h('div', { class: 'gs-ikili' }, mini('ben', 'Sen', g.ben), mini('partner', pAd, g.partner)));
  }));
}

function gecisler(d, pAd) {
  if (onceki && onceki.gun === bugun) {
    if (!onceki.ikisi && d.ikisi && !duzenliyor) {
      cevaplarEl.classList.remove('gs-acildi');
      void cevaplarEl.offsetWidth; // animasyonu yeniden başlat
      cevaplarEl.classList.add('gs-acildi');
      sfx('match');
    } else if (!onceki.partner && d.partner && !d.ben) {
      sfx('pop');
      toast(`${pAd} cevapladı 🤫 Sen de yaz, ikisi birlikte açılsın.`);
    }
  }
  onceki = { gun: bugun, partner: !!d.partner, ikisi: d.ikisi };
}

function ciz() {
  const harita = gunlereGore(col.all());
  const d = gunDurumu(harita, bugun, me.clientId);
  const pAd = partnerAdi();
  cizSoru();
  cizBugun(d, pAd);
  cizSeri(harita, pAd);
  cizArsiv(harita, pAd);
  gecisler(d, pAd);
}

// ---------- Etkileşim ----------
function sayacGuncelle() {
  const n = alan.value.length;
  sayac.textContent = `${n} / ${CEVAP_MAX}`;
  sayac.dataset.yakin = String(n > CEVAP_MAX - 100);
}

function hataGoster(metin) {
  hataEl.hidden = !metin;
  hataEl.textContent = metin || '';
  alan.setAttribute('aria-invalid', metin ? 'true' : 'false');
}

function duzenlemeBasla(cevap) {
  duzenliyor = true;
  tasindiEl.hidden = true;
  alan.value = cevap;
  sayacGuncelle();
  hataGoster(null);
  ciz();
  alan.focus();
  alan.setSelectionRange(alan.value.length, alan.value.length);
}

function duzenlemeBitir(vazgec) {
  duzenliyor = false;
  alan.value = '';
  tasindiEl.hidden = true;
  sayacGuncelle();
  hataGoster(null);
  ciz();
  if (vazgec) cevaplarEl.focus({ preventScroll: true });
}

function yeniGun() {
  bugun = gunNo();
  duzenliyor = false;
  // Yazılmış metin silinmez: yeni soruya taşınır; kullanıcı bakıp düzenlesin.
  const tasindi = !!alan.value.trim();
  if (!tasindi) alan.value = '';
  tasindiEl.hidden = !tasindi;
  sayacGuncelle();
  hataGoster(null);
  limit = 20;
  ciz();
  toast('Yeni gün, yeni soru ✨');
}

async function gonder(e) {
  e.preventDefault();
  if (gunNo() !== bugun) { yeniGun(); return; }
  const metin = alan.value.trim();
  const hata = cevapHatasi(metin);
  if (hata) {
    hataGoster(hata);
    alan.focus();
    return;
  }
  hataGoster(null);
  const once = gunDurumu(gunlereGore(col.all()), bugun, me.clientId);
  const soru = sec(bugun);
  gonderBtn.disabled = true;
  try {
    await col.put({ gun: bugun, cevap: metin }, docId(bugun, me.clientId));
  } catch (err) {
    hataGoster(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
    return;
  } finally {
    gonderBtn.disabled = false;
  }
  const ilk = !once.ben;
  if (!gunDurumu(gunlereGore(col.all()), bugun, me.clientId).ikisi) sfx('pop'); // açılışta 'match' zaten çalar
  duzenlemeBitir(false);
  cevaplarEl.focus({ preventScroll: true });
  if (!ilk) toast('Cevabın güncellendi');
  if (ilk && !once.partner) {
    bildir(roomId, { tur: 'soru', baslik: 'Günün sorusu seni bekliyor', metin: soru?.s || '', url: 'sayfalar/gunun-sorusu/' })
      .catch((err) => console.warn('[gs] bildirim gönderilemedi', err));
  }
}

alan.addEventListener('input', () => {
  sayacGuncelle();
  if (!hataEl.hidden) hataGoster(null);
});

let araZaman = 0;
araInput.addEventListener('input', () => {
  clearTimeout(araZaman);
  araZaman = setTimeout(() => {
    arama = araInput.value.trim();
    limit = 20;
    ciz();
  }, 160);
});

// Hata bildirimi: çevrimdışıyken her yeniden denemede tekrar etmesin.
let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Cevabın kaydedilip gönderilecek.');
});
col.on('change', ciz);
profil?.on('change', ciz);
room.on('presence', () => ciz());

// Gece yarısı: yeni soru.
const gunKontrol = () => { if (gunNo() !== bugun) yeniGun(); };
setInterval(gunKontrol, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') gunKontrol(); });

sayacGuncelle();
ciz();
