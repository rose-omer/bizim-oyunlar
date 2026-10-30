// Anılarımız: fotoğraflı anı zaman çizelgesi, albüm, ayrıntı ve ekle/düzenle formu.
// Görünüm adresten gelir: (yok) liste · ?id=<id> ayrıntı · ?yeni=1[&baslik=..&tarih=..] yeni · ?duzenle=<id> düzenle.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { h, toast, confirmDialog, formatDay, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { toDay, parseDay } from '../../js/core/gunler.js';
import { fotoYukle, fotoImg } from '../../js/core/foto.js';
import * as M from './mantik.js';
import { ikon } from './ikon.js';
import { galeri, tamEkranAc } from './galeri.js';
import * as HM from './harita-mantik.js';
import { haritaGorunumu, konumSec, bulundugumYer } from './harita.js';

const { room, roomId, me } = await bootPage({ ns: 'anilar', title: 'Anılarımız', tab: 'anilar' });
const app = document.getElementById('app');
const col = await openCollection(room, 'ani');
const profil = await openProfil(room).catch(() => null);

const GORUNUM_ANAHTARI = 'bizim.anilar.gorunum';
const ROTA_ANAHTARLARI = ['id', 'yeni', 'duzenle', 'baslik', 'tarih'];
const GORUNUMLER = ['cizelge', 'album', 'harita'];
const durum = {
  gorunum: GORUNUMLER.includes(oku(GORUNUM_ANAHTARI)) ? oku(GORUNUM_ANAHTARI) : 'cizelge',
  etiket: '', yil: '', ara: '',
  haritaOdak: null, // "Haritada gör": harita açılınca bu anıya odaklan
};
let aktif = null;
let listeKaydirma = 0;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function oku(k) { try { return localStorage.getItem(k); } catch { return null; } }
function yaz(k, v) { try { localStorage.setItem(k, v); } catch { /* gizli sekme */ } }

// ---------- Yönlendirme ----------

function rota() {
  const p = new URLSearchParams(location.search);
  if (p.get('yeni') === '1') return { ad: 'form', id: null };
  if (p.get('duzenle')) return { ad: 'form', id: p.get('duzenle') };
  if (p.get('id')) return { ad: 'ayrinti', id: p.get('id') };
  return { ad: 'liste' };
}

function rotaUrl(params = {}) {
  const u = new URL(location.href);
  ROTA_ANAHTARLARI.forEach((k) => u.searchParams.delete(k));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.pathname + u.search;
}

const derinlik = () => history.state?.anilarDerinlik || 0;

function git(params = {}, { degistir = false } = {}) {
  if (rota().ad === 'liste') listeKaydirma = scrollY;
  const d = derinlik();
  if (degistir) history.replaceState({ anilarDerinlik: d }, '', rotaUrl(params));
  else history.pushState({ anilarDerinlik: d + 1 }, '', rotaUrl(params));
  ciz();
}

/** Sayfa içinden gelindiyse tarayıcı geri; doğrudan açıldıysa yerine koy. */
function geriDon(params = {}) {
  if (derinlik() > 0) history.back();
  else git(params, { degistir: true });
}

const yeniSekme = (e) => e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1;
const bagla = (params) => ({
  href: rotaUrl(params),
  onclick: (e) => { if (yeniSekme(e)) return; e.preventDefault(); git(params); },
});

function ciz() {
  aktif?.kapat?.();
  const r = rota();
  document.body.dataset.aniGorunum = r.ad;
  if (r.ad === 'form') aktif = formGorunumu(r.id);
  else if (r.ad === 'ayrinti') aktif = ayrintiGorunumu(r.id);
  else aktif = listeGorunumu();
  if (r.ad === 'liste') requestAnimationFrame(() => scrollTo(0, listeKaydirma));
  else scrollTo(0, 0);
}

addEventListener('popstate', ciz);
col.on('change', () => aktif?.guncelle?.());
col.on('error', (e) => toast(e.message));
profil?.on('change', () => aktif?.guncelle?.());

// ---------- Ortak parçalar ----------

function adi(clientId) {
  if (clientId === me.clientId) return 'Sen';
  return profil?.kisiler?.get(clientId)?.data?.ad || profil?.partner()?.ad || knownPartner(roomId)?.name || 'Sevgilin';
}

