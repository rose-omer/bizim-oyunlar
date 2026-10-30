// Rozetlerimiz: mevcut veriden hesaplanan rozetler (saklanmaz). Açık/kilitli görünüm, ilerleme çubuğu.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { roomStats } from '../../js/core/db.js';
import { toDay } from '../../js/core/gunler.js';
import { h, toast } from '../../js/core/ui.js';
import { gunlereGore, ortakGunler, seri, gunNo } from '../gunun-sorusu/mantik.js';
import { geriYukle } from '../yilimiz/yukle.js';
import { simgeSvg } from '../yilimiz/simgeler.js';
import { GRUPLAR, ROZET_MESAJ_SINIRI, rozetHesapla, rozetOzeti, mesajRozetVerisi, mesajYeter } from './mantik.js';

const { room, roomId } = await bootPage({ ns: 'rozetler', title: 'Rozetlerimiz', tab: 'daha' });
const app = document.getElementById('app');
const kok = h('div', { class: 'rz' }, h('p', { class: 'rz-yukleniyor muted', role: 'status' }, 'Rozetler sayılıyor…'));
app.replaceChildren(kok);

const sayiFmt = new Intl.NumberFormat('tr-TR');
const n = (x) => sayiFmt.format(x || 0);

const [profil, gsCol, aniCol, mektupCol, dokunusCol, mesajCol, istatistik] = await Promise.all([
  openProfil(room).catch((e) => { console.warn('[rozet] profil', e); return null; }),
  openCollection(room, 'gs'),
  openCollection(room, 'ani'),
  openCollection(room, 'mektup'),
  openCollection(room, 'dokunus', { recent: 200 }),
  openCollection(room, 'mesaj', { recent: 200 }),
  roomStats(roomId),
]);
let sonHata = 0;
for (const c of [gsCol, aniCol, mektupCol, dokunusCol, mesajCol]) {
  c.on('error', (e) => { if (Date.now() - sonHata > 15000) { sonHata = Date.now(); toast(e.message); } });
}

let mesaj = null; // tarama bitince { sayi, foto, ses, tamam }
let dokunusSayisi = dokunusCol.all().length;

function veri() {
  return {
    baslangic: profil?.cift()?.baslangic || null,
    enUzunSeri: seri(ortakGunler(gunlereGore(gsCol.all())), gunNo()).enUzun,
    oyunSayisi: istatistik.reduce((s, x) => s + (x.played || 0), 0),
    aniSayisi: aniCol.all().length,
    mektupSayisi: mektupCol.all().length,
    dokunusSayisi,
    mesaj,
  };
}

// ---------- Parçalar ----------

function ozetEl(list) {
  const o = rozetOzeti(list);
  const oran = o.toplam ? o.acik / o.toplam : 0;
  return h('section', { class: 'rz-ozet', 'aria-label': 'Özet' },
    h('span', { class: 'rz-ozet-madalya', html: simgeSvg('madalya', 1.5) }),
    h('p', { class: 'rz-ozet-sayi' }, h('span', { class: 'rz-ozet-n' }, n(o.acik)), ` / ${n(o.toplam)} rozet açık`),
    h('span', { class: 'rz-cubuk', role: 'progressbar', 'aria-label': 'Açılan rozetler', 'aria-valuemin': '0', 'aria-valuemax': String(o.toplam), 'aria-valuenow': String(o.acik) },
      h('span', { style: { transform: `scaleX(${oran.toFixed(3)})` } })),
    o.siradaki
      ? h('p', { class: 'rz-ozet-sira' }, 'Sıradaki: ', h('strong', {}, o.siradaki.baslik), ` · ${o.siradaki.durum}`)
      : null);
}

function rozetEl(r) {
  const durum = r.acik ? 'acik' : r.bekliyor ? 'bekliyor' : 'kilitli';
  return h('li', { class: 'rz-rozet', dataset: { durum } },
    h('span', { class: 'rz-madalya' },
      h('span', { class: 'rz-simge', html: simgeSvg(r.simge, 1.6) }),
      r.acik ? null : h('span', { class: 'rz-kilit', html: simgeSvg('kilit', 2) })),
    h('span', { class: 'rz-ad' }, r.baslik),
    h('span', { class: 'rz-aciklama' }, r.aciklama),
    !r.acik && !r.bekliyor && r.oran > 0
      ? h('span', { class: 'rz-ilerleme', 'aria-hidden': 'true' }, h('span', { style: { transform: `scaleX(${r.oran.toFixed(3)})` } }))
      : null,
    h('span', { class: 'rz-durum' }, h('span', { class: 'sr-only' }, r.acik ? 'Açık. ' : 'Kilitli. '), r.durum));
}

function ciz() {
  const list = rozetHesapla(veri(), { bugun: toDay(new Date()) });
  const gruplar = GRUPLAR.map((g) => {
    const icindekiler = list.filter((r) => r.grup === g.id);
    if (!icindekiler.length) return null;
    return h('section', { class: 'rz-grup', 'aria-labelledby': `rz-h-${g.id}` },
      h('h2', { id: `rz-h-${g.id}` }, g.baslik),
      h('ul', { class: 'rz-izgara', role: 'list' }, icindekiler.map(rozetEl)));
  });
  const not = mesaj && !mesaj.tamam
    ? h('p', { class: 'rz-not muted' }, `Mesaj rozetleri için son ${n(ROZET_MESAJ_SINIRI)} mesaja bakıldı.`)
    : null;
  kok.replaceChildren(...[ozetEl(list), ...gruplar, not].filter(Boolean));
}

ciz();
for (const c of [gsCol, aniCol, mektupCol]) c.on('change', ciz);
profil?.on('change', ciz);

// Uzun türler: yalnız gerektiği kadar geriye bakılır (yeter koşulu taramayı erken bitirir).
try {
  const d = await geriYukle(dokunusCol, { kadar: 0, yeter: (docs) => docs.length >= 100 });
  dokunusSayisi = d.docs.length;
  const m = await geriYukle(mesajCol, { kadar: 0, sinir: ROZET_MESAJ_SINIRI, yeter: mesajYeter });
  mesaj = { ...mesajRozetVerisi(m.docs), tamam: m.tamam };
} catch (e) {
  console.warn('[rozet] tarama', e);
  toast('Mesajlara bakılamadı. Bağlantını kontrol et.');
  dokunusSayisi = dokunusCol.all().length;
  mesaj = { ...mesajRozetVerisi(mesajCol.all()), tamam: false };
}
ciz();
