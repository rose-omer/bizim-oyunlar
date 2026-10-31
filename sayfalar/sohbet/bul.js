// Sohbet içi arama: üstte arama alanı; altta (giriş alanının yerinde) sonuç sayısı ve yukarı/aşağı gezinti.
// Eşleşmeler balonlarda vurgulanır (app.js ciz → vurguSorgu), seçili sonuca kaydırılır (o.git).
// Liste görünümü ve yıldızlılar panel.js'te; "Daha eski mesajlarda ara" aynı geçmiş yükleme yolunu kullanır.
import { h, toast } from '../../js/core/ui.js';
import { mesajAra, gezinti, eskiSayfalardaAra, ARA_EN_COK_SONUC } from './arama.js';
import { ikon } from './ekran.js';

const kaba = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : { matches: false };

/**
 * o: { col, git(id | null, secenek?) seçili sonuca kaydır ve işaretle (null: işareti kaldır),
 *      cizdir() vurguları yeniden çiz, eskiYukle() -> Promise<sayı>, listeAc(sorgu, dugme), yildizAc(dugme),
 *      acildi(), kapandi({ odakGeriVer }) }
 * -> { ust, gez, ac(), kapat(), acikMi(), vurguSorgu(), simdiki(), sec(id, sorgu) -> bool, tazele() }
 */
