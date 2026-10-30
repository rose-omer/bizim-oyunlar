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
  assert.deepEqual(ui.partnerWhere({ clientId: 'a', name: 'A', page: 'lobby' }, 'yapboz'), { kind: 'on', text: 'çevrimiçi' });
  const away = ui.partnerWhere({ clientId: 'a', name: 'A', page: 'hafiza' }, 'yapboz');
  assert.equal(away.kind, 'away');
  assert.equal(away.text, "Hafıza Kartları'nda");
  assert.equal(ui.partnerWhere({ clientId: 'a', name: 'A', page: 'yapboz' }, 'yapboz').kind, 'here');
});
