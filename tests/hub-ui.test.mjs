// Ana sayfa / ortak arayüz: saf yardımcılar ve sözleşme dışa aktarımları (DOM yok).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../js/core/ui.js';
import * as sound from '../js/core/sound.js';
import { GAMES } from '../js/core/games.js';

test('ui.js sözleşme §9 dışa aktarımları', () => {
  for (const name of ['mountShell', 'toast', 'celebrate', 'waitForPartner', 'confirmDialog', 'shareInvite']) {
    assert.equal(typeof ui[name], 'function', name);
  }
});

test('sound.js sözleşme §9 dışa aktarımları; Node\'da sessizce geçer', () => {
  for (const name of ['sfx', 'setMuted', 'isMuted']) assert.equal(typeof sound[name], 'function', name);
  assert.doesNotThrow(() => sound.sfx('win'));
  assert.doesNotThrow(() => sound.sfx('yok-boyle-ses'));
  const before = sound.isMuted();
  sound.setMuted(!before);
  assert.equal(sound.isMuted(), !before);
  sound.setMuted(before);
});

test('locative: oyun adlarına doğru bulunma eki', () => {
  const byId = Object.fromEntries(GAMES.map((g) => [g.id, ui.locative(g.title)]));
  assert.equal(byId.yapboz, "Yapboz'da");
  assert.equal(byId.aynikafa, "Aynı Kafa'da");
  assert.equal(byId.dogruluk, "Doğruluk mu Cesaret mi'de");
  assert.equal(byId.hafiza, "Hafıza Kartları'nda");
  assert.equal(byId.ciz, "Çiz Bakalım'da");
  assert.equal(byId.tanis, 'Beni Ne Kadar Tanıyorsun? oyununda');
  assert.equal(ui.locative('Kitap'), "Kitap'ta");
  assert.equal(ui.locative('Ev'), "Ev'de");
  assert.equal(ui.locative('Süt'), "Süt'te");
  assert.equal(ui.locative(''), '');
});

test('initial: Türkçe büyük harf, boş ad', () => {
  assert.equal(ui.initial('ilknur'), 'İ');
  assert.equal(ui.initial('  ayşe '), 'A');
  assert.equal(ui.initial('ırmak'), 'I');
  assert.equal(ui.initial(''), '?');
  assert.equal(ui.initial(null), '?');
});

test('formatDay: bugün, dün, gün önce, tarih', () => {
  const now = new Date(2026, 9, 30, 21, 0); // 30 Ekim 2026
  assert.equal(ui.formatDay(new Date(2026, 9, 30, 0, 5), now), 'bugün');
  assert.equal(ui.formatDay(new Date(2026, 9, 29, 23, 59), now), 'dün');
  assert.equal(ui.formatDay(new Date(2026, 9, 27, 12), now), '3 gün önce');
  assert.equal(ui.formatDay(new Date(2026, 9, 12, 12), now), '12 Ekim');
  assert.equal(ui.formatDay(new Date(2025, 11, 31, 12), now), '31 Aralık 2025');
  assert.equal(ui.formatDay('bozuk', now), '');
  assert.equal(ui.formatDay(new Date(2026, 9, 12, 12).toISOString(), now), '12 Ekim');
});

test('partnerWhere: çevrimdışı, çevrimiçi, başka oyunda, burada', () => {
  assert.deepEqual(ui.partnerWhere(null, 'yapboz'), { kind: 'off', text: 'çevrimdışı' });
  assert.deepEqual(ui.partnerWhere({ clientId: 'a', name: 'A', page: 'bilinmeyen' }, 'yapboz'), { kind: 'on', text: 'çevrimiçi' });
  const away = ui.partnerWhere({ clientId: 'a', name: 'A', page: 'hafiza' }, 'yapboz');
  assert.equal(away.kind, 'away');
  assert.equal(away.text, "Hafıza Kartları'nda");
  assert.equal(ui.partnerWhere({ clientId: 'a', name: 'A', page: 'yapboz' }, 'yapboz').kind, 'here');
});