function ton(id) {
  let s = 0;
  for (const c of String(id)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return String((s % 6) + 1);
}

/** Fotoğrafsız anının kapağı: tarih, büyük harflerle. */
function tarihKapak(d) {
  const p = parseDay(d.data.tarih);
  return h('span', { class: 'ani-tarih-kapak', 'aria-hidden': 'true' },
    h('b', {}, p ? String(p.d) : '♡'), h('span', {}, p ? M.AY_ADLARI[p.m - 1] : ''));
}

function kapak(d, { eager = false } = {}) {
  const url = d.data.fotolar?.[0];
  return h('div', { class: 'ani-kapak', dataset: url ? null : { ton: ton(d.id) } },
    url ? fotoImg(url, { alt: '', eager }) : tarihKapak(d));
}

function begenenlerYazi(begeni) {
  const ids = Object.keys(begeni || {}).filter((k) => begeni[k]);
  if (!ids.length) return '';
  const ben = ids.includes(me.clientId);
  if (ids.length >= 2 && ben) return 'İkiniz de beğendiniz';
  if (ben) return 'Sen beğendin';
  return `${adi(ids[0])} beğendi`;
}

function bosDurum({ baslik, metin, dugme }) {
  return h('div', { class: 'ani-bos' },
    h('div', { class: 'ani-bos-cizim', 'aria-hidden': 'true' },
      h('span', { class: 'p1' }), h('span', { class: 'p2' }), h('span', { class: 'p3' }, ikon('kalp', { dolu: true }))),
    h('h2', { class: 'ani-bos-baslik' }, baslik),
    metin ? h('p', { class: 'subtitle' }, metin) : null,
    dugme || null);
}

function yeniAc() { git({ yeni: '1' }); }

// ---------- Liste: zaman çizelgesi ve albüm ----------

function listeGorunumu() {
  const segDugme = (id, ad, ik) => h('button', {
    type: 'button', 'aria-pressed': String(durum.gorunum === id), dataset: { k: `g-${id}` },
    onclick: () => { durum.gorunum = id; yaz(GORUNUM_ANAHTARI, id); boya(); },
  }, ikon(ik), ad);
  const seg = h('div', { class: 'seg ani-seg', role: 'group', 'aria-label': 'Görünüm' });
  const ara = h('input', {
    class: 'input', type: 'search', placeholder: 'Anılarda ara', 'aria-label': 'Anılarda ara',
    enterkeyhint: 'search', autocomplete: 'off',
    oninput: (e) => { durum.ara = e.target.value; boyaSonuc(); },
  });
  ara.value = durum.ara;
  const bugun = h('div', { class: 'ani-bugun-alan' });
  const arac = h('div', { class: 'ani-arac' }, seg, h('label', { class: 'ani-ara' }, ikon('ara'), ara));
  const suzgec = h('div', { class: 'ani-suzgec', role: 'group', 'aria-label': 'Süzgeç' });
  const ozet = h('p', { class: 'ani-ozet', 'aria-live': 'polite' });
  const sonuc = h('div', { class: 'ani-sonuc' });
  const fab = h('button', { type: 'button', class: 'btn primary ani-fab', onclick: yeniAc }, ikon('arti'), 'Anı ekle');
  app.replaceChildren(h('div', { class: 'ani-sayfa' }, bugun, arac, suzgec, ozet, sonuc), fab);

  function boya() {
    const odak = document.activeElement?.dataset?.k; // yeniden çizimde klavye odağı kaybolmasın
    const hepsi = col.all();
    const bos = hepsi.length === 0;
    arac.hidden = bos;
    suzgec.hidden = bos;
    ozet.hidden = bos;
    fab.hidden = bos || durum.gorunum === 'harita'; // haritada kayan düğme iğne kartını örterdi
    // Üç görünüm 390 px'te tek satıra sığsın diye kısa ad: "Çizelge" (zaman çizelgesi).
    seg.replaceChildren(segDugme('cizelge', 'Çizelge', 'cizelge'), segDugme('album', 'Albüm', 'izgara'), segDugme('harita', 'Harita', 'harita'));
    boyaSuzgec(hepsi);
    boyaSonuc();
    if (odak) app.querySelector(`[data-k="${CSS.escape(odak)}"]`)?.focus();
  }

  function boyaSuzgec(hepsi) {
    const ys = M.yillar(hepsi);
    const es = M.tumEtiketler(hepsi);
    const cip = (etiket, basili, onclick, ik) => h('button', {
      type: 'button', class: 'ani-cip', 'aria-pressed': String(basili), onclick, dataset: { k: `${ik ? 'e' : 'y'}-${etiket}` },
    }, ik ? ikon(ik) : null, etiket);
    const parcalar = [];
    if (ys.length > 1) {
      for (const y of ys) {
        parcalar.push(cip(String(y), String(durum.yil) === String(y), () => {
          durum.yil = String(durum.yil) === String(y) ? '' : String(y);
          boya();
        }));
      }
    }
    for (const { etiket } of es.slice(0, 20)) {
      const on = M.aramaMetni(durum.etiket) === M.aramaMetni(etiket);
      parcalar.push(cip(etiket, on, () => { durum.etiket = on ? '' : etiket; boya(); }, 'etiket'));
    }
    suzgec.replaceChildren(...parcalar);
    suzgec.hidden = !parcalar.length || hepsi.length === 0;
  }

  function boyaSonuc() {
    const hepsi = col.all();
    if (!hepsi.length) {
      bugun.replaceChildren();
      sonuc.replaceChildren(bosDurum({
        baslik: 'Henüz anı yok. İlkini ekleyelim mi?',
        metin: 'Bir fotoğraf, bir tarih, iki satır not. Gerisi zamanla birikir.',
        dugme: h('button', { type: 'button', class: 'btn primary', onclick: yeniAc }, ikon('arti'), 'İlk anımızı ekle'),
      }));
      return;
    }
    const suzulu = !!(durum.etiket || durum.yil || durum.ara.trim());
    const liste = M.filtrele(hepsi, durum);

    const bugunler = suzulu ? [] : M.buGunGecmisYillar(hepsi, toDay(new Date()));
    bugun.replaceChildren(...(bugunler.length ? [bugunKartlari(bugunler)] : []));

    const fotoSayisi = liste.reduce((n, d) => n + (d.data.fotolar?.length || 0), 0);
    ozet.textContent = durum.gorunum === 'harita'
      ? `${liste.length} anı · ${HM.konumluAnilar(liste).length} tanesi haritada`
      : `${liste.length} anı · ${fotoSayisi} fotoğraf`;

    if (!liste.length) {
      sonuc.replaceChildren(h('div', { class: 'ani-bos kucuk' },
        h('p', { class: 'ani-bos-baslik' }, 'Bu süzgece uyan anı yok.'),
        h('button', { type: 'button', class: 'btn', onclick: () => { durum.etiket = ''; durum.yil = ''; durum.ara = ''; ara.value = ''; boya(); } }, 'Süzgeci temizle')));
      return;
    }
    if (durum.gorunum === 'harita') {
      haritaBoya(liste);
      return;
    }
    haritaKapat();
    sonuc.replaceChildren(durum.gorunum === 'album' ? album(liste) : cizelge(liste));
  }

  // Harita: Leaflet haritası yeniden çizimlerde korunur (süzgeç, canlı değişiklik); görünümden çıkınca kaldırılır.
  let harita = null;
  function haritaKapat() {
    harita?.kapat();
    harita = null;
    removeEventListener('resize', haritaBoyu);
  }
  // Harita, sayfa en üstteyken sekme çubuğuna dek kalan yüksekliği doldurur (kart altta görünür kalsın).
  function haritaBoyu() {
    if (!harita) return;
    addEventListener('resize', haritaBoyu); // aynı dinleyici bir kez eklenir
    const ust = harita.el.getBoundingClientRect().top + scrollY;
    const alt = document.getElementById('tabbar')?.getBoundingClientRect().height || 0;
    const boy = Math.round(Math.min(640, Math.max(320, innerHeight - ust - alt - 16)));
    harita.el.style.setProperty('--harita-h', `${boy}px`);
    harita.yenile();
  }
  function haritaBoya(liste) {
    if (!HM.konumluAnilar(liste).length) {
      haritaKapat();
      sonuc.replaceChildren(h('div', { class: 'ani-bos kucuk ani-harita-bos' },
        ikon('harita'),
        h('p', { class: 'ani-bos-baslik' }, 'Haritada henüz iğne yok.'),
        h('p', { class: 'muted' }, 'Bir anıyı ekleyip ya da düzenleyip “Konum”dan yerini seç; burada iğne olur.'),
        h('button', { type: 'button', class: 'btn primary', onclick: yeniAc }, ikon('arti'), 'Anı ekle')));
      return;
    }
    if (!harita) harita = haritaGorunumu({ onAc: (id) => git({ id }) });
    if (sonuc.firstChild !== harita.el || sonuc.childNodes.length !== 1) sonuc.replaceChildren(harita.el);
    haritaBoyu();
    harita.guncelle(liste);
    if (durum.haritaOdak) {
      harita.odakla(durum.haritaOdak);
      durum.haritaOdak = null;
    }
  }

  boya();
  return { guncelle: boya, kapat: haritaKapat };
}

function bugunKartlari(items) {
  return h('section', { class: 'ani-bugun', 'aria-label': 'Geçmiş yıllarda bugün' },
    items.map(({ yilOnce, ani }) => h('a', { class: 'ani-bugun-kart', ...bagla({ id: ani.id }) },
      kapak(ani, { eager: true }),
      h('div', { class: 'ani-bugun-metin' },
        h('h2', { class: 'ani-bugun-baslik' }, M.buGunBasligi(yilOnce)),
        h('p', { class: 'ani-bugun-ani' }, ani.data.baslik),
        h('p', { class: 'ani-bugun-tarih' }, [M.gunYazi(ani.data.tarih), ani.data.yer].filter(Boolean).join(' · '))))));
}

function cizelge(liste) {
  return h('div', { class: 'ani-cizelge' }, M.zamanCizelgesi(liste).map((y) => h('section', { class: 'ani-yil' },
    h('h2', { class: 'ani-yil-baslik' }, String(y.yil), h('span', { class: 'ani-yil-sayi' }, `${y.sayi} anı`)),
    y.aylar.map((m) => h('div', { class: 'ani-ay' },
      h('h3', { class: 'ani-ay-baslik' }, m.ad),
      h('ul', { class: 'ani-kartlar' }, m.anilar.map(aniKart)))))));
}

function aniKart(d) {
  const data = d.data;
  const n = data.fotolar?.length || 0;
  const beg = M.begeniSayisi(data.begeni);
  return h('li', {}, h('a', { class: 'ani-kart', ...bagla({ id: d.id }) },
    h('div', { class: 'ani-kart-kapak' }, kapak(d),
      n > 1 ? h('span', { class: 'ani-foto-sayi', 'aria-label': `${n} fotoğraf` }, ikon('foto'), String(n)) : null),
    h('div', { class: 'ani-kart-govde' },
      h('h4', { class: 'ani-kart-baslik' }, data.baslik),
      h('div', { class: 'ani-kart-alt' },
        h('p', { class: 'ani-kart-meta' }, [M.gunYazi(data.tarih, { yil: false }), data.yer].filter(Boolean).join(' · ')),
        beg ? h('span', { class: 'ani-kart-begeni', 'aria-label': `${beg} beğeni` }, ikon('kalp', { dolu: true }), String(beg)) : null))));
}

function album(liste) {
  const fotolar = M.albumFotolari(liste);
  if (!fotolar.length) {
    return h('div', { class: 'ani-bos kucuk' },
      h('p', { class: 'ani-bos-baslik' }, 'Bu anılarda henüz fotoğraf yok.'),
      h('p', { class: 'muted' }, 'Bir anıyı açıp düzenleyerek fotoğraf ekleyebilirsin.'));
  }
  const tam = fotolar.map((f) => ({
    url: f.url, alt: f.baslik,
    altyazi: [f.baslik, M.gunYazi(f.tarih)].filter(Boolean).join(' · '),
    eylem: { label: 'Anıya git', onClick: () => git({ id: f.aniId }) },
  }));
  return h('ul', { class: 'ani-album', 'aria-label': 'Albüm' }, fotolar.map((f, k) => h('li', {},
    h('button', {
      type: 'button', class: 'ani-album-kare',
      'aria-label': `${f.baslik}, ${M.gunYazi(f.tarih)} (${f.sira + 1}. fotoğraf)`,
      onclick: () => tamEkranAc(tam, k),
    }, fotoImg(f.url, { alt: '' })))));
}

// ---------- Ayrıntı ----------

function ayrintiGorunumu(id) {
  const geri = h('button', { type: 'button', class: 'ani-geri', onclick: () => geriDon({}) }, ikon('geri'), 'Tüm anılar');
  const galeriYuva = h('div', { class: 'ani-galeri-yuva' });
  const bilgi = h('div', { class: 'ani-bilgi' });
  app.replaceChildren(h('article', { class: 'ani-ayrinti' }, geri, galeriYuva, bilgi));
  let gal = null;
  let galAnahtar = null;
  let galIndeks = 0;
  let odaklandi = false;

  const tus = (e) => {
    if (!gal || e.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.closest?.('.galeri-iz')) return;
    gal.tus(e);
  };
  document.addEventListener('keydown', tus);

  function boya() {
    const d = col.get(id);
    if (!d) {
      gal = null;
      galAnahtar = null;
      galeriYuva.replaceChildren();
      bilgi.replaceChildren(h('div', { class: 'ani-bos kucuk' },
        h('h2', { class: 'ani-bos-baslik' }, 'Bu anı bulunamadı.'),
        h('p', { class: 'muted' }, 'Silinmiş olabilir.'),
        h('button', { type: 'button', class: 'btn', onclick: () => git({}, { degistir: true }) }, 'Anılarımıza dön')));
      return;
    }
    const data = d.data;
    const fotolar = data.fotolar || [];
    const anahtar = JSON.stringify(fotolar);
    if (anahtar !== galAnahtar) {
      galAnahtar = anahtar;
      if (fotolar.length) {
        const liste = fotolar.map((url, k) => ({ url, alt: `${data.baslik}: ${k + 1}. fotoğraf` }));
        gal = galeri(liste, {
          baslangic: Math.min(galIndeks, fotolar.length - 1),
          onDegis: (i) => { galIndeks = i; },
          onTamEkran: (i) => tamEkranAc(liste, i),
        });
        galeriYuva.replaceChildren(gal.el);
      } else {
        gal = null;
        galeriYuva.replaceChildren(h('div', { class: 'ani-fotosuz', dataset: { ton: ton(d.id) } }, tarihKapak(d)));
      }
    }

    const begendim = !!data.begeni?.[me.clientId];
    const begSayi = M.begeniSayisi(data.begeni);
    const begen = h('button', {
      type: 'button', class: 'ani-begen', 'aria-pressed': String(begendim),
      'aria-label': begendim ? 'Beğenmekten vazgeç' : 'Beğen',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.classList.remove('patla');
        void btn.offsetWidth;
        if (!begendim) { btn.classList.add('patla'); sfx('pop'); }
        const guncel = col.get(id)?.data?.begeni;
        try { await col.patch(id, M.begeniYamasi(guncel, me.clientId)); } catch (err) { toast(err.message); }
      },
    }, ikon('kalp', { dolu: begendim }), h('span', {}, begSayi ? String(begSayi) : 'Beğen'));

    const meta = [
      h('li', {}, ikon('takvim'), M.gunYazi(data.tarih)),
      data.yer ? h('li', {}, ikon('konum'), data.yer) : null,
      HM.konumDogrula(data.konum) ? h('li', {}, ikon('harita'), h('button', {
        type: 'button', class: 'ani-meta-link',
        onclick: () => {
          Object.assign(durum, { gorunum: 'harita', haritaOdak: id, etiket: '', yil: '', ara: '' });
          yaz(GORUNUM_ANAHTARI, 'harita');
          listeKaydirma = 0;
          git({});
        },
      }, 'Haritada gör')) : null,
    ];
    const etiketler = (data.etiketler || []).map((t) => h('li', {},
      h('button', {
        type: 'button', class: 'ani-cip',
        'aria-label': `${t} etiketli anıları göster`,
        onclick: () => { durum.etiket = t; durum.yil = ''; durum.ara = ''; git({}); listeKaydirma = 0; scrollTo(0, 0); },
      }, ikon('etiket'), t)));
    const begenenler = begenenlerYazi(data.begeni);
    // belge.author son yazandır (beğeni de yazar); ekleyen data.ekleyen'de tutulur.
    const ekleyen = data.ekleyen
      ? `${adi(data.ekleyen)} ${data.ekleyen === me.clientId ? 'ekledin' : 'ekledi'} · ${formatDay(d.created_at)}`
      : `Eklendi · ${formatDay(d.created_at)}`;

    const baslik = h('h2', { class: 'ani-baslik', tabindex: '-1' }, data.baslik);
    bilgi.replaceChildren(...[
      h('header', { class: 'ani-bilgi-bas' }, baslik, h('ul', { class: 'ani-meta' }, meta)),
      h('div', { class: 'ani-eylemler' },
        begen,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => git({ duzenle: id }) }, ikon('kalem'), 'Düzenle'),
        h('button', { type: 'button', class: 'btn ghost danger', onclick: () => sil(d) }, ikon('cop'), 'Sil')),
      begenenler ? h('p', { class: 'ani-begenenler' }, ikon('kalp', { dolu: true }), begenenler) : null,
      data.not ? h('p', { class: 'ani-not' }, data.not) : null,
      etiketler.length ? h('ul', { class: 'ani-etiketler', 'aria-label': 'Etiketler' }, etiketler) : null,
      !fotolar.length ? h('button', { type: 'button', class: 'btn ani-foto-oner', onclick: () => git({ duzenle: id }) }, ikon('foto'), 'Fotoğraf ekle') : null,
      h('p', { class: 'ani-ekleyen' }, ekleyen),
    ].filter(Boolean));
    if (!odaklandi) {
      odaklandi = true;
      baslik.focus({ preventScroll: true });
    }
  }

  async function sil(d) {
    const ok = await confirmDialog(`"${d.data.baslik}" silinsin mi? Bu geri alınamaz.`, { ok: 'Sil', cancel: 'Vazgeç' });
    if (!ok) return;
    // Not: fotoğraf dosyaları depodan silinemez (anon rolünün kovada silme yetkisi yok; SOZLESME §13).
    // Anı belgesi silinir; fotoğraf adresleri yalnız belgeden kalkar, dosyalar kovada kalır.
    try {
      await col.remove(d.id);
      sfx('tap');
      toast('Anı silindi');
      geriDon({});
    } catch (err) {
      toast(err.message);
    }
  }

  boya();
  return { guncelle: boya, kapat: () => document.removeEventListener('keydown', tus) };
}

