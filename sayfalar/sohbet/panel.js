// Sohbet: arama ve yıldızlılar paneli. Mesaj listesinin üstünü kaplar; sonuca dokununca panel kapanır,
// mesaja kaydırılır ve vurgulanır (mesajaGit). Kullanıcı metni yalnız metin düğümü olarak basılır.
import { h } from '../../js/core/ui.js';
import { gonderen, ozet, gunEtiketi, saatEtiketi } from './mantik.js';
import { mesajAra, yildizlilar, yildizlayanlar, vurguParcalari, eskiSayfalardaAra, ARA_EN_COK_SONUC } from './arama.js';
import { ikon } from './ekran.js';

/**
 * o: { col, benId, ad(clientId) -> 'Sen' | partner adı, partnerAd(), mesajaGit(id), eskiYukle() -> Promise<sayı>,
 *      arkaPlan: [öğe] (açıkken inert), donus: odak dönecek düğme }
 * -> { el, ac(mod), kapat(), acikMi(), guncelle() }
 */
export function aramaPaneli(o) {
  const { col, benId } = o;
  let mod = 'ara'; // 'ara' | 'yildiz'
  let kim = 'hepsi';
  let sorgu = '';
  let tarama = null; // { durdur: bool, taranan }
  let sonBilgi = '';
  let sonucSayisi = 0;

  const girdi = h('input', {
    type: 'search', class: 'sh-ara-girdi', placeholder: 'Mesajlarda ara', 'aria-label': 'Mesajlarda ara',
    enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '80',
  });
  const temizle = h('button', { type: 'button', class: 'sh-ara-temizle', 'aria-label': 'Aramayı temizle', hidden: true }, ikon('kapat'));
  const kapatBtn = h('button', { type: 'button', class: 'sh-ara-kapat' }, 'Kapat');
  const ust = h('form', { class: 'sh-ara-ust', role: 'search' },
    h('label', { class: 'sh-ara-kutu' }, ikon('ara'), girdi, temizle), kapatBtn);

  const modBtn = (m, yazi) => h('button', { type: 'button', 'aria-pressed': 'false', dataset: { mod: m } }, yazi);
  const seg = h('div', { class: 'seg sh-ara-seg', role: 'group', 'aria-label': 'Görünüm' },
    modBtn('ara', 'Mesajlar'), modBtn('yildiz', 'Yıldızlılar'));
  const suzgec = h('div', { class: 'sh-ara-suzgec', role: 'group', 'aria-label': 'Kimin yıldızladıkları' });
  const bilgi = h('p', { class: 'sh-ara-bilgi', 'aria-live': 'polite' });
  const sonuclar = h('ol', { class: 'sh-ara-sonuclar', 'aria-label': 'Sonuçlar' });
  const alt = h('div', { class: 'sh-ara-alt' });
  const el = h('section', { class: 'sh-ara', id: 'sh-ara', 'aria-label': 'Arama ve yıldızlılar', hidden: true },
    h('div', { class: 'sh-ara-bas' }, h('div', { class: 'sh-sutun' }, ust, seg, suzgec)),
    h('div', { class: 'sh-sutun sh-ara-govde' }, bilgi, sonuclar, alt));

  // ---------- Çizim ----------
  function suzgecCiz() {
    const secenek = [['hepsi', 'İkimiz'], ['ben', 'Ben'], ['o', o.partnerAd()]];
    suzgec.replaceChildren(...secenek.map(([k, yazi]) => h('button', {
      type: 'button', class: 'sh-suzgec', 'aria-pressed': String(kim === k), dataset: { kim: k },
    }, yazi)));
  }

  function zamanYazisi(doc) {
    const g = gunEtiketi(doc.created_at);
    const s = saatEtiketi(doc.created_at);
    return g && s ? `${g} · ${s}` : g || s;
  }

  function sonucEl(doc, parcalar) {
    const metin = h('span', { class: 'sh-sonuc-metin' });
    if (parcalar) {
      for (const p of parcalar) metin.append(p.vurgu ? h('mark', {}, p.metin) : document.createTextNode(p.metin));
    } else {
      metin.append(document.createTextNode(ozet(doc.data, 140) || 'Mesaj'));
    }
    const ustSatir = h('span', { class: 'sh-sonuc-ust' },
      h('span', { class: 'sh-sonuc-kim' }, o.ad(gonderen(doc))),
      h('span', { class: 'sh-sonuc-zaman' }, zamanYazisi(doc)));
    let yildizSatir = null;
    if (mod === 'yildiz') {
      const kimler = yildizlayanlar(doc).map((k) => (k === benId ? 'Sen' : o.partnerAd()));
      yildizSatir = h('span', { class: 'sh-sonuc-yildiz' }, ikon('yildizDolu'),
        h('span', {}, `${[...new Set(kimler)].join(' ve ')} yıldızladı`));
    }
    return h('li', {}, h('button', { type: 'button', class: 'sh-sonuc', dataset: { id: doc.id } }, ustSatir, metin, yildizSatir));
  }

  function liste() {
    const docs = col.all();
    if (mod === 'ara') return mesajAra(docs, sorgu).map((r) => ({ doc: r.doc, parcalar: r.parcalar }));
    const y = yildizlilar(docs, { benId, kim });
    if (!sorgu.trim()) return y.map((doc) => ({ doc, parcalar: null }));
    const metinli = new Set(mesajAra(y.slice().reverse(), sorgu).map((r) => r.doc.id));
    return y.filter((d) => metinli.has(d.id)).map((doc) => ({ doc, parcalar: vurguParcalari(doc.data.metin, sorgu) }));
  }

  function bilgiYaz(yazi, { gizli = false } = {}) {
    bilgi.classList.toggle('sr-only', gizli); // boş durum kartı aynı metni zaten gösteriyor
    if (yazi === sonBilgi) return; // canlı bölge her çizimde yeniden okunmasın
    sonBilgi = yazi;
    bilgi.textContent = yazi;
  }

  function altCiz(bulunan) {
    const sorguVar = !!sorgu.trim();
    if (tarama) {
      alt.replaceChildren(h('div', { class: 'sh-ara-tarama', role: 'status' },
        h('span', { class: 'sh-donen', 'aria-hidden': 'true' }),
        h('span', {}, tarama.taranan ? `Eski mesajlar taranıyor… ${tarama.taranan} mesaj` : 'Eski mesajlar taranıyor…'),
        h('button', { type: 'button', class: 'btn small ghost sh-ara-durdur' }, 'Durdur')));
      return;
    }
    if (col.hasOlder() && (mod === 'yildiz' || sorguVar)) {
      const yazi = mod === 'ara' ? 'Daha eski mesajlarda ara' : 'Daha eski yıldızlılara bak';
      alt.replaceChildren(h('button', { type: 'button', class: 'btn sh-ara-eski' }, ikon('saat'), yazi));
      return;
    }
    if (!col.hasOlder() && (sorguVar || mod === 'yildiz') && bulunan >= 0) {
      alt.replaceChildren(h('p', { class: 'sh-ara-son' }, ikon('kalp'), 'Sohbetin başına kadar bakıldı'));
      return;
    }
    alt.replaceChildren();
  }

  function guncelle() {
    if (el.hidden) return;
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.mod === mod));
    suzgec.hidden = mod !== 'yildiz';
    if (mod === 'yildiz') suzgecCiz();
    temizle.hidden = !girdi.value;
    const sorguVar = !!sorgu.trim();

    if (mod === 'ara' && !sorguVar) {
      sonucSayisi = 0;
      sonuclar.replaceChildren();
      bilgiYaz('');
      sonuclar.append(h('li', { class: 'sh-ara-ipucu' },
        h('span', { class: 'sh-ara-ipucu-ik', 'aria-hidden': 'true' }, ikon('ara')),
        h('span', { class: 'sh-ara-ipucu-baslik' }, 'Ne arıyorsun?'),
        h('span', { class: 'sh-ara-ipucu-alt' }, 'Bir kelime yaz. Büyük küçük harf, ş-s ya da ı-i fark etmez.')));
      altCiz(-1);
      return;
    }
    const l = liste();
    sonucSayisi = l.length;
    sonuclar.replaceChildren(...l.map((r) => sonucEl(r.doc, r.parcalar)));
    if (!l.length) {
      const bosYazi = mod === 'ara'
        ? `“${sorgu.trim()}” ${col.hasOlder() ? 'yüklü mesajlarda' : 'sohbetinizde'} yok.`
        : sorguVar ? 'Bu kelimeyle yıldızlı mesaj yok.'
          : kim === 'hepsi' ? 'Henüz yıldızlı mesaj yok.' : kim === 'ben' ? 'Henüz bir mesaj yıldızlamadın.' : `${o.partnerAd()} henüz bir mesaj yıldızlamadı.`;
      const altYazi = mod === 'yildiz' && !sorguVar
        ? 'Saklamak istediğin bir mesaja basılı tut, “Yıldızla”yı seç.'
        : col.hasOlder() ? 'Daha eski mesajlara da bakabilirim.' : 'Başka bir kelime dene.';
      sonuclar.append(h('li', { class: 'sh-ara-ipucu' },
        h('span', { class: 'sh-ara-ipucu-ik', 'aria-hidden': 'true' }, ikon(mod === 'yildiz' ? 'yildiz' : 'ara')),
        h('span', { class: 'sh-ara-ipucu-baslik' }, bosYazi),
        h('span', { class: 'sh-ara-ipucu-alt' }, altYazi)));
      bilgiYaz(bosYazi, { gizli: true });
    } else {
      const fazla = mod === 'ara' && l.length >= ARA_EN_COK_SONUC ? ` (ilk ${ARA_EN_COK_SONUC})` : '';
      bilgiYaz(mod === 'ara' ? `${l.length} sonuç${fazla}` : `${l.length} yıldızlı mesaj`);
    }
    altCiz(l.length);
  }

  // ---------- Eski mesajlarda ara ----------
  async function eskidenAra() {
    if (tarama || !col.hasOlder()) return;
    tarama = { durdur: false, taranan: 0 };
    const bu = tarama;
    guncelle();
    let r;
    try {
      r = await eskiSayfalardaAra({
        yukle: () => o.eskiYukle(),
        dahaVar: () => col.hasOlder(),
        sonucSayisi: () => liste().length,
        durdu: () => bu.durdur,
        ilerleme: ({ taranan }) => { bu.taranan = taranan; if (tarama === bu) altCiz(sonucSayisi); },
      });
    } catch (e) {
      r = null;
      bilgiYaz(e?.message || 'Eski mesajlar yüklenemedi.');
    }
    if (tarama !== bu) return;
    tarama = null;
    guncelle();
    if (r && !r.yeni && !r.durduruldu) {
      bilgiYaz(r.bitti ? `${r.taranan} eski mesaja daha bakıldı; sonuç çıkmadı.` : `${r.taranan} eski mesaja daha bakıldı. İstersen devam et.`);
    } else if (r?.yeni) {
      bilgiYaz(`${r.yeni} yeni sonuç bulundu`);
    }
  }

  // ---------- Olaylar ----------
  let bekle = 0;
  girdi.addEventListener('input', () => {
    temizle.hidden = !girdi.value;
    clearTimeout(bekle);
    bekle = setTimeout(() => { sorgu = girdi.value; guncelle(); }, 140);
  });
  ust.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(bekle);
    sorgu = girdi.value;
    guncelle();
    girdi.blur(); // telefonda klavye kapanır, sonuçlar görünür
  });
  temizle.addEventListener('click', () => {
    girdi.value = '';
    sorgu = '';
    guncelle();
    girdi.focus();
  });
  kapatBtn.addEventListener('click', () => kapat());
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mod]');
    if (!b || b.dataset.mod === mod) return;
    mod = b.dataset.mod;
    if (tarama) tarama.durdur = true;
    girdi.placeholder = mod === 'ara' ? 'Mesajlarda ara' : 'Yıldızlılarda ara';
    guncelle();
  });
  suzgec.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kim]');
    if (!b) return;
    kim = b.dataset.kim;
    guncelle();
  });
  el.addEventListener('click', (e) => {
    const s = e.target.closest('.sh-sonuc');
    if (s) { kapat({ odakGeriVer: false }); o.mesajaGit(s.dataset.id); return; }
    if (e.target.closest('.sh-ara-eski')) { eskidenAra(); return; }
    if (e.target.closest('.sh-ara-durdur') && tarama) tarama.durdur = true;
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); }
  });

  // ---------- Aç / kapat ----------
  function ac(yeniMod = 'ara') {
    mod = yeniMod;
    girdi.placeholder = mod === 'ara' ? 'Mesajlarda ara' : 'Yıldızlılarda ara';
    el.hidden = false;
    for (const a of o.arkaPlan) a.inert = true;
    o.donus?.setAttribute('aria-expanded', 'true');
    sonBilgi = null;
    guncelle();
    if (mod === 'ara') girdi.focus();
    else seg.querySelector('[aria-pressed="true"]')?.focus();
  }

  function kapat({ odakGeriVer = true } = {}) {
    if (el.hidden) return;
    if (tarama) tarama.durdur = true;
    tarama = null;
    el.hidden = true;
    for (const a of o.arkaPlan) a.inert = false;
    o.donus?.setAttribute('aria-expanded', 'false');
    if (odakGeriVer) o.donus?.focus();
  }

  return { el, ac, kapat, acikMi: () => !el.hidden, guncelle };
}
