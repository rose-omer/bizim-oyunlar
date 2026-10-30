// Ruh Hâlimiz: ikinizin bugünkü ruh hâli, bu haftanın özeti ve son 30 / 90 günün takvimi.
// Veri: 'ruhgecmis' (günün son seçimi; Biz sayfası yazar) + 'ruh' (son seçim; eski günleri doldurur).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { pageUrl } from '../../js/core/identity.js';
import { toDay, addDays } from '../../js/core/gunler.js';
import { h, icon, avatarEl, formatDay, knownPartner, toast } from '../../js/core/ui.js';
import * as M from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'ruh', title: 'Ruh Hâlimiz', tab: 'daha' });
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'ruh-wrap' }, h('p', { class: 'muted', role: 'status' }, 'Hazırlanıyor…')));

const [gecmis, ruhKol, profil] = await Promise.all([
  openCollection(room, M.GECMIS_TURU, { recent: 200 }),
  openCollection(room, 'ruh'),
  openProfil(room).catch((e) => { console.warn('[ruh] profil açılamadı', e); return null; }),
]);

const ARALIK_ANAHTARI = 'bizim.ruh.aralik';
const ARALIKLAR = [30, 90];
const durum = {
  aralik: oku(ARALIK_ANAHTARI) === '90' ? 90 : 30,
  secili: null, // detayı açık gün
  odak: null, // takvimde klavye odağı (gezici tabindex)
  bugun: toDay(new Date()),
};

function oku(k) { try { return localStorage.getItem(k); } catch { return null; } }
function yaz(k, v) { try { localStorage.setItem(k, v); } catch { /* gizli sekme */ } }

// ---------- Veri ----------

/** 90 günü kapsayana dek eski belgeleri sayfa sayfa çeker (recent modu son 200 ile açılır). */
async function eskileriYukle() {
  const sinir = new Date(addDays(durum.bugun, -95) + 'T00:00:00').getTime();
  try {
    for (let i = 0; i < 10 && gecmis.hasOlder(); i++) {
      const enEski = gecmis.all().find((d) => !d.pending);
      if (enEski && Date.parse(enEski.created_at) < sinir) break;
      if (!(await gecmis.loadOlder(200))) break;
    }
  } catch (e) {
    console.warn('[ruh] eski günler yüklenemedi', e);
  }
}

function kisiler(harita) {
  const p = profil?.partner?.() || null;
  const pr = room.partner?.() || null;
  const bilinen = knownPartner(roomId);
  const tercih = p?.clientId || pr?.clientId || bilinen?.clientId || null;
  // Partner cihaz değiştirdiyse geçmişi başka clientId'de olabilir: verisi olan son kişiyi al.
  const id = tercih && harita.has(tercih) ? tercih : M.digerKisi(harita, me.clientId) || tercih;
  const ben = profil?.ben?.() || null;
  return {
    ben: { id: me.clientId, ad: ben?.ad || me.name || 'Sen', foto: ben?.foto || null, ben: true },
    o: { id, ad: p?.ad || pr?.name || bilinen?.name || 'Sevgilin', foto: p?.foto || null, ben: false },
  };
}

const avatar = (k, cls = '') => avatarEl(k.ad, `${k.ben ? 'me' : 'partner'} ${cls}`.trim(), k.foto, null);
const kimAdi = (k) => (k.ben ? 'Sen' : k.ad);

function saatYazi(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDay(d)} · ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

function hisAdi(emoji) {
  return M.ruhBilgisi(emoji)?.ad || emoji;
}

// ---------- Çizim ----------

function boya() {
  const odakK = document.activeElement?.dataset?.k || null;
  durum.bugun = toDay(new Date());
  const harita = M.ruhGunleri(gecmis.all(), ruhKol.all());
  const k = kisiler(harita);
  const benim = harita.get(k.ben.id);
  const onun = k.o.id ? harita.get(k.o.id) : undefined;

  const wrap = h('div', { class: 'ruh-wrap' });
  if (!benim?.size && !onun?.size) {
    wrap.append(bosDurum());
  } else {
    wrap.append(bugunKarti(k, benim, onun), haftaBolumu(k, benim, onun), takvimBolumu(k, benim, onun));
  }
  app.replaceChildren(wrap);
  if (odakK) app.querySelector(`[data-k="${CSS.escape(odakK)}"]`)?.focus({ preventScroll: true });
}