// ---------- Ekle / düzenle ----------

function formGorunumu(id) {
  const mevcut = id ? col.get(id) : null;
  if (id && !mevcut) {
    app.replaceChildren(h('div', { class: 'ani-sayfa' }, h('div', { class: 'ani-bos kucuk' },
      h('h2', { class: 'ani-bos-baslik' }, 'Bu anı bulunamadı.'),
      h('button', { type: 'button', class: 'btn', onclick: () => git({}, { degistir: true }) }, 'Anılarımıza dön'))));
    return null;
  }
  const prm = M.formParametreleri(location.search, toDay(new Date()));
  const v = mevcut?.data || {};
  const st = {
    fotolar: [...(v.fotolar || [])],
    etiketler: [...(v.etiketler || [])],
    konum: HM.konumDogrula(v.konum),
    konumMesgul: false,
    yukleniyor: false,
    kirli: false,
  };

  let sira = 0;
  const alan = (etiket, girdi, { ipucu, hataId } = {}) => {
    const gid = `ani-f-${++sira}`;
    girdi.id = gid;
    const hata = h('p', { class: 'ani-alan-hata', id: hataId || `${gid}-hata`, hidden: true });
    girdi.setAttribute('aria-describedby', hata.id);
    return { el: h('div', { class: 'ani-alan' }, h('label', { for: gid }, etiket), girdi, ipucu || null, hata), girdi, hata };
  };

  const baslik = alan('Başlık', h('input', { class: 'input', type: 'text', maxlength: String(M.MAX_BASLIK), required: true, placeholder: 'Örn. İlk kahvaltımız', autocomplete: 'off', enterkeyhint: 'next' }));
  baslik.girdi.value = v.baslik || prm.baslik;
  const tarih = alan('Tarih', h('input', { class: 'input', type: 'date', required: true }));
  tarih.girdi.value = v.tarih || prm.tarih;
  const yer = alan('Yer', h('input', { class: 'input', type: 'text', maxlength: String(M.MAX_YER), placeholder: 'Nerede?', autocomplete: 'off', enterkeyhint: 'next' }));
  yer.girdi.value = v.yer || '';

  // Konum (isteğe bağlı): bulunduğum yer ya da haritada dokunarak seç. Harita (Leaflet) yalnız seçici açılınca yüklenir.
  const konumIc = h('div', { class: 'ani-konum-ic' });
  const konumMesaj = h('p', { class: 'ani-konum-mesaj', role: 'status', hidden: true });
  const konumAlan = h('div', { class: 'ani-alan ani-konum', role: 'group', 'aria-labelledby': 'ani-konum-bas' },
    h('span', { class: 'ani-form-etiket', id: 'ani-konum-bas' }, 'Konum', h('span', { class: 'ani-istege' }, 'isteğe bağlı')),
    konumIc, konumMesaj,
    h('p', { class: 'ani-ipucu' }, 'Konumlu anılar Harita görünümünde iğne olur.'));

  function boyaKonum({ odak = false } = {}) {
    if (st.konum) {
      konumIc.replaceChildren(h('div', { class: 'ani-konum-secili' },
        h('span', { class: 'ani-konum-rozet', 'aria-hidden': 'true' }, ikon('konum')),
        h('span', { class: 'ani-konum-yazi' }, HM.konumYazi(st.konum)),
        h('div', { class: 'ani-konum-eylem' },
          h('button', { type: 'button', class: 'btn small', onclick: haritadanSec }, ikon('harita'), 'Haritada değiştir'),
          h('button', {
            type: 'button', class: 'btn small ghost danger',
            onclick: () => { st.konum = null; st.kirli = true; konumMesaj.hidden = true; boyaKonum({ odak: true }); },
          }, 'Kaldır'))));
    } else {
      konumIc.replaceChildren(h('div', { class: 'ani-konum-dugmeler' },
        h('button', {
          type: 'button', class: 'btn', onclick: buradayim,
          disabled: st.konumMesgul, 'aria-busy': st.konumMesgul ? 'true' : null,
        }, ikon('hedef'), st.konumMesgul ? 'Konum alınıyor…' : 'Bulunduğum yer'),
        h('button', { type: 'button', class: 'btn', onclick: haritadanSec }, ikon('harita'), 'Haritadan seç')));
    }
    if (odak) konumIc.querySelector('button:not(:disabled)')?.focus();
  }

  async function buradayim() {
    konumMesaj.hidden = true;
    st.konumMesgul = true;
    boyaKonum();
    let tamam = false;
    try {
      const pos = await bulundugumYer();
      const k = HM.konumDogrula(pos.coords);
      if (!k) throw new Error('geçersiz');
      st.konum = k;
      st.kirli = true;
      tamam = true;
      sfx('snap');
    } catch (e) {
      konumMesaj.textContent = HM.konumHataMetni(e);
      konumMesaj.hidden = false;
    } finally {
      st.konumMesgul = false;
      boyaKonum({ odak: true });
    }
    if (tamam) toast('Konum eklendi');
  }

  async function haritadanSec() {
    konumMesaj.hidden = true;
    const digerleri = HM.konumluAnilar(col.all()).filter((n) => n.id !== id);
    const k = await konumSec({ baslangic: st.konum, digerleri });
    if (k) {
      st.konum = k;
      st.kirli = true;
    }
    boyaKonum({ odak: true });
  }

  const notSayac = h('span', { class: 'ani-sayac', 'aria-live': 'polite' });
  const not = alan('Not', h('textarea', { class: 'input', rows: '4', maxlength: String(M.MAX_NOT), placeholder: 'O gün aklında kalan…' }), { ipucu: notSayac });
  not.girdi.value = v.not || '';
  const sayacBoya = () => {
    const n = [...not.girdi.value].length;
    notSayac.textContent = n > M.MAX_NOT * 0.8 ? `${n} / ${M.MAX_NOT}` : '';
  };
  not.girdi.addEventListener('input', sayacBoya);
  sayacBoya();

  // Fotoğraflar
  const dosyaGirdi = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', 'aria-label': 'Fotoğraf seç' });
  dosyaGirdi.addEventListener('change', () => { if (dosyaGirdi.files?.length) yukle(dosyaGirdi.files); });
  const fotoSayac = h('span', { class: 'ani-foto-sayac' });
  const izgara = h('ul', { class: 'ani-foto-izgara', 'aria-label': 'Seçilen fotoğraflar' });
  const ilerleme = h('div', { class: 'ani-yukleme', role: 'status', hidden: true });
  const fotoHata = h('p', { class: 'ani-alan-hata', hidden: true });

  function boyaFotolar() {
    fotoSayac.textContent = `${st.fotolar.length} / ${M.MAX_FOTO}`;
    const n = st.fotolar.length;
    const kutular = st.fotolar.map((url, k) => h('li', { class: 'ani-foto-kutu' },
      fotoImg(url, { alt: `${k + 1}. fotoğraf`, eager: true }),
      k === 0 ? h('span', { class: 'ani-kapak-rozet' }, 'Kapak') : null,
      h('div', { class: 'ani-foto-eylem' },
        h('button', { type: 'button', 'aria-label': `${k + 1}. fotoğrafı öne al`, disabled: k === 0, onclick: () => tasi(k, -1) }, ikon('sol')),
        h('button', { type: 'button', 'aria-label': `${k + 1}. fotoğrafı arkaya al`, disabled: k === n - 1, onclick: () => tasi(k, 1) }, ikon('sag')),
        h('button', { type: 'button', 'aria-label': `${k + 1}. fotoğrafı kaldır`, onclick: () => kaldir(k) }, ikon('kapat')))));
    const ekle = n < M.MAX_FOTO
      ? h('li', {}, h('label', { class: 'ani-foto-ekle', 'aria-disabled': String(st.yukleniyor) },
          dosyaGirdi, ikon('foto'),
          h('span', { class: 'ani-foto-ekle-baslik' }, n ? 'Fotoğraf ekle' : 'Fotoğraf seç'),
          h('span', { class: 'ani-foto-ekle-alt' }, `En çok ${M.MAX_FOTO - n} tane daha`)))
      : null;
    izgara.replaceChildren(...kutular, ...(ekle ? [ekle] : []));
    dosyaGirdi.disabled = st.yukleniyor;
    kaydetBtn.disabled = st.yukleniyor;
  }

  function tasi(k, yon) {
    st.fotolar = M.fotoTasi(st.fotolar, k, yon);
    st.kirli = true;
    boyaFotolar();
    izgara.children[k + yon]?.querySelector(yon < 0 ? 'button' : 'button:nth-child(2)')?.focus();
  }

  function kaldir(k) {
    // Fotoğraf yalnız anıdan çıkar; dosya depoda kalır (anon rolü kovadan silemez).
    st.fotolar = M.fotoKaldir(st.fotolar, k);
    st.kirli = true;
    boyaFotolar();
    (izgara.children[Math.min(k, st.fotolar.length)]?.querySelector('button, input') || dosyaGirdi).focus();
  }

  async function yukle(files) {
    const kalan = M.MAX_FOTO - st.fotolar.length;
    fotoHata.hidden = true;
    if (kalan <= 0) {
      toast(`Bir anıya en çok ${M.MAX_FOTO} fotoğraf eklenebilir.`);
      return;
    }
    st.yukleniyor = true;
    boyaFotolar();
    const cubuk = h('progress', { max: '1', value: '0' });
    const yazi = h('span', {}, 'Fotoğraflar hazırlanıyor…');
    ilerleme.replaceChildren(yazi, cubuk);
    ilerleme.hidden = false;
    try {
      const urls = await fotoYukle(roomId, files, {
        enFazla: kalan,
        onIlerleme: ({ bitti, toplam }) => {
          cubuk.max = toplam;
          cubuk.value = bitti;
          yazi.textContent = bitti < toplam ? `Yükleniyor… ${bitti + 1} / ${toplam}` : 'Tamamlandı';
        },
        onHata: (m) => toast(m),
      });
      st.fotolar.push(...urls);
      st.kirli = true;
      sfx('snap');
    } catch (e) {
      fotoHata.textContent = e.message;
      fotoHata.hidden = false;
    } finally {
      st.yukleniyor = false;
      ilerleme.hidden = true;
      dosyaGirdi.value = '';
      boyaFotolar();
    }
  }

  // Etiketler
  const etiketKutu = h('ul', { class: 'ani-etiket-secili', 'aria-label': 'Eklenen etiketler' });
  const etiketGirdi = h('input', { class: 'input', type: 'text', placeholder: 'Etiket yaz, Enter’a bas', autocomplete: 'off', enterkeyhint: 'done', maxlength: '30' });
  const oneriler = h('div', { class: 'ani-etiket-oneri' });
  const etiketAlan = alan('Etiketler', etiketGirdi);
  etiketAlan.el.append(etiketKutu, oneriler);

  function etiketEkle(s) {
    const once = st.etiketler.length;
    st.etiketler = M.etiketEkle(st.etiketler, s);
    if (st.etiketler.length !== once) st.kirli = true;
    else if (M.etiketTemizle(s) && st.etiketler.length >= M.MAX_ETIKET) toast(`En çok ${M.MAX_ETIKET} etiket eklenebilir.`);
    boyaEtiketler();
  }
  function boyaEtiketler() {
    etiketKutu.replaceChildren(...st.etiketler.map((t, k) => h('li', {}, h('button', {
      type: 'button', class: 'ani-cip secili', 'aria-label': `${t} etiketini kaldır`,
      onclick: () => {
        st.etiketler = st.etiketler.filter((_, i) => i !== k);
        st.kirli = true;
        boyaEtiketler();
        etiketGirdi.focus();
      },
    }, t, ikon('kapat')))));
    etiketKutu.hidden = !st.etiketler.length;
    const secili = new Set(st.etiketler.map(M.aramaMetni));
    const kalan = M.tumEtiketler(col.all()).filter((e) => !secili.has(M.aramaMetni(e.etiket))).slice(0, 10);
    oneriler.replaceChildren(...kalan.map((e) => h('button', {
      type: 'button', class: 'ani-cip', 'aria-label': `${e.etiket} etiketini ekle`, onclick: () => etiketEkle(e.etiket),
    }, ikon('arti'), e.etiket)));
    oneriler.hidden = !kalan.length;
  }
  etiketGirdi.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (etiketGirdi.value.trim()) { etiketEkle(etiketGirdi.value); etiketGirdi.value = ''; }
    } else if (e.key === 'Backspace' && !etiketGirdi.value && st.etiketler.length) {
      st.etiketler = st.etiketler.slice(0, -1);
      boyaEtiketler();
    }
  });
  etiketGirdi.addEventListener('blur', () => {
    if (etiketGirdi.value.trim()) { etiketEkle(etiketGirdi.value); etiketGirdi.value = ''; }
  });

  // Gönder
  const genelHata = h('p', { class: 'ani-alan-hata', role: 'alert', hidden: true });
  const kaydetBtn = h('button', { type: 'submit', class: 'btn primary' }, id ? 'Kaydet' : 'Anıyı kaydet');
  const vazgecBtn = h('button', { type: 'button', class: 'btn ghost', onclick: vazgec }, 'Vazgeç');
  const formBaslik = h('h2', { class: 'ani-form-baslik', tabindex: '-1' }, id ? 'Anıyı düzenle' : 'Yeni anı');

  const form = h('form', { class: 'ani-form', novalidate: true },
    formBaslik,
    h('section', { class: 'ani-form-fotolar', 'aria-label': 'Fotoğraflar' },
      h('div', { class: 'ani-form-fotolar-bas' }, h('span', { class: 'ani-form-etiket' }, 'Fotoğraflar'), fotoSayac),
      izgara, ilerleme, fotoHata,
      h('p', { class: 'ani-ipucu' }, 'İlk fotoğraf kapak olur. Fotoğrafları buraya sürükleyip bırakabilirsin.')),
    baslik.el, tarih.el, yer.el, konumAlan, not.el, etiketAlan.el,
    genelHata,
    h('div', { class: 'ani-form-eylem' }, vazgecBtn, kaydetBtn));

  form.addEventListener('input', () => { st.kirli = true; });
  form.addEventListener('submit', kaydet);
  // Sürükle-bırak
  form.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    form.classList.add('surukle');
  });
  form.addEventListener('dragleave', (e) => { if (e.target === form || !form.contains(e.relatedTarget)) form.classList.remove('surukle'); });
  form.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    form.classList.remove('surukle');
    if (!st.yukleniyor) yukle(e.dataTransfer.files);
  });

  app.replaceChildren(h('div', { class: 'ani-sayfa dar' }, form));
  boyaFotolar();
  boyaEtiketler();
  boyaKonum();
  formBaslik.focus({ preventScroll: true });

  function alanHatasi(a, metin) {
    a.hata.textContent = metin;
    a.hata.hidden = false;
    a.girdi.setAttribute('aria-invalid', 'true');
    a.girdi.focus();
  }

  async function kaydet(e) {
    e.preventDefault();
    if (st.yukleniyor) return;
    for (const a of [baslik, tarih, yer, not]) { a.hata.hidden = true; a.girdi.removeAttribute('aria-invalid'); }
    genelHata.hidden = true;
    if (etiketGirdi.value.trim()) { etiketEkle(etiketGirdi.value); etiketGirdi.value = ''; }
    const girdi = {
      baslik: baslik.girdi.value, tarih: tarih.girdi.value, yer: yer.girdi.value, not: not.girdi.value,
      fotolar: st.fotolar, etiketler: st.etiketler, konum: st.konum,
    };
    const hata = M.aniDogrula(girdi);
    if (hata) {
      if (/başlık/i.test(hata)) alanHatasi(baslik, hata);
      else if (/tarih/i.test(hata)) alanHatasi(tarih, hata);
      else if (/^Yer/.test(hata)) alanHatasi(yer, hata);
      else if (/^Not/.test(hata)) alanHatasi(not, hata);
      else { genelHata.textContent = hata; genelHata.hidden = false; }
      return;
    }
    const onceki = id ? (col.get(id)?.data || {}) : {};
    kaydetBtn.disabled = true;
    try {
      // Düzenlemede yalnız formdaki alanlar yazılır (beğeni ezilmez); yeni anı tam belge.
      const data = id ? M.aniYamasi(girdi, onceki, me.clientId) : M.aniVerisi(girdi, {}, me.clientId);
      const yeniId = id ? await col.patch(id, data) : await col.put(data);
      sfx('pop');
      if (!id) {
        if (!partnerGoruyor(room.partner(), 'anilar')) {
          bildir(roomId, { tur: 'ani', baslik: 'Yeni anı', metin: data.baslik, url: 'sayfalar/anilar/' }).catch(() => {});
        }
        toast('Anı kaydedildi');
      } else {
        toast('Değişiklikler kaydedildi');
      }
      st.kirli = false;
      // Düzenleme ayrıntıdan açıldıysa geri dön (geçmişte ayrıntı iki kez kalmasın); yeni anıda ayrıntıya geç.
      if (id) geriDon({ id });
      else git({ id: yeniId }, { degistir: true });
    } catch (err) {
      genelHata.textContent = err.message;
      genelHata.hidden = false;
      kaydetBtn.disabled = false;
    }
  }

  async function vazgec() {
    if (st.yukleniyor) {
      toast('Fotoğraflar yükleniyor, biraz bekle.');
      return;
    }
    if (st.kirli && !(await confirmDialog('Kaydetmeden çıkalım mı? Yaptığın değişiklikler kaybolur.', { ok: 'Çık', cancel: 'Kal' }))) return;
    geriDon(id ? { id } : {});
  }

  return {
    guncelle() {
      if (id && !col.get(id)) toast('Bu anı silindi.');
      boyaEtiketler();
    },
  };
}

ciz();
