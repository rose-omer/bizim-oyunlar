// Sohbet Özetimiz: iPhone dışa aktarımı (.zip) içinden sohbet metnini çıkarır. npm yok.
// Merkezi dizin okunur; yöntem 0 = saklı, 8 = DecompressionStream('deflate-raw'). Tarayıcıda ve Node 25'te çalışır.

const EOCD = 0x06054b50;
const MERKEZ = 0x02014b50;
const YEREL = 0x04034b50;

/** Bayt dizisi ZIP mi? ("PK\x03\x04") */
export function zipMi(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

/** Merkezi dizindeki girdiler. -> [{ ad, yontem, boy, acikBoy, yerel }] */
export function zipGirdileri(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === EOCD) { e = i; break; }
  }
  if (e < 0) throw new Error('ZIP dosyası okunamadı.');
  const sayi = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  if (p === 0xffffffff || sayi === 0xffff) throw new Error('Bu ZIP biçimi desteklenmiyor. .txt dosyasını seçmeyi dene.');
  const cozucu = new TextDecoder('utf-8');
  const girdiler = [];
  for (let i = 0; i < sayi; i++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== MERKEZ) throw new Error('ZIP dosyası bozuk görünüyor.');
    const yontem = v.getUint16(p + 10, true);
    const boy = v.getUint32(p + 20, true);
    const acikBoy = v.getUint32(p + 24, true);
    const adBoy = v.getUint16(p + 28, true);
    const ekBoy = v.getUint16(p + 30, true);
    const notBoy = v.getUint16(p + 32, true);
    const yerel = v.getUint32(p + 42, true);
    const ad = cozucu.decode(b.subarray(p + 46, p + 46 + adBoy));
    girdiler.push({ ad, yontem, boy, acikBoy, yerel });
    p += 46 + adBoy + ekBoy + notBoy;
  }
  return girdiler;
}

/** Sohbet metni girdisi: önce `_chat.txt`, yoksa ilk `.txt` (macOS gizli dosyaları hariç). */
export function sohbetGirdisi(girdiler) {
  const txt = girdiler.filter((g) => /\.txt$/i.test(g.ad) && !/(^|\/)__MACOSX\/|(^|\/)\._/.test(g.ad));
  return txt.find((g) => /(^|\/)_chat\.txt$/i.test(g.ad)) || txt[0] || null;
}

async function girdiBaytlari(b, g) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(g.yerel, true) !== YEREL) throw new Error('ZIP dosyası bozuk görünüyor.');
  const bas = g.yerel + 30 + v.getUint16(g.yerel + 26, true) + v.getUint16(g.yerel + 28, true);
  const veri = b.subarray(bas, bas + g.boy);
  if (g.yontem === 0) return veri;
  if (g.yontem !== 8) throw new Error('Bu ZIP sıkıştırması desteklenmiyor.');
  if (typeof DecompressionStream !== 'function') throw new Error('Bu tarayıcı ZIP açamıyor. .txt dosyasını seçmeyi dene.');
  const akis = new Blob([veri]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(akis).arrayBuffer());
}

/** ZIP'ten sohbet metni (UTF-8, BOM atılır). Metin yoksa hata. */
export async function zipMetni(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const g = sohbetGirdisi(zipGirdileri(b));
  if (!g) throw new Error('ZIP içinde sohbet metni (.txt) bulunamadı.');
  const metin = new TextDecoder('utf-8').decode(await girdiBaytlari(b, g));
  return metin.replace(/^﻿/, '');
}

/** Seçilen dosyanın metni: ZIP ise içinden, değilse düz metin. file = File/Blob. */
export async function dosyaMetni(file) {
  const b = new Uint8Array(await file.arrayBuffer());
  if (zipMi(b)) return zipMetni(b);
  return new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
}
