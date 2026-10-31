// Sohbet araması ve yıldızlılar: saf mantık (DOM yok; Node'da test edilir).
// Arama Türkçe büyük/küçük harf ve aksan duyarsızdır: ı/i/İ/I → i, ş → s, ğ → g, ü → u, ö → o, ç → c, â → a ...

export const ARA_EN_COK_SAYFA = 10; // "Daha eski mesajlarda ara" bir basışta en çok bu kadar sayfa (×50) tarar
export const ARA_EN_COK_SONUC = 200;
const PENCERE = 90;

// NFD ile ayrışmayan ya da varsayılan küçültmesi Türkçeye uymayan harfler.
const OZEL = { ı: 'i', İ: 'i', I: 'i' };
const BOSLUK = /\s/u;
const ISARET = /\p{M}/gu;

function harfKatla(ch) {
  if (OZEL[ch]) return OZEL[ch];
  return ch.normalize('NFD').replace(ISARET, '').toLowerCase();
}

/**
 * Metni katlar. -> { s, bas, son }: s katlanmış metin; s'nin her UTF-16 birimi için asıl metindeki
 * harfin başı (bas) ve sonu (son). Boşluk dizisi tek ' ' olur.
 */
export function katla(metin) {
  const asil = String(metin ?? '');
  let s = '';
  const bas = [];
  const son = [];
  let i = 0;
  let oncekiBosluk = false;
  for (const ch of asil) {
    const j = i;
    i += ch.length;
    let k;
    if (BOSLUK.test(ch)) {
      if (oncekiBosluk) continue;
      oncekiBosluk = true;
      k = ' ';
    } else {
      k = harfKatla(ch);
      if (!k) continue; // tek başına aksan işareti
      oncekiBosluk = false;
    }
    s += k;
    for (let n = 0; n < k.length; n++) { bas.push(j); son.push(i); }
  }
  return { s, bas, son };
}

const onbellek = new Map();
function katlaBellekli(metin) {
  let k = onbellek.get(metin);
  if (!k) {
    if (onbellek.size > 4000) onbellek.clear();
    k = katla(metin);
    onbellek.set(metin, k);
  }
  return k;
}

const sorguKatla = (sorgu) => katla(sorgu).s.trim();

/** Asıl metinde sorgunun geçtiği aralıklar [[bas, son), ...], soldan sağa, örtüşmeden. */
export function eslesmeler(metin, sorgu) {
  const q = sorguKatla(sorgu);
  if (!q || metin == null) return [];
  const k = katlaBellekli(String(metin));
  const out = [];
  let i = k.s.indexOf(q);
  while (i >= 0) {
    out.push([k.bas[i], k.son[i + q.length - 1]]);
    i = k.s.indexOf(q, i + q.length);
  }
  return out;
}

const tekBosluk = (s) => s.replace(/\s+/g, ' ');
const yuksekVekil = (c) => c >= 0xd800 && c <= 0xdbff;
const alcakVekil = (c) => c >= 0xdc00 && c <= 0xdfff;

/**
 * Sonuç önizlemesi: [{ metin, vurgu }]. Uzun metin ilk eşleşmenin çevresinde ~pencere harfe kısalır ('…').
 * Boşluk dizileri tek boşluk olur. Eşleşme yoksa baştan kısaltılmış düz metin.
 */
export function vurguParcalari(metin, sorgu, { pencere = PENCERE } = {}) {
  const asil = String(metin ?? '').trim();
  const araliklar = eslesmeler(asil, sorgu);
  let bas = 0;
  let son = asil.length;
  if (son > pencere) {
    const [m0, m1] = araliklar[0] || [0, 0];
    const kalan = Math.max(0, pencere - (m1 - m0));
    bas = Math.max(0, m0 - Math.floor(kalan / 2));
    son = Math.min(asil.length, bas + pencere);
    bas = Math.max(0, son - pencere);
    if (bas > 0 && alcakVekil(asil.charCodeAt(bas))) bas++;
    if (son < asil.length && yuksekVekil(asil.charCodeAt(son - 1))) son--;
  }
  const out = [];
  const ekle = (s, vurgu) => {
    if (!s) return;
    const son2 = out[out.length - 1];
    if (son2 && son2.vurgu === vurgu) son2.metin += s;
    else out.push({ metin: s, vurgu });
  };
  if (bas > 0) ekle('…', false);
  let i = bas;
  for (const [a, b] of araliklar) {
    if (b <= bas || a >= son) continue;
    const a2 = Math.max(a, bas);
    const b2 = Math.min(b, son);
    ekle(tekBosluk(asil.slice(i, a2)), false);
    ekle(tekBosluk(asil.slice(a2, b2)), true);
    i = b2;
  }
  ekle(tekBosluk(asil.slice(i, son)), false);
  if (son < asil.length) ekle('…', false);
  return out;
}

