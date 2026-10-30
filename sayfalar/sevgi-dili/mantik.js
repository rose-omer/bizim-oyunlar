// Sevgi Dili Testi: diller, 30 ikili soru ve saf puanlama (DOM yok, Node'da test edilir).
// Veri: tür 'sevgidili', id = clientId, data { puanlar: { soz, zaman, hediye, hizmet, dokunma }, at: ISO }.

export const DILLER = [
  {
    id: 'soz', ad: 'Sözlerle ifade', emoji: '💬',
    ozet: 'İçten bir iltifat, bir teşekkür, bir "seninle gurur duyuyorum" kalbine doğrudan gider.',
    oneriler: [
      'Bugün ona neden sevdiğini anlatan üç cümlelik bir mesaj yaz.',
      'Aynaya ya da çantasına küçük bir not bırak.',
      'Başkalarının yanında onunla gurur duyduğunu söyle.',
    ],
  },
  {
    id: 'zaman', ad: 'Birlikte zaman', emoji: '⏳',
    ozet: 'Bölünmemiş ilgi: telefonlar kenarda, yalnızca ikiniz ve sohbetiniz.',
    oneriler: [
      'Telefonsuz bir akşam planla.',
      'Haftada bir akşamı "ikimizin akşamı" ilan et.',
      'Akşam yürüyüşünde gününü sor ve sözünü kesmeden dinle.',
    ],
  },
  {
    id: 'hediye', ad: 'Hediye', emoji: '🎁',
    ozet: 'Fiyatı değil, düşünülmüş olmak önemli: "Bunu görünce aklıma sen geldin."',
    oneriler: [
      'Yolda onu hatırlatan küçük bir şey al.',
      'Sohbette bahsettiği bir şeyi not et, sürpriz yap.',
      'Elinle hazırladığın bir şey ver: bir kart, bir şarkı listesi, bir kurabiye.',
    ],
  },
  {
    id: 'hizmet', ad: 'Yardım ve hizmet', emoji: '🤲',
    ozet: 'Yükünü hafifletmek sözlerden daha çok şey söyler.',
    oneriler: [
      'Sıkıldığı bir işi o istemeden üstlen.',
      'Yoğun gününde ona sıcak bir yemek hazırla.',
      'Bu hafta yapılacaklar listesinden bir maddeyi onun yerine bitir.',
    ],
  },
  {
    id: 'dokunma', ad: 'Dokunma ve yakınlık', emoji: '🫂',
    ozet: 'Bir sarılma, el ele yürümek, yan yana oturmak: yakınlık güven ve huzur verir.',
    oneriler: [
      'Eve gelince uzun ve sıkı sarıl.',
      'Film izlerken elini tut.',
      'Yanından geçerken omzuna dokun, saçını okşa.',
    ],
  },
];

export const DIL_IDS = DILLER.map((d) => d.id);

export function dilById(id) {
  return DILLER.find((d) => d.id === id) || null;
}

const s = (id, aDil, aMetin, bDil, bMetin) => ({ id, a: { dil: aDil, metin: aMetin }, b: { dil: bDil, metin: bMetin } });