function bosDurum() {
  return h('section', { class: 'ruh-bos', 'aria-labelledby': 'ruh-bos-h' },
    h('div', { class: 'ruh-bos-cizim', 'aria-hidden': 'true' },
      h('span'), h('span', { class: 'dolu' }, icon('heart')), h('span')),
    h('h2', { id: 'ruh-bos-h' }, 'Ruh hâli takviminiz boş'),
    h('p', { class: 'subtitle' },
      'Biz sayfasında bugün nasıl olduğunu seç. Her gün takvime bir kare eklenir; ikiniz de birbirinizin gününü görürsünüz.'),
    h('a', { class: 'btn primary', href: pageUrl(''), dataset: { k: 'bos-sec' } }, 'Bugün nasılsın?'));
}

/** Bugün: iki sütun, her biri son paylaşılan ruh hâli. */
function bugunKarti(k, benim, onun) {
  const sutun = (kisi, gunler) => {
    const son = M.sonRuh(gunler);
    const bugunMu = son?.gun === durum.bugun;
    const parcalar = [
      h('p', { class: 'ruh-kisi-ad' }, avatar(kisi), h('span', {}, kimAdi(kisi))),
    ];
    if (son) {
      parcalar.push(
        h('span', {
          class: `ruh-balon${bugunMu ? '' : ' eski'}`, role: 'img',
          'aria-label': `${kimAdi(kisi)}: ${hisAdi(son.emoji)}`,
        }, son.emoji),
        h('p', { class: 'ruh-his' }, hisAdi(son.emoji)),
        son.not ? h('p', { class: 'ruh-not' }, `“${son.not}”`) : null,
        h('p', { class: 'ruh-zaman' }, bugunMu ? saatYazi(son.at) : `Son paylaşım: ${formatDay(son.at)}`));
    } else {
      parcalar.push(
        h('span', { class: 'ruh-balon bos', 'aria-hidden': 'true' }),
        h('p', { class: 'ruh-his soluk' }, kisi.ben ? 'Henüz seçmedin' : 'Henüz paylaşmadı'));
    }
    if (kisi.ben && !bugunMu) {
      parcalar.push(h('a', { class: 'ruh-sec-btn', href: pageUrl(''), dataset: { k: 'bugun-sec' } }, 'Bugün nasılsın?'));
    }
    return h('div', { class: 'ruh-kisi' }, ...parcalar.filter(Boolean));
  };
  return h('section', { class: 'ruh-bugun', 'aria-labelledby': 'ruh-bugun-h' },
    h('header', { class: 'ruh-bugun-bas' },
      h('h2', { id: 'ruh-bugun-h' }, 'Bugün'),
      h('p', {}, M.gunBasligi(durum.bugun))),
    h('div', { class: 'ruh-bugun-ikili' }, sutun(k.ben, benim), sutun(k.o, onun)));
}

/** Bu hafta: kişi başına özet cümlesi ve Pzt–Paz şeridi. */
function haftaBolumu(k, benim, onun) {
  const satir = (kisi, gunler) => {
    const oz = M.haftaOzeti(gunler, durum.bugun);
    const c = M.haftaCumlesi(oz, { ben: kisi.ben, ad: kisi.ad });
    return h('div', { class: 'ruh-hafta-kisi' },
      avatar(kisi),
      h('div', { class: 'ruh-hafta-metin' },
        h('p', { class: 'ruh-hafta-cumle' }, c.baslik),
        c.alt ? h('p', { class: 'ruh-hafta-alt' }, c.alt) : null),
      h('ol', { class: 'ruh-serit', 'aria-label': `${kimAdi(kisi)}: bu haftanın günleri` },
        oz.gunler.map((g, i) => h('li', {
          class: [g.bugun && 'bugun', g.gelecek && 'gelecek'].filter(Boolean).join(' ') || null,
          'aria-label': `${M.gunBasligi(g.gun)}: ${g.gelecek ? 'henüz gelmedi' : g.ruh ? hisAdi(g.ruh.emoji) : 'paylaşılmadı'}`,
        },
          g.ruh ? h('span', { class: 'e', 'aria-hidden': 'true' }, g.ruh.emoji) : h('span', { class: 'e', 'aria-hidden': 'true' }, h('i', { class: 'ruh-nokta' })),
          h('span', { class: 'g', 'aria-hidden': 'true' }, M.GUN_KISA[i])))));
  };
  return h('section', { class: 'ruh-sec', 'aria-labelledby': 'ruh-hafta-h' },
    h('div', { class: 'ruh-sec-bas' }, h('h2', { id: 'ruh-hafta-h' }, 'Bu hafta')),
    h('div', { class: 'card ruh-hafta' }, satir(k.ben, benim), satir(k.o, onun)));
}

