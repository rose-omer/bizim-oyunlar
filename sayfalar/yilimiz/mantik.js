// Yılımız: saf hesap (DOM yok; Node'da test edilir). Bir yılın mesaj, anı, soru, oyun, dokunuş özeti ve hikâye kartları.
import { parseDay, toDay, daysBetween, milestonesBetween } from '../../js/core/gunler.js';
import { skorTablosu } from '../../js/core/skor.js';
import { gonderen, gunAnahtari } from '../sohbet/mantik.js';
import { AY_ADLARI, aramaMetni, filtrele, tumEtiketler, gunYazi } from '../anilar/mantik.js';
import { gunlereGore, ortakGunler, seri, gunNo, gunTarihi } from '../gunun-sorusu/mantik.js';

/** Bir yıl için en çok yüklenecek mesaj (ve dokunuş) sayısı. */
export const MESAJ_SINIRI = 20000;
const GECE_SON_SAAT = 6; // 00.00–05.59 gece sayılır

const sayiFmt = new Intl.NumberFormat('tr-TR');
export const sayiYaz = (n) => sayiFmt.format(n || 0);

const zaman = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : NaN; };
const yilOf = (iso) => { const t = zaman(iso); return Number.isNaN(t) ? null : new Date(t).getFullYear(); };
const gunStr = (v) => (typeof v === 'string' ? v : toDay(v));
const say = (map, k) => map.set(k, (map.get(k) || 0) + 1);
/** Map'te en büyük değer; eşitlikte önce eklenen. -> [anahtar, sayı] | null */
const enCok = (map) => {
  let best = null;
  for (const e of map) if (!best || e[1] > best[1]) best = e;
  return best;
};

// ---------- Yıl seçimi ----------

/** Seçilebilir yıllar, yeniden eskiye: başlangıç yılından bu yıla + ek yıllar (gelecek yok). */
export function yilSecenekleri({ baslangic = null, bugun = new Date(), ekYillar = [] } = {}) {
  const buYil = parseDay(gunStr(bugun)).y;
  const set = new Set([buYil]);
  const bas = parseDay(baslangic);
  if (bas) for (let y = Math.max(bas.y, buYil - 50); y < buYil; y++) set.add(y);
  for (const y of ekYillar || []) if (Number.isInteger(y) && y <= buYil && y > buYil - 100) set.add(y);
  return [...set].sort((a, b) => b - a);
}

/** Ocakta geçen yılın özeti daha anlamlı; sonra bu yıl. */
export function varsayilanYil(secenekler, bugun = new Date()) {
  const t = parseDay(gunStr(bugun));
  if (t.m === 1 && secenekler.includes(t.y - 1)) return t.y - 1;
  return secenekler.includes(t.y) ? t.y : secenekler[0];
}

/** O yıl birlikte geçen gün sayısı (başlangıç günü dahil, bugüne dek). */
export function birlikteGun(baslangic, yil, bugun = new Date()) {
  if (!parseDay(baslangic)) return 0;
  const t = gunStr(bugun);
  const bas = baslangic > `${yil}-01-01` ? baslangic : `${yil}-01-01`;
  const son = t < `${yil}-12-31` ? t : `${yil}-12-31`;
  return bas > son ? 0 : daysBetween(bas, son) + 1;
}

// ---------- Özetler ----------

