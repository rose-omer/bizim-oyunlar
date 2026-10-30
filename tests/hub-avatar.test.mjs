// Avatar büyütme: erişilebilir ad, basılı tutma süresi, Node'da sessiz çalışma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../js/core/ui.js';

test('buyutEtiketi: Türkçe tamlayan ekiyle', () => {
  assert.equal(ui.buyutEtiketi('Gül'), "Gül'ün fotoğrafını büyüt");
  assert.equal(ui.buyutEtiketi('Ömer'), "Ömer'in fotoğrafını büyüt");
  assert.equal(ui.buyutEtiketi('Ayşe'), "Ayşe'nin fotoğrafını büyüt");
  assert.equal(ui.buyutEtiketi(''), 'Fotoğrafı büyüt');
  assert.equal(ui.buyutEtiketi(null), 'Fotoğrafı büyüt');
});

test('UZUN_BASMA_MS ≈ 450 ms', () => {
  assert.equal(ui.UZUN_BASMA_MS, 450);
});

test('fotoBuyut ve geriyleKapat dışa aktarılır; Node\'da hata vermez', () => {
  assert.equal(typeof ui.fotoBuyut, 'function');
  assert.equal(typeof ui.geriyleKapat, 'function');
  assert.equal(typeof ui.avatarEl, 'function');
  const kapat = ui.fotoBuyut({ src: 'x.jpg', ad: 'Gül' });
  assert.equal(typeof kapat, 'function');
  assert.doesNotThrow(() => kapat());
  const birak = ui.geriyleKapat(() => {});
  assert.equal(typeof birak, 'function');
  assert.doesNotThrow(() => birak());
});