/** 30 ikili: 10 dil çifti × 3. Her dil 12 kez, 6'sı solda 6'sı sağda. */
export const SORULAR = [
  s('s01', 'soz', 'Sevgilimin bana "seninle gurur duyuyorum" demesi', 'zaman', 'Telefonları kenara bırakıp baş başa bir akşam geçirmek'),
  s('s02', 'hediye', 'Beni düşündüğünü gösteren küçük bir sürpriz hediye', 'hizmet', 'Yorgun geldiğimde yemeğin hazır olması'),
  s('s03', 'dokunma', 'Eve gelince uzun ve sıkı bir sarılma', 'soz', 'Gün ortasında "seni düşünüyorum" mesajı almak'),
  s('s04', 'zaman', 'Uzun bir yürüyüşte gönlümüzce sohbet etmek', 'hediye', 'Bir yolculuktan bana hatıra getirmesi'),
  s('s05', 'hizmet', 'Sıkıldığım bir işi ben istemeden üstlenmesi', 'dokunma', 'Yürürken elimi tutması'),
  s('s06', 'soz', 'Emeğimin fark edilip içtenlikle takdir edilmesi', 'hediye', 'Sebepsiz yere çiçek alması'),
  s('s07', 'zaman', 'Birlikte yeni bir hobi ya da kurs denemek', 'hizmet', 'Hastayken bana çorba yapıp ilaçlarımı hatırlatması'),
  s('s08', 'hediye', 'Doğum günümde özenle seçilmiş bir hediye', 'dokunma', 'Film izlerken yanına sokulmak'),
  s('s09', 'hizmet', 'Yoğun günümde ayak işlerimi halletmesi', 'soz', 'Herkesin önünde benim hakkımda güzel şeyler söylemesi'),
  s('s10', 'dokunma', 'Yorgun olduğumda omuzlarıma masaj yapması', 'zaman', 'Hafta sonunu yalnızca ikimize ayırmak'),
  s('s11', 'hizmet', 'Bozulan bir şeyi benim için tamir etmesi', 'hediye', 'Sohbette bahsettiğim bir şeyi hatırlayıp alması'),
  s('s12', 'soz', 'Uzun, içten bir mektup okumak', 'dokunma', 'Yanımdan geçerken saçımı okşaması'),
  s('s13', 'hediye', 'Elleriyle yaptığı bir şeyi bana vermesi', 'zaman', 'Anlattıklarımı gözümün içine bakarak dinlemesi'),
  s('s14', 'dokunma', 'Kalabalıkta elini omzuma koyması', 'hizmet', 'Ben uyurken bulaşıkları bitirmiş olması'),
  s('s15', 'hediye', 'Yoldan geçerken en sevdiğim tatlıdan getirmesi', 'soz', 'Zor bir günde "yapabilirsin, yanındayım" duymak'),
  s('s16', 'hizmet', 'Önemli bir işimde elinden geldiğince yardım etmesi', 'zaman', 'Birlikte yemek hazırlayıp sofrayı kurmak'),
  s('s17', 'dokunma', 'Uyumadan önce sarılarak konuşmak', 'hediye', 'Özel bir günümüz için bir anı eşyası hazırlaması'),
  s('s18', 'soz', 'İçten bir iltifat duymak', 'hizmet', 'Sabah çayımı ya da kahvemi hazırlayıp getirmesi'),
  s('s19', 'zaman', 'Plansız bir günü yan yana geçirmek', 'dokunma', 'Üzgünken hiçbir şey demeden sarılması'),
  s('s20', 'zaman', 'Birlikte kısa bir kaçamağa çıkmak', 'soz', 'Küçük bir şey için bile teşekkür edilmesi'),
  s('s21', 'hizmet', 'Taşınma ya da toplanma gününde kolları sıvaması', 'dokunma', 'Sabah ilk iş bir kucaklama'),
  s('s22', 'soz', 'Bana neden âşık olduğunu kendi cümleleriyle anlatması', 'hediye', 'Kapıda beni bekleyen sürpriz bir paket'),
  s('s23', 'zaman', 'Akşam çayını sohbet ederek birlikte içmek', 'hizmet', 'Faturalar, randevular gibi işleri benim yerime takip etmesi'),
  s('s24', 'hediye', 'Bana özel hazırlanmış bir şarkı listesi', 'dokunma', 'Konuşurken elini elimin üstüne koyması'),
  s('s25', 'hizmet', 'Evi toparlamama sormadan yardım etmesi', 'soz', 'Sabah ilk iş tatlı bir "günaydın" mesajı almak'),
  s('s26', 'dokunma', 'Ayrılırken alnıma bir öpücük kondurması', 'zaman', 'Sevdiğim bir diziyi onunla birlikte izlemek'),
  s('s27', 'soz', 'Yastığımın üstünde küçük bir sevgi notu bulmak', 'zaman', 'Kahvaltıyı acele etmeden birlikte yapmak'),
  s('s28', 'hediye', 'Uzun zamandır istediğim bir şeyi sürpriz yapması', 'hizmet', 'Sınavım ya da sunumum varken her şeyi kolaylaştırması'),
  s('s29', 'dokunma', 'Kanepede başımı dizine koymama izin vermesi', 'soz', 'Bir tartışmadan sonra "haklısın, özür dilerim" duymak'),
  s('s30', 'zaman', 'Yoğun bir haftada bile bana bir saat ayırması', 'hediye', 'Çantamda beklemediğim küçük bir hediye bulmak'),
];