/** Mesajlar (created_at yerel yılı). */
export function mesajOzeti(docs, yil) {
  const kisiler = {};
  const gunler = new Map();
  const aylar = new Map();
  const tepkiler = new Map();
  let sayi = 0; let gece = 0; let foto = 0; let ses = 0;
  for (const d of docs || []) {
    if (yilOf(d?.created_at) !== yil) continue;
    sayi++;
    const kim = gonderen(d);
    if (kim) kisiler[kim] = (kisiler[kim] || 0) + 1;
    const an = new Date(zaman(d.created_at));
    say(gunler, gunAnahtari(d.created_at));
    say(aylar, an.getMonth() + 1);
    if (an.getHours() < GECE_SON_SAAT) gece++;
    const data = d.data || {};
    if (data.foto) foto++;
    if (data.ses) ses++;
    if (data.tepki && typeof data.tepki === 'object') {
      for (const e of Object.values(data.tepki)) if (typeof e === 'string' && e) say(tepkiler, e);
    }
  }
  const sirali = (m) => new Map([...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const g = enCok(sirali(gunler));
  const a = enCok(new Map([...aylar].sort((x, y) => x[0] - y[0])));
  const t = enCok(tepkiler);
  return {
    sayi, kisiler,
    enYogunGun: g ? { gun: g[0], sayi: g[1] } : null,
    enYogunAy: a ? { ay: a[0], sayi: a[1] } : null,
    gece,
    tepki: t ? { emoji: t[0], sayi: t[1] } : null,
    foto, ses,
  };
}

/** Anılar (anının kendi tarihi). */
export function aniOzeti(docs, yil) {
  const yillik = filtrele(docs, { yil });
  const yerler = new Map();
  for (const d of yillik) {
    const yer = String(d.data?.yer || '').trim();
    if (!yer) continue;
    const k = aramaMetni(yer);
    const cur = yerler.get(k);
    if (cur) cur.sayi++; else yerler.set(k, { yer, sayi: 1 });
  }
  const yer = [...yerler.values()].reduce((b, x) => (!b || x.sayi > b.sayi ? x : b), null);
  const foto = yillik.reduce((s, d) => s + (Array.isArray(d.data?.fotolar) ? d.data.fotolar.length : 0), 0);
  return { sayi: yillik.length, foto, etiket: tumEtiketler(yillik)[0] || null, yer };
}

/** Günün Sorusu: ikinizin cevapladığı günler ve o yılın en uzun serisi. */
export function soruOzeti(docs, yil, bugun = new Date()) {
  const gunler = [...ortakGunler(gunlereGore(docs))].filter((g) => gunTarihi(g).startsWith(`${yil}-`));
  const son = Math.min(gunNo(gunStr(bugun)), gunNo(`${yil}-12-31`));
  return { gun: gunler.length, enUzun: gunler.length ? seri(gunler, son).enUzun : 0 };
}

/** Dokunuşlar (data.at, yoksa created_at). Gönderen = yazan. */
export function dokunusOzeti(docs, yil) {
  const kisiler = {};
  const turler = new Map();
  let sayi = 0;
  for (const d of docs || []) {
    if (yilOf(d?.data?.at || d?.created_at) !== yil) continue;
    sayi++;
    if (d.author) kisiler[d.author] = (kisiler[d.author] || 0) + 1;
    if (d.data?.tur) say(turler, d.data.tur);
  }
  const t = enCok(turler);
  return { sayi, kisiler, enCok: t ? t[0] : null };
}

/** Oyunlar: skor belgelerinin o yılki sayaçları. */
export function oyunOzeti(skorHarita, ids, yil) {
  const t = skorTablosu(skorHarita, ids, { yil });
  const en = t.oyunlar.reduce((b, o) => (o.toplam && (!b || o.toplam > b.toplam) ? o : b), null);
  return { toplam: t.genel.toplam, kisiler: t.genel.kisiler, berabere: t.genel.berabere, enCok: en ? en.oyun : null };
}

/** O yılın gelmiş kilometre taşları (gün sayıları ve yıl dönümleri). */
export function kilometreTaslari(baslangic, yil, bugun = new Date()) {
  if (!parseDay(baslangic)) return [];
  const t = gunStr(bugun);
  const son = t < `${yil}-12-31` ? t : `${yil}-12-31`;
  return milestonesBetween(baslangic, `${yil}-01-01`, son);
}

/**
 * Tüm özet. veri = { baslangic, mesajlar, dokunuslar, anilar, gs, skor, mesajAsildi }.
 * ids = [benId, partnerId] (oyun sayaçları bu sırayla).
 */
export function yilOzeti(veri, { yil, bugun = new Date(), ids = [] }) {
  const t = gunStr(bugun);
  return {
    yil,
    buYil: parseDay(t).y === yil,
    birlikteGun: birlikteGun(veri.baslangic, yil, t),
    mesaj: mesajOzeti(veri.mesajlar, yil),
    mesajAsildi: !!veri.mesajAsildi,
    ani: aniOzeti(veri.anilar, yil),
    soru: soruOzeti(veri.gs, yil, t),
    oyun: oyunOzeti(veri.skor, ids, yil),
    dokunus: dokunusOzeti(veri.dokunuslar, yil),
    taslar: kilometreTaslari(veri.baslangic, yil, t),
  };
}

// ---------- Hikâye kartları ----------

const adOf = (kisiler, i) => kisiler?.[i]?.ad || (i === 0 ? 'Sen' : 'Sevgilin');
const kisiSatiri = (sayac, kisiler) => `${(kisiler || []).map((k, i) => `${adOf(kisiler, i)} ${sayiYaz(sayac[k.id] || 0)}`).join(', ')}.`;

/**
 * Kart dizisi: { id, ton, baslik, vurgu?, satirlar: [], liste?: [{ sol, sag }], not? }.
 * Verisi olmayan kart atlanır. ton: 'hero' | 'gece' | 1–6 (base.css --tint-N).
 */
export function hikayeKartlari(ozet, { kisiler = [], oyunAdi = (id) => id, dokunusAdi = (t) => t } = {}) {
  const o = ozet;
  const adlar = `${adOf(kisiler, 0)} ve ${adOf(kisiler, 1)}`;
  const kartlar = [];
  const ekle = (k) => kartlar.push({ satirlar: [], ...k, satirlar: (k.satirlar || []).filter(Boolean) });

  ekle({
    id: 'kapak', ton: 'hero', baslik: `${adlar}, ${o.yil}`, vurgu: String(o.yil),
    satirlar: [
      o.birlikteGun ? (o.buYil ? `Bu yıl şimdiye dek ${sayiYaz(o.birlikteGun)} gün birliktesiniz.` : `O yıl ${sayiYaz(o.birlikteGun)} gün birlikteydiniz.`) : null,
      'Kaydır, yılınızı birlikte hatırlayalım.',
    ],
  });

  const m = o.mesaj;
  const veriVar = m.sayi || o.ani.sayi || o.soru.gun || o.oyun.toplam || o.dokunus.sayi;
  if (m.sayi) {
    const k = {
      id: 'mesaj', ton: 1, baslik: `Birbirinize ${sayiYaz(m.sayi)} mesaj yazdınız.`, vurgu: sayiYaz(m.sayi),
      satirlar: [
        kisiSatiri(m.kisiler, kisiler),
        m.enYogunGun ? `En çok yazıştığınız gün ${gunYazi(m.enYogunGun.gun, { yil: false })}: ${sayiYaz(m.enYogunGun.sayi)} mesaj.` : null,
        m.enYogunAy && m.sayi > 1 ? `En hareketli ay ${AY_ADLARI[m.enYogunAy.ay - 1]}.` : null,
      ],
    };
    if (o.mesajAsildi) k.not = `Çok yazışmışsınız: yalnız son ${sayiYaz(MESAJ_SINIRI)} mesaja bakabildik.`;
    ekle(k);
  }
  if (m.tepki) {
    ekle({ id: 'tepki', ton: 2, baslik: `En sevdiğiniz tepki ${m.tepki.emoji}`, vurgu: m.tepki.emoji,
      satirlar: [`${sayiYaz(m.tepki.sayi)} kez bıraktınız.`] });
  }
  if (m.gece) {
    ekle({ id: 'gece', ton: 'gece', baslik: `${sayiYaz(m.gece)} mesaj gece yarısından sonra yazıldı.`, vurgu: sayiYaz(m.gece),
      satirlar: ['Uykudan çalınmış sohbetler: 00.00 ile 06.00 arası.'] });
  }
  const a = o.ani;
  if (a.sayi) {
    ekle({
      id: 'ani', ton: 3, baslik: `${sayiYaz(a.sayi)} anı biriktirdiniz.`, vurgu: sayiYaz(a.sayi),
      satirlar: [
        a.etiket ? `En sık etiket: ${a.etiket.etiket}.` : null,
        a.yer ? `En çok gittiğiniz yer: ${a.yer.yer}${a.yer.sayi > 1 ? ` (${sayiYaz(a.yer.sayi)} kez)` : ''}.` : null,
        a.foto ? `Toplam ${sayiYaz(a.foto)} fotoğraf.` : null,
      ],
    });
  }
  if (o.soru.gun) {
    ekle({ id: 'soru', ton: 6, baslik: `Günün Sorusu'nu ${sayiYaz(o.soru.gun)} gün birlikte cevapladınız.`, vurgu: sayiYaz(o.soru.gun),
      satirlar: [o.soru.enUzun > 1 ? `En uzun seriniz ${sayiYaz(o.soru.enUzun)} gün.` : null] });
  }
  const g = o.oyun;
  if (g.toplam) {
    const [x = 0, y = 0] = g.kisiler;
    ekle({
      id: 'oyun', ton: 4, baslik: `${sayiYaz(g.toplam)} maç oynadınız.`, vurgu: sayiYaz(g.toplam),
      satirlar: [
        `${adOf(kisiler, 0)} ${sayiYaz(x)}, ${adOf(kisiler, 1)} ${sayiYaz(y)}${g.berabere ? `, ${sayiYaz(g.berabere)} berabere` : ''}.`,
        g.enCok ? `En çok oynadığınız: ${oyunAdi(g.enCok)}.` : null,
        x === y ? 'Başa baş bir yıl.' : `Bu yılın şampiyonu ${adOf(kisiler, x > y ? 0 : 1)}.`,
      ],
    });
  }
  const dk = o.dokunus;
  if (dk.sayi) {
    ekle({
      id: 'dokunus', ton: 5, baslik: `Birbirinize ${sayiYaz(dk.sayi)} dokunuş gönderdiniz.`, vurgu: sayiYaz(dk.sayi),
      satirlar: [kisiSatiri(dk.kisiler, kisiler), dk.enCok ? `En sevileni: ${dokunusAdi(dk.enCok)}.` : null],
    });
  }
  if (o.taslar.length) {
    ekle({ id: 'taslar', ton: 2, baslik: 'Bu yılın kilometre taşları',
      liste: o.taslar.map((t) => ({ sol: t.baslik, sag: gunYazi(t.date, { yil: false }) })) });
  }
  if (!veriVar) {
    ekle({ id: 'bos', ton: 1, baslik: 'Bu yıl henüz sessiz.',
      satirlar: ['Birlikte yazdıkça, oynadıkça burası dolacak.'] });
  }
  ekle({ id: 'paylas', ton: 'hero', baslik: 'Yılınız tek karede.', satirlar: ['Saklayın ya da birbirinize gönderin.'] });
  return kartlar;
}

/** Paylaşılabilir görselin içeriği: { yil, adlar, sayilar: [{ deger, etiket }] (en çok 6), emoji }. */
export function gorselOzeti(ozet, { kisiler = [] } = {}) {
  const o = ozet;
  const sayilar = [
    [o.mesaj.sayi, 'mesaj'],
    [o.ani.sayi, 'anı'],
    [o.oyun.toplam, 'maç'],
    [o.dokunus.sayi, 'dokunuş'],
    [o.soru.gun, 'gün soru'],
    [o.birlikteGun, 'gün birlikte'],
  ].filter(([n]) => n > 0).slice(0, 6).map(([n, etiket]) => ({ deger: sayiYaz(n), etiket }));
  return { yil: o.yil, adlar: `${adOf(kisiler, 0)} & ${adOf(kisiler, 1)}`, sayilar, emoji: o.mesaj.tepki?.emoji || null };
}