test('partnerWhere: uygulama sayfaları (SAYFALAR) ve ana sayfa', () => {
  const at = (page, ns = 'yapboz') => ui.partnerWhere({ clientId: 'a', name: 'A', page }, ns);
  assert.equal(at('lobby').text, 'ana sayfada');
  assert.equal(at('lobby').kind, 'on');
  assert.equal(at('sohbet').text, "Sohbet'te");
  assert.equal(at('anilar').text, 'Anılarda');
  assert.equal(at('gunler').text, "Özel Günler'de");
  assert.equal(at('gunsorusu').text, "Günün Sorusu'nda");
  assert.equal(at('randevu').text, "Randevu Fikirleri'nde");
  assert.equal(at('ayarlar').text, "Ayarlar'da");
  assert.equal(at('sohbet').sayfa.id, 'sohbet');
  assert.equal(at('sohbet', 'sohbet').kind, 'here');
  assert.equal(at('lobby', 'lobby').kind, 'here');
});

test('genitive: Türkçe tamlayan eki', () => {
  assert.equal(ui.genitive('Ömer'), "Ömer'in");
  assert.equal(ui.genitive('Gül'), "Gül'ün");
  assert.equal(ui.genitive('Ayşe'), "Ayşe'nin");
  assert.equal(ui.genitive('Can'), "Can'ın");
  assert.equal(ui.genitive('Umut'), "Umut'un");
  assert.equal(ui.genitive('Duygu'), "Duygu'nun");
  assert.equal(ui.genitive(''), '');
});

test('parseTema: geçerli değerler, varsayılanlar', () => {
  assert.deepEqual(ui.parseTema(null), { renk: 'pembe', mod: 'otomatik', tema: 'pamuk' });
  assert.deepEqual(ui.parseTema('{"renk":"mor","mod":"koyu"}'), { renk: 'mor', mod: 'koyu', tema: 'pamuk' });
  assert.deepEqual(ui.parseTema({ renk: 'mavi' }), { renk: 'mavi', mod: 'otomatik', tema: 'pamuk' });
  assert.deepEqual(ui.parseTema({ renk: 'yesil', mod: 'gece', tema: 'yok' }), { renk: 'pembe', mod: 'otomatik', tema: 'pamuk' });
  assert.deepEqual(ui.parseTema({ tema: 'iznik' }), { renk: 'pembe', mod: 'otomatik', tema: 'iznik' });
  assert.deepEqual(ui.parseTema('bozuk{'), { renk: 'pembe', mod: 'otomatik', tema: 'pamuk' });
  for (const r of ui.TEMA_RENKLER) assert.equal(ui.parseTema({ renk: r }).renk, r);
  for (const m of ui.TEMA_MODLAR) assert.equal(ui.parseTema({ mod: m }).mod, m);
  assert.deepEqual(ui.readTema(), { renk: 'pembe', mod: 'otomatik', tema: 'pamuk' }); // Node: depo yok
});

test('TOUCHES: sözleşmedeki 5 tür, cümleler', () => {
  assert.deepEqual(ui.TOUCHES.map((t) => t.tur), ['kalp', 'opucuk', 'sarilma', 'ozledim', 'dusunuyorum']);
  assert.equal(ui.touchByTur('kalp').cumle('Gül'), 'Gül sana 💗 gönderdi');
  assert.equal(ui.touchByTur('ozledim').cumle('Ömer'), 'Ömer seni özledi 🥺');
  assert.equal(ui.touchByTur('yok'), null);
  for (const name of ['listenTouches', 'showTouch', 'touchBurst', 'mountTabBar', 'removeTabBar', 'startAppServices', 'applyTheme', 'fotoSrc']) {
    assert.equal(typeof ui[name], 'function', name);
  }
  assert.doesNotThrow(() => ui.touchBurst('💗')); // Node: sessizce geçer
});

test('fotoSrc: yalnız bizim kova ya da local:; dış adres ve bozuk değer null', async () => {
  const { SUPABASE_URL, PHOTO_BUCKET } = await import('../js/config.js');
  assert.equal(await ui.fotoSrc('https://kotu.example/iz.png'), null);
  assert.equal(await ui.fotoSrc('http://kotu.example/a.jpg'), null);
  assert.equal(await ui.fotoSrc('javascript:alert(1)'), null);
  assert.equal(await ui.fotoSrc(''), null);
  assert.equal(await ui.fotoSrc(null), null);
  if (SUPABASE_URL) {
    const ok = `${SUPABASE_URL.replace(/\/*$/, '')}/storage/v1/object/public/${PHOTO_BUCKET}/odaabcdefg/x.jpg`;
    assert.equal(await ui.fotoSrc(ok), ok);
    assert.equal(await ui.fotoSrc(`${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/../baska/x.jpg`), null);
  }
});
