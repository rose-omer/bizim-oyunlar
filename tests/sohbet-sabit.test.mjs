import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SABIT_EN_COK, sabitYamasi, sabitMi, sabitBirlestir, ozet } from '../sayfalar/sohbet/mantik.js';

const at = (gun, saat = 12) => new Date(Date.UTC(2026, 9, gun, saat)).toISOString();
const mesaj = (id, data = {}, { guncel = at(1), olus = at(1), ...ek } = {}) => ({
  id, author: 'a', data: { metin: id, kimden: 'a', ...data }, created_at: olus, updated_at: guncel, ...ek,
});

test('sabit yaması: { sabit: { at, kim } }; sabitse kaldırır; eski belgede gönderen korunur', () => {
  assert.equal(SABIT_EN_COK, 10);
  const d = mesaj('m1');
  assert.deepEqual(sabitYamasi(d, 'b', '2026-10-31T10:00:00.000Z'), { sabit: { at: '2026-10-31T10:00:00.000Z', kim: 'b' } });
  const sabit = mesaj('m1', { sabit: { at: at(2), kim: 'a' } });
  assert.deepEqual(sabitYamasi(sabit, 'b', at(3)), { sabit: null }); // kim sabitlediyse sabitlesin, ikisi de kaldırır
  const eski = { id: 'm2', author: 'a', data: { metin: 'x' } };
  assert.deepEqual(sabitYamasi(eski, 'b', at(3)), { sabit: { at: at(3), kim: 'b' }, kimden: 'a' });
});

test('sabitMi: yalnız geçerli { at } nesnesi', () => {
  assert.equal(sabitMi(mesaj('a', { sabit: { at: at(2), kim: 'a' } })), true);
  assert.equal(sabitMi(mesaj('a', { sabit: null })), false);
  assert.equal(sabitMi(mesaj('a', { sabit: true })), false);
  assert.equal(sabitMi(mesaj('a', { sabit: { kim: 'a' } })), false);
  assert.equal(sabitMi(mesaj('a', { sabit: { at: at(2) } }, { deleted: true })), false);
  assert.equal(sabitMi(null), false);
});

test('sabitBirlestir: sabitleri ekler, kaldırılanı ve sileni çıkarır; en son sabitlenen başta', () => {
  const a = mesaj('a', { sabit: { at: at(2), kim: 'a' } }, { guncel: at(2) });
  const b = mesaj('b', { sabit: { at: at(5), kim: 'b' } }, { guncel: at(5) });
  const c = mesaj('c'); // sabit değil
  let r = sabitBirlestir([], [a, c, b]);
  assert.equal(r.degisti, true);
  assert.deepEqual(r.liste.map((d) => d.id), ['b', 'a']);

  // Değişiklik yok: aynı belgeler yeniden gelir.
  r = sabitBirlestir(r.liste, [a, b, c]);
  assert.equal(r.degisti, false);

  // Kaldırma (daha yeni sürüm sabitsiz) ve silme.
  const aKalkti = mesaj('a', {}, { guncel: at(6) });
  const bSilindi = { ...b, deleted: true, updated_at: at(7) };
  r = sabitBirlestir(r.liste, [aKalkti]);
  assert.deepEqual(r.liste.map((d) => d.id), ['b']);
  r = sabitBirlestir(r.liste, [bSilindi]);
  assert.deepEqual(r.liste, []);
});

test('sabitBirlestir: eski sürüm yeniyi ezmez; onaylı sürüm bekleyeni ezer', () => {
  const yeni = mesaj('a', {}, { guncel: at(9) });
  const sabitEski = mesaj('a', { sabit: { at: at(2), kim: 'a' } }, { guncel: at(2) });
  let r = sabitBirlestir([mesaj('a', { sabit: { at: at(8), kim: 'b' } }, { guncel: at(8) })], [sabitEski]);
  assert.equal(r.degisti, false); // gecikmiş eski sürüm
  r = sabitBirlestir(r.liste, [yeni]);
  assert.deepEqual(r.liste, []);

  // İyimser (bekleyen) yazma istemci saatiyle ileride olabilir: sunucu onayı yine de yerleşir.
  const bekleyen = mesaj('x', { sabit: { at: at(20), kim: 'a' } }, { guncel: at(20), pending: true });
  const onayli = mesaj('x', { sabit: { at: at(20), kim: 'a' } }, { guncel: at(10) });
  r = sabitBirlestir([], [bekleyen]);
  assert.equal(r.liste[0].pending, true);
  r = sabitBirlestir(r.liste, [onayli]);
  assert.equal(r.degisti, true);
  assert.equal(r.liste[0].pending, undefined);
  assert.equal(r.liste[0].updated_at, at(10));
});

test('sabitBirlestir: önbellekte belgenin yalnız gereken alanları durur; bozuk girdi atlanır', () => {
  const a = { ...mesaj('a', { sabit: { at: at(2), kim: 'a' } }), fazla: 'x' };
  const r = sabitBirlestir([], [a, null, { data: {} }]);
  assert.deepEqual(Object.keys(r.liste[0]).sort(), ['author', 'created_at', 'data', 'id', 'updated_at']);
  assert.equal(ozet(r.liste[0].data), 'a');
});