/** Yüklü mesajlarda arama. -> [{ doc, parcalar }] yeniden eskiye. Yalnız metin aranır. */
export function mesajAra(docs, sorgu, { enCok = ARA_EN_COK_SONUC } = {}) {
  const q = sorguKatla(sorgu);
  const list = docs || [];
  const out = [];
  if (!q) return out;
  for (let i = list.length - 1; i >= 0 && out.length < enCok; i--) {
    const d = list[i];
    const metin = typeof d?.data?.metin === 'string' ? d.data.metin : '';
    if (!metin || d.deleted) continue;
    if (!katlaBellekli(metin).s.includes(q)) continue;
    out.push({ doc: d, parcalar: vurguParcalari(metin, sorgu) });
  }
  return out;
}

/**
 * Balon parçalarını (mantik.js baglantilar) eşleşme aralıklarıyla böler; parçaların metni değişmez.
 * araliklar: asıl metinde [[bas, son), ...] soldan sağa. -> parçalar + bolumler: [{ metin, vurgu }]
 */
export function araliklaBol(parcalar, araliklar) {
  const ar = araliklar || [];
  let ofset = 0;
  let k = 0;
  return (parcalar || []).map((p) => {
    const bas = ofset;
    const son = ofset + p.metin.length;
    ofset = son;
    const bolumler = [];
    const ekle = (a, b, vurgu) => { if (b > a) bolumler.push({ metin: p.metin.slice(a - bas, b - bas), vurgu }); };
    let i = bas;
    while (k < ar.length && ar[k][0] < son) {
      const [a, b] = ar[k];
      if (b > i) {
        ekle(i, Math.max(i, a), false);
        ekle(Math.max(i, a), Math.min(b, son), true);
        i = Math.min(b, son);
      }
      if (b > son) break; // aralık sonraki parçaya taşıyor
      k++;
    }
    ekle(i, son, false);
    return { ...p, bolumler };
  });
}

/**
 * Sohbet içi arama gezintisi. ids: sonuçlar yeniden eskiye (mesajAra sırası). simdiki: seçili sonuç;
 * yoksa ya da artık sonuçlarda değilse en yeni. yon: 1 daha eski (yukarı), -1 daha yeni (aşağı), 0 yerinde.
 * Sınırda kalır. -> { id, sira (1 = en yeni), toplam, enYeni, enEski } | null (sonuç yok)
 */
export function gezinti(ids, simdiki, yon = 0) {
  const list = ids || [];
  if (!list.length) return null;
  let i = simdiki != null ? list.indexOf(simdiki) : -1;
  if (i < 0) i = 0;
  else i = Math.min(list.length - 1, Math.max(0, i + Math.sign(yon)));
  return { id: list[i], sira: i + 1, toplam: list.length, enYeni: i === 0, enEski: i === list.length - 1 };
}

/** Mesajı yıldızlayanlar (clientId listesi). */
export function yildizlayanlar(doc) {
  const y = doc?.data?.yildiz;
  if (!y || typeof y !== 'object') return [];
  return Object.keys(y).filter((k) => y[k] === true);
}

/**
 * Yıldızlı mesajlar, yeniden eskiye. kim: 'hepsi' (ikimiz) | 'ben' | 'o' (partner).
 */
export function yildizlilar(docs, { benId, kim = 'hepsi' } = {}) {
  const out = [];
  const list = docs || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    if (!d || d.deleted) continue;
    const kimler = yildizlayanlar(d);
    const uygun = kim === 'ben' ? kimler.includes(benId)
      : kim === 'o' ? kimler.some((k) => k !== benId)
        : kimler.length > 0;
    if (uygun) out.push(d);
  }
  return out;
}

/**
 * "Daha eski mesajlarda ara": sayfa sayfa eski mesaj yükler; yeni sonuç çıkınca (ilkSonuctaDur),
 * eski kalmayınca, kullanıcı durdurunca ya da enCokSayfa dolunca durur.
 * yukle() -> yüklenen mesaj sayısı. -> { sayfa, taranan, yeni, bitti, durduruldu }
 */
export async function eskiSayfalardaAra({
  yukle, dahaVar, sonucSayisi, enCokSayfa = ARA_EN_COK_SAYFA, ilerleme, durdu, ilkSonuctaDur = true,
}) {
  const ilk = sonucSayisi();
  let sayfa = 0;
  let taranan = 0;
  let durduruldu = false;
  while (sayfa < enCokSayfa && dahaVar()) {
    if (durdu?.()) { durduruldu = true; break; }
    taranan += (await yukle()) || 0;
    sayfa++;
    ilerleme?.({ sayfa, taranan, enCokSayfa });
    if (ilkSonuctaDur && sonucSayisi() > ilk) break;
  }
  return { sayfa, taranan, yeni: sonucSayisi() - ilk, bitti: !dahaVar(), durduruldu };
}