/** Takvim: 30 / 90 gün, haftalar satır; hücrede üstte benim, altta partnerin emojisi. */
function takvimBolumu(k, benim, onun) {
  const t = M.takvim(durum.bugun, durum.aralik);
  if (!durum.odak || durum.odak < t.baslangic || durum.odak > t.bitis) durum.odak = durum.secili || durum.bugun;
  if (durum.secili && (durum.secili < t.baslangic || durum.secili > t.bitis)) durum.secili = null;

  const seg = h('div', { class: 'seg ruh-seg', role: 'group', 'aria-label': 'Dönem' },
    ARALIKLAR.map((n) => h('button', {
      type: 'button', 'aria-pressed': String(durum.aralik === n), dataset: { k: `aralik-${n}` },
      onclick: () => { durum.aralik = n; yaz(ARALIK_ANAHTARI, String(n)); boya(); },
    }, `${n} gün`)));

  const lejant = h('p', { class: 'ruh-lejant' },
    h('span', {}, avatar(k.ben, 'mini'), 'Üstte sen'),
    h('span', {}, avatar(k.o, 'mini'), `Altta ${k.o.ad}`),
    h('span', {}, h('i', { class: 'ruh-ayni-ornek', 'aria-hidden': 'true' }), 'Aynı his'));

  const izgara = h('div', {
    class: 'ruh-takvim', role: 'group', 'aria-label': `Son ${durum.aralik} günün takvimi`,
    onkeydown: (e) => takvimTusu(e, t),
  }, h('div', { class: 'ruh-gunadlari', 'aria-hidden': 'true' }, M.GUN_KISA.map((g) => h('span', {}, g))));

  for (const hafta of t.haftalar) {
    izgara.append(h('div', { class: 'ruh-hafta-satir' }, hafta.map((c) => gunHucresi(c, k, benim, onun))));
    const kol = hafta.findIndex((c) => c.gun === durum.secili);
    if (kol >= 0) izgara.append(gunDetayi(durum.secili, kol, k, benim, onun));
  }

  return h('section', { class: 'ruh-sec', 'aria-labelledby': 'ruh-takvim-h' },
    h('div', { class: 'ruh-sec-bas' }, h('h2', { id: 'ruh-takvim-h' }, 'Takvim'), seg),
    lejant,
    izgara,
    donemOzeti(k, benim, onun));
}

function gunHucresi(c, k, benim, onun) {
  if (!c.aralikta) return h('span', { class: `ruh-bosluk${c.gelecek ? ' gelecek' : ''}`, 'aria-hidden': 'true' });
  const a = benim?.get(c.gun);
  const b = onun?.get(c.gun);
  const ayni = !!(a && b && a.emoji === b.emoji);
  const acik = durum.secili === c.gun;
  const etiket = [
    M.gunBasligi(c.gun) + (c.bugun ? ' (bugün)' : ''),
    `Sen: ${a ? hisAdi(a.emoji) : 'paylaşmadın'}`,
    `${k.o.ad}: ${b ? hisAdi(b.emoji) : 'paylaşmadı'}`,
    ayni ? 'aynı hissettiniz' : '',
  ].filter(Boolean).join(', ');
  const no = c.ayBasi ? `${c.gunNo} ${M.ayKisa(c.ay)}` : String(c.gunNo);
  const emoji = (v) => h('span', { class: 'e', 'aria-hidden': 'true' }, v ? v.emoji : h('i', { class: 'ruh-nokta' }));
  return h('button', {
    type: 'button',
    class: ['ruh-gun', c.bugun && 'bugun', ayni && 'ayni'].filter(Boolean).join(' '),
    'aria-label': etiket,
    'aria-expanded': String(acik),
    tabindex: durum.odak === c.gun ? '0' : '-1',
    dataset: { k: `gun-${c.gun}`, gun: c.gun },
    onclick: () => {
      durum.secili = acik ? null : c.gun;
      durum.odak = c.gun;
      boya();
    },
  },
    h('span', { class: `ruh-gun-no${c.ayBasi ? ' ay' : ''}`, 'aria-hidden': 'true' }, no),
    emoji(a), emoji(b));
}