/** Soru dengesi: her dil eşit sayıda, her dil çifti eşit sayıda, aynı dil karşılaşmaz, metinler tekil. -> hata listesi */
export function dengeHatalari(sorular) {
  const errs = [];
  const sayi = Object.fromEntries(DIL_IDS.map((d) => [d, 0]));
  const sol = Object.fromEntries(DIL_IDS.map((d) => [d, 0]));
  const cift = new Map();
  const metinler = new Set();
  const ids = new Set();
  const beklenen = (sorular.length * 2) / DIL_IDS.length;
  for (const q of sorular) {
    if (ids.has(q.id)) errs.push(`tekrarlanan id ${q.id}`);
    ids.add(q.id);
    const a = q.a?.dil;
    const b = q.b?.dil;
    if (!(a in sayi) || !(b in sayi)) { errs.push(`${q.id}: bilinmeyen dil`); continue; }
    if (a === b) errs.push(`${q.id}: aynı dil karşılaşıyor`);
    sayi[a]++; sayi[b]++; sol[a]++;
    const key = [a, b].sort().join('-');
    cift.set(key, (cift.get(key) || 0) + 1);
    for (const m of [q.a.metin, q.b.metin]) {
      const n = String(m || '').trim().toLocaleLowerCase('tr');
      if (!n) errs.push(`${q.id}: boş metin`);
      if (metinler.has(n)) errs.push(`${q.id}: tekrarlanan metin`);
      metinler.add(n);
    }
  }
  for (const d of DIL_IDS) {
    if (sayi[d] !== beklenen) errs.push(`${d}: ${sayi[d]} kez (beklenen ${beklenen})`);
    if (Math.abs(sol[d] * 2 - sayi[d]) > 1) errs.push(`${d}: sol/sağ dengesiz`);
  }
  const ciftSayisi = (DIL_IDS.length * (DIL_IDS.length - 1)) / 2;
  if (cift.size !== ciftSayisi) errs.push(`dil çifti sayısı ${cift.size} (beklenen ${ciftSayisi})`);
  const adet = new Set(cift.values());
  if (adet.size > 1) errs.push(`dil çiftleri eşit sayıda değil: ${[...cift].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  return errs;
}

const bosPuan = () => Object.fromEntries(DIL_IDS.map((d) => [d, 0]));

/** cevaplar[i] = 'a' | 'b' | null. -> { soz, zaman, hediye, hizmet, dokunma } */
export function puanla(sorular, cevaplar) {
  const p = bosPuan();
  sorular.forEach((q, i) => {
    const c = cevaplar?.[i];
    if (c === 'a' || c === 'b') p[q[c].dil]++;
  });
  return p;
}

/** Tam sayı yüzdeler, toplam 100 (en büyük kalan yöntemi). Hepsi 0 ise hepsi 0. */
export function yuzdeler(puanlar) {
  const vals = DIL_IDS.map((d) => Math.max(0, Number(puanlar?.[d]) || 0));
  const toplam = vals.reduce((a, b) => a + b, 0);
  if (!toplam) return bosPuan();
  const ham = vals.map((v) => (v * 100) / toplam);
  const taban = ham.map(Math.floor);
  let kalan = 100 - taban.reduce((a, b) => a + b, 0);
  const sira = ham.map((v, i) => ({ i, r: v - taban[i] })).sort((x, y) => y.r - x.r || x.i - y.i);
  for (const { i } of sira) {
    if (kalan <= 0) break;
    taban[i]++;
    kalan--;
  }
  return Object.fromEntries(DIL_IDS.map((d, i) => [d, taban[i]]));
}

/** Büyükten küçüğe dil sırası (eşitlikte DILLER sırası). */
export function siralama(puanlar) {
  return [...DIL_IDS].sort((a, b) => (puanlar?.[b] || 0) - (puanlar?.[a] || 0) || DIL_IDS.indexOf(a) - DIL_IDS.indexOf(b));
}

/** En yüksek puanlı dil(ler). Hiç puan yoksa []. */
export function birincil(puanlar) {
  const max = Math.max(0, ...DIL_IDS.map((d) => Number(puanlar?.[d]) || 0));
  if (!max) return [];
  return DIL_IDS.filter((d) => (Number(puanlar?.[d]) || 0) === max);
}

/** İki sonucu karşılaştırır. Satırlar toplam yüzdeye göre büyükten küçüğe. */
export function karsilastir(benPuan, partnerPuan) {
  const yb = yuzdeler(benPuan);
  const yp = yuzdeler(partnerPuan);
  const satirlar = DIL_IDS
    .map((dil) => ({ dil, ben: yb[dil], partner: yp[dil] }))
    .sort((x, y) => y.ben + y.partner - (x.ben + x.partner) || DIL_IDS.indexOf(x.dil) - DIL_IDS.indexOf(y.dil));
  const benBirincil = birincil(benPuan);
  const partnerBirincil = birincil(partnerPuan);
  let enFarkli = null;
  let fark = -1;
  for (const dil of DIL_IDS) {
    const f = Math.abs(yb[dil] - yp[dil]);
    if (f > fark) { fark = f; enFarkli = dil; }
  }
  return {
    satirlar, benBirincil, partnerBirincil,
    ortak: benBirincil.filter((d) => partnerBirincil.includes(d)),
    enFarkli,
  };
}

/** İlk cevaplanmamış sorunun sırası; hepsi doluysa n. */
export function ilerleme(cevaplar, n = SORULAR.length) {
  for (let i = 0; i < n; i++) if (cevaplar?.[i] !== 'a' && cevaplar?.[i] !== 'b') return i;
  return n;
}

/** Yarım kalan testin taslağı (JSON) → n uzunlukta 'a' | 'b' | null dizisi. Bozuksa boş taslak. */
export function taslakCoz(metin, n = SORULAR.length) {
  let arr = null;
  try { arr = JSON.parse(metin); } catch { /* bozuk taslak */ }
  return Array.from({ length: n }, (_, i) => (Array.isArray(arr) && (arr[i] === 'a' || arr[i] === 'b') ? arr[i] : null));
}

/** Saklanan puanlar geçerli mi? (5 dil, 0..30 tam sayı, toplam 1..30) */
export function gecerliPuanlar(p) {
  if (!p || typeof p !== 'object') return false;
  let toplam = 0;
  for (const d of DIL_IDS) {
    const v = p[d];
    if (!Number.isInteger(v) || v < 0 || v > SORULAR.length) return false;
    toplam += v;
  }
  return toplam > 0 && toplam <= SORULAR.length;
}

/** Türkçe ilgi eki: "Gül" → "Gül'ün", "Ayşe" → "Ayşe'nin". Ad yoksa "Sevgilinin". */
export function ilgiEki(ad) {
  const t = String(ad ?? '').trim();
  if (!t || t === 'Sevgilin') return 'Sevgilinin';
  const low = t.toLocaleLowerCase('tr');
  const sesliler = low.match(/[aeıioöuü]/g);
  const son = sesliler ? sesliler[sesliler.length - 1] : 'e';
  const ek = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' }[son];
  const sesliBiter = 'aeıioöuü'.includes(low[low.length - 1]);
  return `${t}'${sesliBiter ? 'n' : ''}${ek}`;
}

/** "Gül'ün dili 'Birlikte zaman'" */
export function oneriBasligi(ad, dilId) {
  return `${ilgiEki(ad)} dili '${dilById(dilId)?.ad ?? ''}'`;
}