export function sohbetBul(o) {
  const { col } = o;
  let acik = false;
  let sorgu = ''; // uygulanan (kırpılmış) sorgu
  let ids = []; // sonuçlar, yeniden eskiye
  let konum = null; // gezinti(): { id, sira, toplam, enYeni, enEski } | null
  let tarama = null; // { durdur, taranan }
  let durumAnahtar = null;

  const girdi = h('input', {
    type: 'search', class: 'sh-ara-girdi', placeholder: 'Sohbette ara', 'aria-label': 'Sohbette ara',
    enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '80',
  });
  const temizle = h('button', { type: 'button', class: 'sh-ara-temizle', 'aria-label': 'Aramayı temizle', hidden: true }, ikon('kapat'));
  const kapatBtn = h('button', { type: 'button', class: 'sh-ara-kapat' }, 'Kapat');
  const form = h('form', { class: 'sh-ara-ust', role: 'search' },
    h('label', { class: 'sh-ara-kutu' }, ikon('ara'), girdi, temizle), kapatBtn);
  const ust = h('div', { class: 'sh-bul', id: 'sh-bul', hidden: true }, h('div', { class: 'sh-sutun' }, form));

  const durum = h('div', { class: 'sh-bul-durum' });
  const canli = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  const listeBtn = h('button', {
    type: 'button', class: 'sh-ikon-btn', 'aria-label': 'Sonuçları listele', title: 'Sonuçları listele',
    'aria-controls': 'sh-ara', 'aria-expanded': 'false',
  }, ikon('liste'));
  const yukariBtn = h('button', { type: 'button', class: 'sh-ikon-btn sh-bul-ok' }, ikon('yukari'));
  const asagiBtn = h('button', { type: 'button', class: 'sh-ikon-btn sh-bul-ok', 'aria-label': 'Daha yeni sonuç', title: 'Daha yeni sonuç' }, ikon('asagiOk'));
  const gez = h('div', { class: 'sh-bul-gez', hidden: true, role: 'group', 'aria-label': 'Arama sonuçları' },
    durum, canli, listeBtn, yukariBtn, asagiBtn);

  // ---------- Hesap ve çizim ----------
  function hesapla({ basa = false } = {}) {
    ids = sorgu ? mesajAra(col.all(), sorgu).map((r) => r.doc.id) : [];
    konum = gezinti(ids, basa ? null : konum?.id ?? null, 0);
  }

  function durumCiz() {
    let anahtar;
    let kur;
    if (!sorgu) {
      anahtar = 'bos';
      kur = () => [h('button', {
        type: 'button', class: 'sh-bul-yazili sh-bul-yildiz', 'aria-controls': 'sh-ara', 'aria-expanded': 'false',
      }, ikon('yildiz'), 'Yıldızlılar')];
    } else if (tarama) {
      anahtar = `tarama|${tarama.taranan}`;
      kur = () => [
        h('span', { class: 'sh-donen', 'aria-hidden': 'true' }),
        h('span', { class: 'sh-bul-not' }, tarama.taranan ? `Taranıyor… ${tarama.taranan}` : 'Taranıyor…'),
        h('button', { type: 'button', class: 'sh-bul-yazili sh-bul-durdur' }, 'Durdur')];
    } else if (konum) {
      const fazla = ids.length >= ARA_EN_COK_SONUC ? '+' : '';
      anahtar = `sayi|${konum.sira}|${konum.toplam}${fazla}`;
      kur = () => [h('span', { class: 'sh-bul-sayi', 'aria-hidden': 'true' }, `${konum.sira} / ${konum.toplam}${fazla}`)];
    } else if (col.hasOlder()) {
      anahtar = 'eski';
      kur = () => [h('button', { type: 'button', class: 'sh-bul-yazili sh-bul-eski' }, ikon('saat'), 'Daha eski mesajlarda ara')];
    } else {
      anahtar = 'yok';
      kur = () => [h('span', { class: 'sh-bul-not' }, 'Sonuç yok')];
    }
    if (anahtar === durumAnahtar) return;
    const odakIcerde = durum.contains(document.activeElement);
    durumAnahtar = anahtar;
    durum.replaceChildren(...kur());
    // Düğme değişince odak kaybolmasın (klavyeyle devam).
    if (odakIcerde) (durum.querySelector('button') || yukariBtn).focus({ preventScroll: true });
  }

  const pasif = (b, p) => b.setAttribute('aria-disabled', String(!!p));
  function dugmeler() {
    const eskiVar = col.hasOlder();
    pasif(yukariBtn, !konum || tarama || (konum.enEski && !eskiVar));
    pasif(asagiBtn, !konum || tarama || konum.enYeni);
    const etiket = konum?.enEski && eskiVar ? 'Daha eski mesajlarda ara' : 'Daha eski sonuç';
    if (yukariBtn.getAttribute('aria-label') !== etiket) {
      yukariBtn.setAttribute('aria-label', etiket);
      yukariBtn.title = etiket;
    }
    listeBtn.hidden = !sorgu;
  }

  function duyur(yazi = null) {
    const s = yazi ?? (!sorgu || tarama ? ''
      : konum ? `${konum.toplam} sonuçtan ${konum.sira}.`
        : col.hasOlder() ? 'Yüklü mesajlarda sonuç yok.' : 'Sonuç yok.');
    if (canli.textContent !== s) canli.textContent = s;
  }

  function guncelle() {
    durumCiz();
    dugmeler();
    duyur();
  }

  // ---------- Sorgu ve gezinti ----------
  function sorguUygula(ham) {
    const yeni = String(ham ?? '').trim();
    if (yeni === sorgu) return;
    sorgu = yeni;
    if (tarama) { tarama.durdur = true; tarama = null; }
    hesapla({ basa: true });
    o.cizdir();
    o.git(konum?.id ?? null);
    guncelle();
  }

  async function git(yon) {
    if (!konum || tarama) return;
    if (yon > 0 && konum.enEski) {
      if (col.hasOlder()) await eskidenAra();
      return;
    }
    const k = gezinti(ids, konum.id, yon);
    if (k.id === konum.id) return;
    konum = k;
    o.git(k.id);
    guncelle();
  }

  async function eskidenAra() {
    if (tarama || !sorgu || !col.hasOlder()) return;
    const bu = { durdur: false, taranan: 0 };
    tarama = bu;
    const onceki = konum?.id ?? null;
    guncelle();
    const q = sorgu;
    let r = null;
    try {
      r = await eskiSayfalardaAra({
        yukle: () => o.eskiYukle(),
        dahaVar: () => col.hasOlder(),
        sonucSayisi: () => mesajAra(col.all(), q).length,
        durdu: () => bu.durdur,
        ilerleme: ({ taranan }) => { bu.taranan = taranan; if (tarama === bu) durumCiz(); },
      });
    } catch {
      r = null;
    }
    if (tarama !== bu) return; // kapandı ya da sorgu değişti
    tarama = null;
    hesapla();
    if (r?.yeni) {
      // Yeni sonuçlar yüklü olanlardan eskidir (sona eklenir): sıradakine geç.
      konum = onceki ? gezinti(ids, onceki, 1) : gezinti(ids, null);
      o.git(konum.id);
      guncelle();
      return;
    }
    guncelle();
    if (r && !r.durduruldu) {
      const yazi = r.bitti ? 'Sohbetin başına kadar bakıldı. Başka sonuç yok.' : `${r.taranan} eski mesaja daha bakıldı, sonuç yok.`;
      toast(yazi);
      duyur(yazi);
    }
  }

  // ---------- Olaylar ----------
  let bekle = 0;
  girdi.addEventListener('input', () => {
    temizle.hidden = !girdi.value;
    clearTimeout(bekle);
    bekle = setTimeout(() => sorguUygula(girdi.value), 160);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(bekle);
    const degisti = girdi.value.trim() !== sorgu;
    sorguUygula(girdi.value);
    if (kaba.matches) girdi.blur(); // telefonda klavye kapanır, eşleşme görünür
    else if (!degisti) git(1); // masaüstünde Enter sıradaki (daha eski) eşleşme
  });
  girdi.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); git(-1); }
  });
  temizle.addEventListener('click', () => {
    girdi.value = '';
    temizle.hidden = true;
    clearTimeout(bekle);
    sorguUygula('');
    girdi.focus();
  });
  kapatBtn.addEventListener('click', () => kapat());
  for (const el of [ust, gez]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); kapat(); }
    });
  }
  // Ok düğmeleri klavyeyi kapatmasın.
  for (const b of [yukariBtn, asagiBtn]) b.addEventListener('mousedown', (e) => e.preventDefault());
  yukariBtn.addEventListener('click', () => { if (yukariBtn.getAttribute('aria-disabled') !== 'true') git(1); });
  asagiBtn.addEventListener('click', () => { if (asagiBtn.getAttribute('aria-disabled') !== 'true') git(-1); });
  listeBtn.addEventListener('click', () => o.listeAc(sorgu, listeBtn));
  durum.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('sh-bul-yildiz')) o.yildizAc(b);
    else if (b.classList.contains('sh-bul-eski')) eskidenAra();
    else if (b.classList.contains('sh-bul-durdur') && tarama) tarama.durdur = true;
  });

  // ---------- Aç / kapat ----------
  function ac() {
    if (acik) { girdi.focus(); return; }
    acik = true;
    ust.hidden = false;
    gez.hidden = false;
    durumAnahtar = null;
    o.acildi?.();
    hesapla({ basa: true });
    guncelle();
    girdi.focus();
  }

  function kapat({ odakGeriVer = true } = {}) {
    if (!acik) return;
    acik = false;
    clearTimeout(bekle);
    if (tarama) tarama.durdur = true;
    tarama = null;
    sorgu = '';
    girdi.value = '';
    temizle.hidden = true;
    ids = [];
    konum = null;
    canli.textContent = '';
    ust.hidden = true;
    gez.hidden = true;
    o.git(null);
    o.cizdir();
    o.kapandi?.({ odakGeriVer });
  }

  /** Liste panelinden seçilen sonuç: çubuğun sorgusu ona uyar, gezinti o sonuçtan sürer. -> bulundu mu */
  function sec(id, yeniSorgu) {
    if (!acik) return false;
    const q = String(yeniSorgu ?? '').trim();
    if (q && q !== sorgu) {
      girdi.value = q;
      temizle.hidden = false;
      sorgu = q;
      if (tarama) { tarama.durdur = true; tarama = null; }
      o.cizdir();
    }
    hesapla();
    const k = gezinti(ids, id, 0);
    if (!k || k.id !== id) { guncelle(); return false; }
    konum = k;
    o.git(id, { odak: true });
    guncelle();
    return true;
  }

  /** Mesajlar değişince (yeni mesaj, eski yükleme) sayıyı tazeler; kaydırmaz. */
  function tazele() {
    if (!acik || !sorgu || tarama) return;
    hesapla();
    guncelle();
  }

  return {
    ust, gez, ac, kapat, sec, tazele,
    acikMi: () => acik,
    vurguSorgu: () => (acik ? sorgu : ''),
    simdiki: () => (acik ? konum?.id ?? null : null),
  };
}