function gunDetayi(gun, kol, k, benim, onun) {
  const satir = (kisi, v) => h('div', { class: 'ruh-detay-kisi' },
    avatar(kisi),
    h('div', { class: 'ruh-detay-metin' },
      h('p', { class: 'ruh-detay-his' },
        h('b', {}, kimAdi(kisi)), ' · ', v ? `${v.emoji} ${hisAdi(v.emoji)}` : (kisi.ben ? 'paylaşmadın' : 'paylaşmadı')),
      v?.not ? h('p', { class: 'ruh-detay-not' }, `“${v.not}”`) : null,
      v ? h('p', { class: 'ruh-zaman' }, new Date(v.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })) : null));
  return h('div', { class: 'ruh-detay', role: 'region', 'aria-label': `${M.gunBasligi(gun)} ayrıntısı`, style: { '--kol': String(kol) } },
    h('div', { class: 'ruh-detay-bas' },
      h('h3', {}, M.gunBasligi(gun)),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': 'Ayrıntıyı kapat', dataset: { k: 'detay-kapat' },
        onclick: () => {
          durum.secili = null;
          boya();
          app.querySelector(`[data-gun="${gun}"]`)?.focus({ preventScroll: true });
        },
      }, icon('close'))),
    satir(k.ben, benim?.get(gun)), satir(k.o, onun?.get(gun)));
}

function donemOzeti(k, benim, onun) {
  const satir = (kisi, gunler) => {
    const oz = M.donemOzeti(gunler, durum.bugun, durum.aralik);
    return h('div', { class: 'ruh-ozet-satir' },
      h('span', { class: 'ruh-ozet-ad' }, `${kimAdi(kisi)} · ${oz.paylasilan} gün`),
      oz.dagilim.length
        ? h('ul', { class: 'ruh-ciplar', 'aria-label': M.dagilimYazi(oz.dagilim) },
          oz.dagilim.slice(0, 4).map((d) => h('li', { class: 'ruh-cip', 'aria-hidden': 'true' }, h('span', {}, d.emoji), String(d.sayi))))
        : h('span', { class: 'ruh-ozet-bos' }, kisi.ben ? 'henüz paylaşmadın' : 'henüz paylaşmadı'));
  };
  const ayni = M.ayniGunSayisi(benim, onun, durum.bugun, durum.aralik);
  return h('div', { class: 'ruh-ozet' },
    h('h3', {}, `Son ${durum.aralik} günde`),
    satir(k.ben, benim), satir(k.o, onun),
    ayni ? h('p', { class: 'ruh-ayni' }, icon('heart'), `${ayni} gün aynı hissettiniz`) : null);
}

/** Takvimde ok tuşları: ←/→ bir gün, ↑/↓ bir hafta, Home/End ilk/son gün. */
function takvimTusu(e, t) {
  const hedef = e.target?.closest?.('.ruh-gun');
  if (!hedef) return;
  const adim = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  let yeni = null;
  if (adim) yeni = addDays(hedef.dataset.gun, adim);
  else if (e.key === 'Home') yeni = t.baslangic;
  else if (e.key === 'End') yeni = t.bitis;
  if (!yeni) return;
  e.preventDefault();
  if (yeni < t.baslangic) yeni = t.baslangic;
  if (yeni > t.bitis) yeni = t.bitis;
  durum.odak = yeni;
  for (const b of app.querySelectorAll('.ruh-gun')) b.tabIndex = b.dataset.gun === yeni ? 0 : -1;
  app.querySelector(`[data-gun="${yeni}"]`)?.focus();
}

// ---------- Canlı ----------

let bekleyen = 0;
const yeniden = () => {
  cancelAnimationFrame(bekleyen);
  bekleyen = requestAnimationFrame(boya);
};
gecmis.on('change', yeniden);
ruhKol.on('change', yeniden);
profil?.on('change', yeniden);
room.on?.('presence', yeniden);
// Bu sayfa yalnız okur: bağlantı hatası bir kez söylenir (önbellekteki günler görünmeye devam eder).
let uyarildi = false;
const hata = (e) => {
  if (uyarildi) return;
  uyarildi = true;
  toast(e?.message || 'Bağlantı sorunu; son kaydedilen günler gösteriliyor.');
};
gecmis.on('error', hata);
ruhKol.on('error', hata);
// Gece yarısı: "bugün" değişince yeniden çiz.
setInterval(() => { if (toDay(new Date()) !== durum.bugun) boya(); }, 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && toDay(new Date()) !== durum.bugun) boya(); });

boya();
eskileriYukle();
